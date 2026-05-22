# Asset Aggregation Implementation - Deployment Guide

## Status: ✅ COMPLETE

All code is implemented and committed to `feature/preact-ui-migration` branch.

---

## Part 1: Apply SQL Migration ✅

The Edge Function has been deployed. Now apply the SQL migration:

### Steps:

1. **Open Supabase Dashboard**
   - Go to: https://supabase.com/dashboard/project/ugqfxklleekniuujohcm

2. **Navigate to SQL Editor**
   - Click **SQL Editor** in left sidebar
   - Click **New Query**

3. **Copy and Paste Migration**
   - Open: `supabase/migrations/004_asset_summaries_triggers.sql`
   - Copy entire file contents
   - Paste into SQL Editor

4. **Execute**
   - Click **Run** button (or Ctrl+Enter)
   - Wait for completion (~2-5 seconds)
   - Check for success message

### What gets created:
- `asset_summaries` table with pre-computed totals
- 4 PostgreSQL functions for aggregation
- 6 triggers on `portfolio` and `assets` tables
- Automatic backfill for existing users

---

## Part 2: Configure Scheduled Job

The Edge Function runs at **4 PM weekdays (Mon-Fri)** via scheduled job.

### Setup Steps:

1. **Go to Database → Scheduled Jobs**
   - https://supabase.com/dashboard/project/ugqfxklleekniuujohcm/database/scheduled-jobs

2. **Create New Job**
   - Click **New Job**
   - Name: `daily_asset_snapshot`
   - Schedule: `0 9 * * 1-5` (9 AM UTC = 4 PM Vietnam time)
   - Function: `http_post` or similar

3. **Configure HTTP Request**
   - Method: POST
   - URL: `https://ugqfxklleekniuujohcm.supabase.co/functions/v1/daily-asset-snapshot`
   - Headers: `Authorization: Bearer <YOUR_SERVICE_ROLE_KEY>`

   To get SERVICE_ROLE_KEY:
   - Go to **Settings → API**
   - Copy **Service Role** (labeled `service_role`)

4. **Save and Test**
   - Click **Create**
   - Optional: Click **Run Now** to test immediately

---

## Verification

### Check Triggers Are Working:

1. **Add a test portfolio item**:
   ```sql
   INSERT INTO portfolio (user_id, symbol, quantity, avg_price, current_price)
   VALUES (auth.uid(), 'VNM', 10, 50000, 52000);
   ```

2. **Check if summary updated**:
   ```sql
   SELECT * FROM asset_summaries WHERE user_id = auth.uid();
   ```
   
   Should show:
   - `total_portfolio: 520000` (52000 × 10)
   - `portfolio_breakdown`: {"VNM": {...}}
   - `updated_at`: (current time)

### Check Edge Function Logs:

1. Go to **Dashboard → Functions → daily-asset-snapshot**
2. Click **Invocations** tab
3. Should see entries at 4 PM each weekday

---

## Code Changes Summary

| File | Change |
|------|--------|
| `supabase/migrations/004_asset_summaries_triggers.sql` | New: SQL triggers + functions |
| `supabase/functions/daily-asset-snapshot/index.ts` | New: Edge Function (deployed) |
| `src/background/handlers/netWorth.js` | Updated: Read from `asset_summaries` |
| `src/ui-preact/components/NetWorthSummary.jsx` | Updated: Display portfolio vs assets |
| `src/extension/styles-preact.css` | Added: 170 lines of net-worth CSS |
| `supabase/README.md` | Updated: Deployment docs |

---

## Next Steps

1. ✅ Edge Function deployed
2. ⏳ **Apply SQL migration** (do this in Supabase Dashboard)
3. ⏳ **Create scheduled job** (do this in Supabase Dashboard)
4. Test: Add assets/portfolio items and verify summary updates
5. Merge PR to main

---

## Questions?

- Check Supabase logs: Dashboard → Edge Functions → Invocations
- Check DB logs: Dashboard → Database → Query Performance
- View real-time: Dashboard → SQL Editor → `SELECT * FROM asset_summaries`

**All implementation complete! Just need to apply migration + schedule job in dashboard.** ✅
