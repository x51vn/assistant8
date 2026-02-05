# Schema Audit Report - ChatGPT Assistant
**Date**: 2026-02-01  
**Status**: ✅ **All schemas are ALIGNED**

---

## Executive Summary

Reviewed all 7 migrations against code handlers and UI to verify schema consistency.

**Result**: No critical mismatches found. All code properly reflects database schema constraints.

---

## Migration Inventory & Status

### Migration 001: `initial_schema.sql` ✅
**Tables Created**:
- `users` (extended profile, optional)
- `categories` (categories for prompts)
- `prompts` (prompt templates)
- `chat_history` (ChatGPT conversations)
- `portfolio` (stock holdings)
- `errors` (error tracking)
- `settings` (user config JSONB)
- `runs` (execution tracking)

**Issues Found**: None
- All tables have proper `user_id` + RLS policies
- `errors.severity` initially: `('critical', 'high', 'warning', 'info')` — ⚠️ **Fixed in migration 007**

---

### Migration 002: `fix_chat_id_nullable.sql` ✅
**Changes**: Makes `chat_history.chat_id` nullable

**Verification**:
- ✅ Code allows: `chat_id: chat_id || null` in `chatHistory.js`
- ✅ Schema comment: "⚠️ XST-689: chat_id is nullable"

---

### Migration 003: `create_assets_tables.sql` ✅
**Tables Created**:
- `assets` (user assets with fields: name, asset_type, quantity, unit_price, current_value, currency, liquidity, risk_level, institution, account_number, maturity_date, interest_rate, location, notes, is_active)
- `asset_history` (daily snapshots)

**Constraint Check**:
```sql
CHECK (asset_type IN ('cash', 'savings', 'real_estate', 'crypto', 'gold', 'vehicle', 'other'))
```

**Code Expectation** (`assets.js`):
```javascript
const VALID_ASSET_TYPES = ['cash', 'savings', 'real_estate', 'crypto', 'gold', 'vehicle', 'debt', 'other'];
```

**Issue Found**: ⚠️ **Handler includes `debt` but migration 003 doesn't**
- Migration 005 adds `debt` → ✅ **Fixed** (processed sequentially)

---

### Migration 004: `asset_summaries_triggers.sql` ✅
**Table Created**:
- `asset_summaries` (pre-computed totals: user_id, total_portfolio, total_assets, total_net_worth, portfolio_breakdown, assets_breakdown)

**Trigger Functions**:
1. `trigger_portfolio_summary_update()` — updates on portfolio INSERT/UPDATE/DELETE
2. `trigger_assets_summary_update()` — updates on assets INSERT/UPDATE/DELETE

**Verification**:
- ✅ Code reads from this table: `supabase.from('asset_summaries').select(...)`
- ✅ RLS policy: "Users can view own summary"
- ✅ Triggers properly handle debts via aggregation

---

### Migration 005: `add_debt_type.sql` ✅
**Changes**: Updates `assets.asset_type` constraint to include `'debt'`

**Verification**:
- ✅ Code validation allows `'debt'`
- ✅ Net worth calculation handles debts: `if (type === 'debt') { totalDebts += value; }`

---

### Migration 006: `create_english_table.sql` ✅
**Table Created**:
- `english` (user_id, chat_id, topic, prompt, created_at, updated_at)
- Unique constraint: `(user_id, chat_id)`

**Verification**:
- ✅ Code references: `supabase.from('english')` in `english.js`
- ✅ RLS policies present
- ✅ Idempotent trigger for `updated_at`

---

### Migration 007: `fix_errors_schema.sql` ✅
**Changes**:
1. ✅ Adds `details JSONB` column
2. ✅ Maps legacy severities: `warning` → `medium`, `info` → `low`
3. ✅ Updates constraint: `('low', 'medium', 'high', 'critical')`

**Code Verification** (`errorTracking.js`):
```javascript
const { title, description, severity, type, details } = message.data || {};
// Insert: severity: severity || 'medium'
// Update: if (details !== undefined) updateData.details = details;
```

**Result**: ✅ **Perfect match**

---

## Field-Level Schema Analysis

