/**
 * delete-account Edge Function
 * XST-755: Account Deletion (GDPR Art. 17 - Right to Erasure)
 * 
 * Cascade deletes all user data from all tables, then deletes the auth user.
 * Requires service_role key (admin privileges) - NOT exposed to client.
 * 
 * To deploy:
 * supabase functions deploy delete-account
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// All tables with user_id column that need cascade deletion
const USER_DATA_TABLES = [
  'portfolio',
  'watchlist',
  'assets',
  'asset_history',
  'asset_summaries',
  'chat_history',
  'errors',
  'settings',
  'prompts',
  'categories',
  'english',
  'runs',
]

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Only allow POST
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body
    const { userId, confirmText } = await req.json()

    // Validate confirmation text
    if (confirmText !== 'XÓA TÀI KHOẢN') {
      return new Response(
        JSON.stringify({ error: 'Invalid confirmation text' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify the calling user matches the userId being deleted
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create client with user's token to verify identity
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Verify calling user
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    })
    const { data: { user: callingUser }, error: userError } = await userClient.auth.getUser()
    
    if (userError || !callingUser) {
      return new Response(
        JSON.stringify({ error: 'Authentication failed' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Ensure user can only delete their own account
    if (callingUser.id !== userId) {
      return new Response(
        JSON.stringify({ error: 'Cannot delete another user account' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[delete-account] Starting deletion for user: ${userId}`)

    // Create admin client with service role key
    const adminClient = createClient(supabaseUrl, supabaseServiceKey)

    // Step 1: Delete all user data from every table
    const deletionResults: { table: string; success: boolean; error?: string }[] = []

    for (const table of USER_DATA_TABLES) {
      try {
        const { error: deleteError } = await adminClient
          .from(table)
          .delete()
          .eq('user_id', userId)
        
        if (deleteError) {
          // Some tables might not exist yet - log but continue
          console.warn(`[delete-account] Warning deleting from ${table}:`, deleteError.message)
          deletionResults.push({ table, success: false, error: deleteError.message })
        } else {
          console.log(`[delete-account] Deleted from ${table}`)
          deletionResults.push({ table, success: true })
        }
      } catch (err) {
        console.warn(`[delete-account] Error deleting from ${table}:`, err.message)
        deletionResults.push({ table, success: false, error: err.message })
      }
    }

    // Step 2: Delete auth user (this is permanent!)
    const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(userId)
    
    if (authDeleteError) {
      console.error(`[delete-account] Failed to delete auth user:`, authDeleteError.message)
      return new Response(
        JSON.stringify({ 
          error: 'Failed to delete auth account',
          details: authDeleteError.message,
          dataDeletion: deletionResults
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[delete-account] Successfully deleted user: ${userId}`)

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Account and all data deleted successfully',
        deletionResults
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    console.error('[delete-account] Unexpected error:', err.message)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
