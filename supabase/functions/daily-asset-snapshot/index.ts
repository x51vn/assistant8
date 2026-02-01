/**
 * daily-asset-snapshot Edge Function
 * Runs daily at 4 PM (16:00) on weekdays (Mon-Fri)
 * Creates historical snapshots of user net worth
 * 
 * Ticket: XST-702
 * 
 * Schedule: Configured via Supabase Dashboard > Database > Scheduled Jobs
 * Cron: 0 16 * * 1-5 (4 PM Mon-Fri, Vietnam time UTC+7)
 * 
 * To deploy:
 * supabase functions deploy daily-asset-snapshot
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// CORS headers for Edge Function
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface AssetSummary {
  user_id: string
  total_portfolio: number
  total_assets: number
  total_net_worth: number
  portfolio_breakdown: Record<string, unknown>
  assets_breakdown: Record<string, unknown>
}

interface SnapshotResult {
  user_id: string
  success: boolean
  error?: string
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client with service role for full access
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Get current date in Vietnam timezone (UTC+7)
    const now = new Date()
    const vietnamOffset = 7 * 60 // UTC+7 in minutes
    const utcOffset = now.getTimezoneOffset()
    const vietnamTime = new Date(now.getTime() + (vietnamOffset + utcOffset) * 60 * 1000)
    
    const dayOfWeek = vietnamTime.getDay()
    
    // Skip weekends (Saturday = 6, Sunday = 0)
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Skipped - Weekend',
          vietnamTime: vietnamTime.toISOString()
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const snapshotDate = vietnamTime.toISOString().split('T')[0]

    // Fetch all user summaries
    const { data: summaries, error: fetchError } = await supabase
      .from('asset_summaries')
      .select('*')

    if (fetchError) {
      throw fetchError
    }

    if (!summaries || summaries.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No users with summaries found',
          date: snapshotDate
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create snapshots for each user
    const results: SnapshotResult[] = []

    for (const summary of summaries as AssetSummary[]) {
      try {
        // Combine breakdowns for history
        const combinedBreakdown = {
          ...summary.assets_breakdown,
          stocks: summary.total_portfolio
        }

        // Upsert snapshot (update if exists for today)
        const { error: upsertError } = await supabase
          .from('asset_history')
          .upsert(
            {
              user_id: summary.user_id,
              snapshot_date: snapshotDate,
              total_value: summary.total_net_worth,
              breakdown: combinedBreakdown
            },
            {
              onConflict: 'user_id,snapshot_date'
            }
          )

        if (upsertError) {
          results.push({ 
            user_id: summary.user_id, 
            success: false, 
            error: upsertError.message 
          })
        } else {
          results.push({ 
            user_id: summary.user_id, 
            success: true 
          })
        }
      } catch (err) {
        results.push({ 
          user_id: summary.user_id, 
          success: false, 
          error: String(err) 
        })
      }
    }

    const successCount = results.filter(r => r.success).length
    const failCount = results.filter(r => !r.success).length

    console.log(`[daily-asset-snapshot] Date: ${snapshotDate}, Success: ${successCount}, Failed: ${failCount}`)

    return new Response(
      JSON.stringify({
        success: true,
        date: snapshotDate,
        vietnamTime: vietnamTime.toISOString(),
        totalUsers: summaries.length,
        successCount,
        failCount,
        results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('[daily-asset-snapshot] Error:', error)
    
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: String(error) 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
