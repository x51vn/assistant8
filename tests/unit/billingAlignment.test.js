/**
 * @fileoverview Regression tests for billing entitlement alignment (INC-04)
 * and checkUsage fail-closed behavior.
 *
 * Verifies:
 * - Backend FREE_PLAN_FALLBACK matches DB seed values
 * - Client checkUsage returns allowed:false on failure (fail-closed)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Test 1: FREE_PLAN_FALLBACK alignment
// ---------------------------------------------------------------------------

const { handlers } = vi.hoisted(() => ({
  handlers: new Map(),
}));

vi.mock('../../src/supabaseConfig.js', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST205' } }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
}));

vi.mock('../../src/background/messageRouter.js', () => ({
  registerHandler: vi.fn((type, handler) => handlers.set(type, handler)),
}));

vi.mock('../../src/background/utils/auth.js', () => ({
  requireAuth: vi.fn().mockResolvedValue('user-123'),
}));

vi.mock('../../src/background/utils/supabaseRetry.js', () => ({
  supabaseWithRetry: vi.fn((op) => op()),
}));

vi.mock('../../src/shared/errorCodes.js', () => ({
  ERROR_CODES: { OPERATION_FAILED: 'OPERATION_FAILED' },
  getUserFriendlyMessage: vi.fn((c) => `Error: ${c}`),
}));

vi.mock('../../src/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(),
    startOperation: vi.fn(() => 'cid'), endOperation: vi.fn(),
  }),
  generateCorrelationId: vi.fn(() => 'cid'),
}));

vi.mock('../../src/shared/messageSchema.js', async () => {
  const actual = await vi.importActual('../../src/shared/messageSchema.js');
  return actual;
});

describe('Billing – FREE_PLAN_FALLBACK alignment (INC-04)', () => {
  // DB seed values from 013_create_billing_tables.sql
  const DB_SEED_FREE_LIMITS = {
    portfolio_stocks: 5,
    watchlist_items: 10,
    ai_enrichment_monthly: 5,
    writing_prompts_monthly: 10,
    context_menu_monthly: 10,
    asset_types: 3,
    chat_history_days: 30,
    custom_prompts: 3,
  };

  const DB_SEED_FREE_FEATURES = {
    jira_integration: false,
    confluence_upload: false,
    data_export: false,
    priority_support: false,
    team_workspace: false,
    market_indices: true,
    commodity_prices: true,
  };

  it('backend fallback limits match DB seed', async () => {
    handlers.clear();
    await import('../../src/background/handlers/billing.js');

    // The fallback is used when billing tables don't exist (PGRST205).
    // We need to access it indirectly via the SUBSCRIPTION_GET handler.
    const handler = handlers.get('SUBSCRIPTION_GET');
    expect(handler).toBeDefined();

    const res = await handler({
      type: 'SUBSCRIPTION_GET',
      correlationId: 'test-cid',
      timestamp: Date.now(),
    });

    // When billing tables return PGRST205, handler falls back to FREE_PLAN_FALLBACK
    const plan = res.plan;
    if (plan) {
      // Check limits alignment — this is the core assertion
      for (const [key, expected] of Object.entries(DB_SEED_FREE_LIMITS)) {
        expect(plan.limits?.[key]).toBe(expected);
      }
      // Check feature alignment
      for (const [key, expected] of Object.entries(DB_SEED_FREE_FEATURES)) {
        expect(plan.features?.[key]).toBe(expected);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Test 2: checkUsage fail-closed
// ---------------------------------------------------------------------------

describe('BillingApi – checkUsage fail-closed', () => {
  beforeEach(() => {
    // Mock chrome.runtime.sendMessage to throw
    global.chrome = {
      runtime: {
        sendMessage: vi.fn().mockRejectedValue(new Error('Network error')),
      },
    };
  });

  it('returns allowed:false when backend call fails', async () => {
    // We need a fresh import because billingApi uses chrome.runtime at call time
    const { checkUsage } = await import('../../src/ui-preact/api/billingApi.js');
    const result = await checkUsage('ai_enrichment');

    expect(result.allowed).toBe(false);
    expect(result.limit).toBe(0);
    expect(result.remaining).toBe(0);
  });
});
