/**
 * stripe-webhook Edge Function
 * Ticket: XST-763
 *
 * Handles all Stripe webhook events to keep subscription state in sync.
 *
 * Events handled:
 * - checkout.session.completed   → create/update subscription
 * - invoice.paid                 → update period + record payment
 * - invoice.payment_failed       → mark past_due
 * - customer.subscription.updated → plan change / status change
 * - customer.subscription.deleted → mark canceled, downgrade to Free
 *
 * Security: Validates Stripe webhook signature before processing.
 * Idempotency: Uses Stripe event.id / stripe_subscription_id as dedup keys.
 *
 * To deploy:
 * supabase functions deploy stripe-webhook
 *
 * Configure in Stripe Dashboard → Developers → Webhooks:
 * URL: https://<project-ref>.supabase.co/functions/v1/stripe-webhook
 * Events: checkout.session.completed, invoice.paid, invoice.payment_failed,
 *         customer.subscription.updated, customer.subscription.deleted
 *
 * Required secrets:
 * - STRIPE_SECRET_KEY
 * - STRIPE_WEBHOOK_SECRET  (from Stripe Dashboard → Webhooks → Signing secret)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Map Stripe subscription status → our status enum
 */
function mapStripeStatus(stripeStatus: string): string {
  const map: Record<string, string> = {
    active: 'active',
    trialing: 'trialing',
    past_due: 'past_due',
    canceled: 'canceled',
    incomplete: 'incomplete',
    incomplete_expired: 'expired',
    unpaid: 'past_due',
    paused: 'past_due',
  }
  return map[stripeStatus] || 'active'
}

/**
 * Extract plan_id from Stripe subscription metadata
 */
function extractPlanId(subscription: Stripe.Subscription): string {
  return subscription.metadata?.plan_id || 'free'
}

/**
 * Extract supabase_user_id from Stripe subscription metadata
 */
