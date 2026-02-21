/**
 * create-portal-session Edge Function
 * Ticket: XST-762
 *
 * Creates a Stripe Customer Portal Session for managing subscriptions.
 * Users can update payment methods, cancel, and view billing history.
 *
 * Request body: { userId, returnUrl? }
 * Response: { url: string }
 *
 * To deploy:
 * supabase functions deploy create-portal-session
 *
 * Required secrets:
 * - STRIPE_SECRET_KEY
 * - PUBLIC_EXTENSION_ID
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const body = await req.json()
    const { returnUrl } = body

    // Get Stripe customer ID from subscriptions table
    const { data: sub, error: subError } = await supabaseAdmin
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .not('stripe_customer_id', 'is', null)
      .limit(1)
      .maybeSingle()

    if (subError || !sub?.stripe_customer_id) {
      return new Response(JSON.stringify({ error: 'No Stripe customer found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' })

    const defaultReturnUrl = returnUrl ||
      `chrome-extension://${extensionId}/index.html`

    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: defaultReturnUrl
    })

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    console.error('create-portal-session error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error', detail: error?.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