### Table: `assets`
| Field | Type | Migration | Code Validated |
|-------|------|-----------|---|
| `id` | UUID | 003 | ✅ |
| `user_id` | UUID | 003 | ✅ RLS |
| `name` | VARCHAR(255) | 003 | ✅ Required |
| `asset_type` | VARCHAR(50) | 003→005 | ✅ `VALID_ASSET_TYPES` includes all |
| `quantity` | DECIMAL | 003 | ✅ Parsed as `Number()` |
| `unit_price` | DECIMAL | 003 | ✅ Parsed as `Number()` |
| `current_value` | DECIMAL | 003 | ✅ Required, must be ≥0 |
| `currency` | VARCHAR(10) | 003 | ✅ Default 'VND' |
| `liquidity` | VARCHAR(20) | 003 | ✅ `VALID_LIQUIDITY` enum matched |
| `risk_level` | VARCHAR(20) | 003 | ✅ `VALID_RISK_LEVELS` enum matched |
| `institution` | VARCHAR(255) | 003 | ✅ Optional |
| `account_number` | VARCHAR(100) | 003 | ✅ Optional |
| `maturity_date` | DATE | 003 | ✅ Optional |
| `interest_rate` | DECIMAL | 003 | ✅ Optional |
| `location` | VARCHAR(255) | 003 | ✅ Optional |
| `notes` | TEXT | 003 | ✅ Optional |
| `is_active` | BOOLEAN | 003 | ✅ Default TRUE |
| `created_at` | TIMESTAMPTZ | 003 | ✅ Default NOW() |
| `updated_at` | TIMESTAMPTZ | 003 | ✅ Trigger-managed |

---

### Table: `errors`
| Field | Type | Migration | Code Validated |
|-------|------|-----------|---|
| `id` | UUID | 001 | ✅ |
| `user_id` | UUID | 001 | ✅ RLS |
| `title` | TEXT | 001 | ✅ Required, not empty |
| `description` | TEXT | 001 | ✅ Optional |
| `severity` | TEXT | 001→007 | ✅ Now: `'low'|'medium'|'high'|'critical'` |
| `type` | TEXT | 001 | ✅ `('general'|'prompt'|'response'|'connection'|'timeout')` |
| `timestamp` | BIGINT | 001 | ✅ Unix ms |
| `resolved` | BOOLEAN | 001 | ✅ Default FALSE |
| `resolution_notes` | TEXT | 001 | ✅ Optional |
| `details` | JSONB | 007 | ✅ Optional, used in handlers |
| `created_at` | TIMESTAMPTZ | 001 | ✅ Default NOW() |
| `resolved_at` | TIMESTAMPTZ | 001 | ✅ Optional |

---

### Table: `english`
| Field | Type | Migration | Code Validated |
|-------|------|-----------|---|
| `id` | UUID | 006 | ✅ |
| `user_id` | UUID | 006 | ✅ RLS |
| `chat_id` | TEXT | 006 | ✅ Unique per user (dedupe key) |
| `topic` | TEXT | 006 | ✅ Required |
| `prompt` | TEXT | 006 | ✅ Required |
| `created_at` | TIMESTAMPTZ | 006 | ✅ Default NOW() |
| `updated_at` | TIMESTAMPTZ | 006 | ✅ Trigger-managed |

---

### Table: `chat_history`
| Field | Type | Migration | Code Validated |
|-------|------|-----------|---|
| `id` | UUID | 001 | ✅ |
| `user_id` | UUID | 001 | ✅ RLS |
| `chat_id` | TEXT | 001→002 | ✅ Nullable (migration 002) |
| `chat_url` | TEXT | 001 | ✅ Optional |
| `prompt` | TEXT | 001 | ✅ Required |
| `response` | TEXT | 001 | ✅ Optional |
| `prompt_id` | UUID FK | 001 | ✅ Optional |
| `timestamp` | BIGINT | 001 | ✅ Unix ms |
| `run_id` | TEXT | 001 | ✅ Optional |
| `metadata` | JSONB | 001 | ✅ Optional |
| `created_at` | TIMESTAMPTZ | 001 | ✅ Default NOW() |

---

### Table: `portfolio`
| Field | Type | Migration | Code Validated |
|-------|------|-----------|---|
| `id` | UUID | 001 | ✅ |
| `user_id` | UUID | 001 | ✅ RLS |
| `symbol` | TEXT | 001 | ✅ Stock symbol |
| `quantity` | INTEGER | 001 | ✅ Must be > 0 |
| `avg_price` | DECIMAL(15,2) | 001 | ✅ Average purchase price |
| `current_price` | DECIMAL(15,2) | 001 | ✅ Updated by alarms |
| `notes` | TEXT | 001 | ✅ Optional |
| `created_at` | TIMESTAMPTZ | 001 | ✅ Default NOW() |
| `updated_at` | TIMESTAMPTZ | 001 | ✅ Trigger-managed |
| Unique | (user_id, symbol) | 001 | ✅ One entry per stock per user |

---

### Table: `settings`
| Field | Type | Migration | Code Validated |
|-------|------|-----------|---|
| `user_id` | UUID PK | 001 | ✅ RLS |
| `config` | JSONB | 001 | ✅ Flexible settings object |
| `created_at` | TIMESTAMPTZ | 001 | ✅ Default NOW() |
| `updated_at` | TIMESTAMPTZ | 001 | ✅ Trigger-managed |

---

## Constraint Verification Summary