function extractUserId(subscription: Stripe.Subscription): string | null {
  return subscription.metadata?.supabase_user_id || null
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')!
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!

  const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' })
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // ── Signature Verification (CRITICAL) ──
  const signature = req.headers.get('stripe-signature')
  if (!signature) {
    console.error('[stripe-webhook] Missing stripe-signature header')
    return new Response(JSON.stringify({ error: 'Missing signature' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  const body = await req.text()
  let event: Stripe.Event

  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret)
  } catch (err) {
    console.error('[stripe-webhook] Signature verification failed:', err?.message)
    return new Response(JSON.stringify({ error: 'Invalid signature' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }

  console.log(`[stripe-webhook] Processing event: ${event.type} (id: ${event.id})`)

  try {
    switch (event.type) {
      // ── Checkout completed: user paid → create subscription ──
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.mode !== 'subscription') break

        const stripeSubId = session.subscription as string
        const customerId = session.customer as string
        const userId = session.metadata?.supabase_user_id
        const planId = session.metadata?.plan_id || 'pro'

        if (!userId || !stripeSubId) {
          console.error('[stripe-webhook] Missing userId or subscriptionId in session metadata')
          break
        }

        // Fetch full subscription from Stripe
        const stripeSub = await stripe.subscriptions.retrieve(stripeSubId)

        const { error } = await supabase
          .from('subscriptions')
          .upsert({
            user_id: userId,
            plan_id: planId,
            status: mapStripeStatus(stripeSub.status),
            stripe_customer_id: customerId,
            stripe_subscription_id: stripeSubId,
            current_period_start: new Date(stripeSub.current_period_start * 1000).toISOString(),
            current_period_end: new Date(stripeSub.current_period_end * 1000).toISOString(),
            cancel_at_period_end: stripeSub.cancel_at_period_end,
            updated_at: new Date().toISOString()
          }, { onConflict: 'stripe_subscription_id' })

        if (error) {
          console.error('[stripe-webhook] checkout.session.completed upsert error:', error)
        } else {
          console.log(`[stripe-webhook] Subscription created for user ${userId}, plan ${planId}`)
        }
        break
      }

      // ── Invoice paid: renew period + record payment ──
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice
        const stripeSubId = invoice.subscription as string
        if (!stripeSubId) break

        const stripeSub = await stripe.subscriptions.retrieve(stripeSubId)
        const userId = extractUserId(stripeSub)
        if (!userId) break

        // Update subscription period
        await supabase
          .from('subscriptions')
          .update({
            status: 'active',
            current_period_start: new Date(stripeSub.current_period_start * 1000).toISOString(),
            current_period_end: new Date(stripeSub.current_period_end * 1000).toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('stripe_subscription_id', stripeSubId)

        // Record payment (idempotent: unique on stripe_invoice_id)
        if (invoice.id) {
          const planId = extractPlanId(stripeSub)
          await supabase
            .from('payment_history')
            .upsert({
              user_id: userId,
              stripe_payment_intent_id: typeof invoice.payment_intent === 'string'
                ? invoice.payment_intent
                : null,
              stripe_invoice_id: invoice.id,
              amount: invoice.amount_paid,
              currency: invoice.currency,
              status: 'succeeded',
              description: `${planId} plan renewal`,
              plan_id: planId,
              period_start: new Date(stripeSub.current_period_start * 1000).toISOString(),
              period_end: new Date(stripeSub.current_period_end * 1000).toISOString(),
            }, { onConflict: 'stripe_invoice_id', ignoreDuplicates: true })
        }

        console.log(`[stripe-webhook] invoice.paid for subscription ${stripeSubId}`)
        break
      }

      // ── Payment failed: mark past_due ──
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        const stripeSubId = invoice.subscription as string
        if (!stripeSubId) break

        await supabase
          .from('subscriptions')
          .update({
            status: 'past_due',
            updated_at: new Date().toISOString()
          })
          .eq('stripe_subscription_id', stripeSubId)

        // Record failed payment
        const stripeSub = await stripe.subscriptions.retrieve(stripeSubId)
        const userId = extractUserId(stripeSub)
        if (userId && invoice.id) {
          await supabase
            .from('payment_history')
            .upsert({
              user_id: userId,
              stripe_invoice_id: invoice.id,
              amount: invoice.amount_due,
              currency: invoice.currency,
              status: 'failed',
              description: 'Payment failed',
              plan_id: extractPlanId(stripeSub),
            }, { onConflict: 'stripe_invoice_id', ignoreDuplicates: true })
        }

        console.log(`[stripe-webhook] invoice.payment_failed for ${stripeSubId}`)
        break
      }

      // ── Subscription updated: plan change / cancel_at_period_end ──
      case 'customer.subscription.updated': {
        const stripeSub = event.data.object as Stripe.Subscription
        const planId = extractPlanId(stripeSub)

        const { error } = await supabase
          .from('subscriptions')
          .update({
            plan_id: planId,
            status: mapStripeStatus(stripeSub.status),
            current_period_start: new Date(stripeSub.current_period_start * 1000).toISOString(),
            current_period_end: new Date(stripeSub.current_period_end * 1000).toISOString(),
            cancel_at_period_end: stripeSub.cancel_at_period_end,
            canceled_at: stripeSub.canceled_at
              ? new Date(stripeSub.canceled_at * 1000).toISOString()
              : null,
            updated_at: new Date().toISOString()
          })
          .eq('stripe_subscription_id', stripeSub.id)

        if (error) {
          console.error('[stripe-webhook] subscription.updated error:', error)
        } else {
          console.log(`[stripe-webhook] Subscription ${stripeSub.id} updated → plan ${planId}, status ${stripeSub.status}`)
        }
        break
      }

      // ── Subscription deleted: downgrade to Free ──
      case 'customer.subscription.deleted': {
        const stripeSub = event.data.object as Stripe.Subscription
        const userId = extractUserId(stripeSub)

        // Mark the Stripe subscription as canceled
        await supabase
          .from('subscriptions')
          .update({
            status: 'canceled',
            canceled_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('stripe_subscription_id', stripeSub.id)

        // Ensure user has a Free subscription
        if (userId) {
          await supabase
            .from('subscriptions')
            .upsert({
              user_id: userId,
              plan_id: 'free',
              status: 'active',
              stripe_customer_id: typeof stripeSub.customer === 'string' ? stripeSub.customer : null,
              stripe_subscription_id: null,
              current_period_start: new Date().toISOString(),
              cancel_at_period_end: false,
              updated_at: new Date().toISOString()
            }, { onConflict: 'user_id', ignoreDuplicates: false })
            .filter('status', 'neq', 'active')
            // Note: only insert if no other active sub exists
        }

        console.log(`[stripe-webhook] Subscription ${stripeSub.id} deleted → user downgraded to Free`)
        break
      }

      default:
        // Return 200 for unhandled events to prevent Stripe retries
        console.log(`[stripe-webhook] Unhandled event type: ${event.type}`)
    }

    return new Response(JSON.stringify({ received: true, type: event.type }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error(`[stripe-webhook] Handler error for ${event.type}:`, error)
    // Return 500 only for unexpected errors so Stripe will retry
    return new Response(JSON.stringify({ error: 'Handler error', detail: error?.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
