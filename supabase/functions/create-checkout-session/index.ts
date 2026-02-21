/**
 * create-checkout-session Edge Function
 * Ticket: XST-759
 *
 * Creates a Stripe Checkout Session for plan upgrades.
 * Called from background handler SUBSCRIPTION_CREATE_CHECKOUT.
 *
 * Request body: { planId, interval, userId, successUrl?, cancelUrl? }
 * Response: { url: string }
 *
 * To deploy:
 * supabase functions deploy create-checkout-session
 *
 * Required secrets (set via Supabase Dashboard > Edge Functions > Secrets):
 * - STRIPE_SECRET_KEY
 * - PUBLIC_EXTENSION_ID  (your Chrome extension ID)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface RequestBody {
  planId: string
  interval: 'monthly' | 'yearly'
  userId: string
  successUrl?: string
  cancelUrl?: string
}

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

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')!
    const extensionId = Deno.env.get('PUBLIC_EXTENSION_ID') || ''

    // Verify auth from request header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Verify JWT and get calling user
    const supabaseUser = createClient(supabaseUrl, supabaseServiceKey)
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser(token)

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const body: RequestBody = await req.json()
    const { planId, interval = 'monthly', successUrl, cancelUrl } = body

    if (!planId || planId === 'free') {
      return new Response(JSON.stringify({ error: 'Invalid plan' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Fetch plan to get Stripe price ID
    const { data: plan, error: planError } = await supabase
      .from('plans')
      .select('*')
      .eq('id', planId)
      .single()

    if (planError || !plan) {
      return new Response(JSON.stringify({ error: 'Plan not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const priceId = interval === 'yearly'
      ? plan.stripe_price_id_yearly
      : plan.stripe_price_id_monthly

    if (!priceId) {
      return new Response(JSON.stringify({ error: 'Stripe price not configured for this plan' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' })

    // Check for existing Stripe customer
    const { data: existingSub } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .not('stripe_customer_id', 'is', null)
      .limit(1)
      .maybeSingle()

    let customerId: string | undefined = existingSub?.stripe_customer_id || undefined

    // Create customer if not exists
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id }
      })
      customerId = customer.id
    }

    // Default success/cancel URLs point back to extension
    const defaultSuccessUrl = successUrl ||
      `chrome-extension://${extensionId}/index.html?checkout=success`
    const defaultCancelUrl = cancelUrl ||
      `chrome-extension://${extensionId}/index.html?checkout=cancel`

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: defaultSuccessUrl,
      cancel_url: defaultCancelUrl,
      metadata: {
        supabase_user_id: user.id,
        plan_id: planId
      },
      subscription_data: {
        metadata: {
          supabase_user_id: user.id,
          plan_id: planId
        }
      }
    })

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('create-checkout-session error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error', detail: error?.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