### Asset Type Constraint
```sql
-- Migration 003 (initial):
CHECK (asset_type IN ('cash', 'savings', 'real_estate', 'crypto', 'gold', 'vehicle', 'other'))

-- Migration 005 (updated):
CHECK (asset_type IN ('cash', 'savings', 'real_estate', 'crypto', 'gold', 'vehicle', 'debt', 'other'))
```

**Code Validation** (`assets.js`):
```javascript
const VALID_ASSET_TYPES = ['cash', 'savings', 'real_estate', 'crypto', 'gold', 'vehicle', 'debt', 'other'];
```

**Status**: ✅ **Perfect match after migration 005**

---

### Error Severity Constraint
```sql
-- Migration 001 (initial):
CHECK (severity IN ('critical', 'high', 'warning', 'info'))

-- Migration 007 (fixed):
CHECK (severity IN ('low', 'medium', 'high', 'critical'))
```

**Code Validation** (`errorTracking.js`):
```javascript
// Defaults to 'medium', accepts all four values
severity: severity || 'medium'
```

**UI & Handler Expected**: `'low'|'medium'|'high'|'critical'`

**Status**: ✅ **Fixed by migration 007 with data migration**

---

## RLS Policy Coverage

| Table | SELECT | INSERT | UPDATE | DELETE | Status |
|-------|--------|--------|--------|--------|--------|
| `users` | ⏳ Optional | ⏳ Optional | ⏳ Optional | ⏳ Optional | ℹ️ Extended profile (not critical) |
| `categories` | ✅ `auth.uid()` | ✅ `auth.uid()` | ✅ `auth.uid()` | ✅ `auth.uid()` | ✅ Complete |
| `prompts` | ✅ `auth.uid()` | ✅ `auth.uid()` | ✅ `auth.uid()` | ✅ `auth.uid()` | ✅ Complete |
| `chat_history` | ✅ `auth.uid()` | ✅ `auth.uid()` | ✅ `auth.uid()` | ✅ `auth.uid()` | ✅ Complete |
| `portfolio` | ✅ `auth.uid()` | ✅ `auth.uid()` | ✅ `auth.uid()` | ✅ `auth.uid()` | ✅ Complete |
| `errors` | ✅ `auth.uid()` | ✅ `auth.uid()` | ✅ `auth.uid()` | ✅ `auth.uid()` | ✅ Complete |
| `settings` | ✅ `auth.uid()` | ✅ `auth.uid()` | ✅ `auth.uid()` | ✅ `auth.uid()` | ✅ Complete |
| `runs` | ✅ `auth.uid()` | ✅ `auth.uid()` | ✅ `auth.uid()` | ✅ `auth.uid()` | ✅ Complete |
| `assets` | ✅ `auth.uid()` | ✅ `auth.uid()` | ✅ `auth.uid()` | ✅ `auth.uid()` | ✅ Complete |
| `asset_history` | ✅ `auth.uid()` | ✅ `auth.uid()` | ✅ `auth.uid()` | ✅ `auth.uid()` | ✅ Complete |
| `asset_summaries` | ✅ `auth.uid()` | ✅ `auth.uid()` | ✅ `auth.uid()` | ❌ Missing | ⚠️ No DELETE policy (acceptable - summaries are derived) |
| `english` | ✅ `auth.uid()` | ✅ `auth.uid()` | ✅ `auth.uid()` | ✅ `auth.uid()` | ✅ Complete |

---

## Findings & Recommendations

### ✅ No Critical Issues Found

**Reason**: 
1. Migration 005 properly adds `'debt'` constraint
2. Migration 007 properly fixes error severity constraint
3. Migration 006 provides the missing `english` table
4. All RLS policies are correctly set
5. All handlers match their respective table schemas

### ⚠️ Minor Observations

1. **`asset_summaries` missing DELETE policy**
   - **Impact**: Low (summaries are computed, not user-controlled)
   - **Current**: SELECT, INSERT, UPDATE policies present
   - **Note**: Users can't directly delete summaries; triggers manage updates

2. **`users` table is optional**
   - **Status**: ✅ Supabase Auth handles primary user management
   - **Current Schema**: Extended profile support (not actively used by handlers)

3. **Migration execution order is critical**
   - ⚠️ Migration 005 must run after 003
   - ⚠️ Migration 007 must run after 001
   - ✅ Current order (001→007) is correct

---

## Conclusion

✅ **All schemas are properly aligned between database migrations and code handlers.**

**No blocking issues.**

**Migrations are ready for production deployment.**

---

## Next Steps

1. ✅ Deploy all 7 migrations in order
2. ✅ Verify asset_summaries triggers work via database logs
3. ✅ Test error tracking with new severity levels
4. ✅ Validate english learning table persists data correctly

**Estimated Migration Runtime**: < 5 seconds (no large data transformations)
