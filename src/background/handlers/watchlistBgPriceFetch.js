/**
 * @fileoverview Background Watchlist Price Fetch Handler
 * Ticket: FSD-001 — Watchlist Price Update via Background Fetch (Alerts Always-on)
 *
 * This handler actively fetches live prices from market-data providers (VPS/SSI)
 * during market hours, computes Signals (ediff, pprofit), persists to Supabase,
 * checks price alerts, and broadcasts updates to UI.
 *
 * Key difference from supabasePriceUpdate.js:
 * - supabasePriceUpdate.js only READS existing prices from DB
 * - THIS handler FETCHES new prices from external providers (VPS, SSI)
 *
 * Triggered by:
 * - chrome.alarms (periodic, market hours)
 * - WATCHLIST_MANUAL_REFRESH message (UI manual refresh, rate-limited)
 *
 * Requirements:
 * - FR-WP-01: Always-on even when UI is closed
 * - FR-WP-02: Market hours only (weekday 09:00-15:00 VN)
 * - FR-WP-03: Batch + retry, don't block all if 1 fails
 * - FR-WP-04: Provenance (price_provider, price_updated_at)
 * - FR-WP-05/06: Alert checking after price update
 * - FR-WP-07: Broadcast to UI
 * - FR-WP-08: Manual refresh (rate-limited)
 */

import { registerHandler } from '../messageRouter.js';
import {
  MESSAGE_TYPES,
  createResponse,
  createErrorResponse,
} from '../../shared/messageSchema.js';
import { supabase } from '../../supabaseConfig.js';
import { requireAuth } from '../utils/auth.js';
import { supabaseWithRetry } from '../utils/supabaseRetry.js';
import { isMarketHours } from '../utils/marketHours.js';
import { createLogger, generateCorrelationId } from '../../logger.js';
import { safeBroadcast } from '../../shared/safeBroadcast.js';
import {
  SSI_BATCH_SIZE,
  SSI_BATCH_DELAY_MS,
} from '../../shared/appConstants.js';
import { calcEdiff, calcPprofit, round4 } from '../../shared/watchlistCalc.js';
import { checkPriceAlerts } from './priceAlerts.js';
import { getFeatureFlag } from '../../shared/featureFlags.js';
import { createAllProviders } from '../../market-data/index.js';

const logger = createLogger('WatchlistBgPriceFetch');

// Rate limit: at most 1 manual refresh per 30 seconds
let lastManualRefreshAt = 0;
const MANUAL_REFRESH_COOLDOWN_MS = 30_000;

// ============================================================
// WATCHLIST_BG_PRICE_FETCH — Alarm-triggered background fetch
// ============================================================
registerHandler(MESSAGE_TYPES.WATCHLIST_BG_PRICE_FETCH, async (message) => {
  const correlationId = message.correlationId || generateCorrelationId();

  // Market hours check
  if (!isMarketHours()) {
    logger.debug('Skipping background price fetch — market closed', { correlationId });
    return createResponse(message, MESSAGE_TYPES.WATCHLIST_BG_PRICES_FETCHED, {
      success: true,
      skipped: true,
      reason: 'market_closed',
    });
  }

  return await performBackgroundPriceFetch(message, correlationId);
});

// ============================================================
// WATCHLIST_MANUAL_REFRESH — UI-triggered manual refresh
// ============================================================
registerHandler(MESSAGE_TYPES.WATCHLIST_MANUAL_REFRESH, async (message) => {
  const correlationId = message.correlationId || generateCorrelationId();

  // Rate limit check
  const now = Date.now();
  if (now - lastManualRefreshAt < MANUAL_REFRESH_COOLDOWN_MS) {
    const waitSec = Math.ceil((MANUAL_REFRESH_COOLDOWN_MS - (now - lastManualRefreshAt)) / 1000);
    return createErrorResponse(
      message,
      'RATE_LIMITED',
      `Vui lòng đợi ${waitSec} giây trước khi làm mới lại.`
    );
  }
  lastManualRefreshAt = now;

  return await performBackgroundPriceFetch(message, correlationId);
});

// ============================================================
// Core: performBackgroundPriceFetch
// ============================================================

/**
 * Fetch prices from market-data providers for all watchlist symbols,
 * compute signals, persist, check alerts, broadcast.
 */
async function performBackgroundPriceFetch(message, correlationId) {
  const startTime = Date.now();

  try {
    // 1. Get authenticated user
    let userId;
    try {
      userId = await requireAuth(message);
    } catch {
      // For alarm-triggered calls, try getting session directly
      const { data: { session } } = await supabase.auth.getSession();
      userId = session?.user?.id;
      if (!userId) {
        logger.info('No authenticated user — skipping background price fetch', { correlationId });
        return createResponse(message, MESSAGE_TYPES.WATCHLIST_BG_PRICES_FETCHED, {
          success: true,
          skipped: true,
          reason: 'no_auth',
        });
      }
    }

    // 2. Check feature flag
    const settingsConfig = await getUserSettingsConfig(userId);
    if (!getFeatureFlag('watchlist_background_pricing_v1', settingsConfig)) {
      logger.debug('watchlist_background_pricing_v1 flag is off', { correlationId });
      return createResponse(message, MESSAGE_TYPES.WATCHLIST_BG_PRICES_FETCHED, {
        success: true,
        skipped: true,
        reason: 'feature_disabled',
      });
    }

    // 3. Get watchlist symbols from Supabase
    const watchlistItems = await supabaseWithRetry(async () => {
      const { data, error } = await supabase
        .from('watchlist')
        .select('id, symbol, entry, target, stop_loss, price')
        .eq('user_id', userId);
      if (error) throw error;
      return data || [];
    }, { operationName: 'watchlistBg.getSymbols', correlationId });

    if (watchlistItems.length === 0) {
      logger.debug('Watchlist empty — nothing to update', { correlationId });
      return createResponse(message, MESSAGE_TYPES.WATCHLIST_BG_PRICES_FETCHED, {
        success: true,
        skipped: true,
        reason: 'empty_watchlist',
      });
    }

    const symbols = watchlistItems.map(item => item.symbol);
    logger.info('Background price fetch starting', {
      correlationId,
      symbolCount: symbols.length,
    });

    // 4. Fetch prices from providers (VPS primary, SSI fallback)
    const priceMap = await fetchPricesFromProviders(symbols, correlationId);

    // 5. Compute signals & build update rows
    const updates = [];
    const priceMapForAlerts = {};
    let successCount = 0;
    let failCount = 0;

    for (const item of watchlistItems) {
      const priceResult = priceMap[item.symbol];
      if (!priceResult || !priceResult.price) {
        failCount++;
        continue;
      }

      const price = priceResult.price;
      const entry = item.entry;
      const target = item.target;

      // Compute signals (deterministic)
      const ediff = round4(calcEdiff(price, entry));
      const pprofit = round4(calcPprofit(target, entry));

      updates.push({
        id: item.id,
        price,
        ediff,
        pprofit,
        price_updated_at: new Date().toISOString(),
        price_provider: priceResult.provider,
      });

      priceMapForAlerts[item.symbol] = price;
      successCount++;
    }

    // 6. Persist to Supabase (batch update)
    if (updates.length > 0) {
      // Supabase doesn't support batch update by id natively,
      // so we use individual updates in parallel (bounded)
      const BATCH_SIZE = 10;
      for (let i = 0; i < updates.length; i += BATCH_SIZE) {
        const batch = updates.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(async (upd) => {
          try {
            const { error } = await supabase
              .from('watchlist')
              .update({
                price: upd.price,
                ediff: upd.ediff,
                pprofit: upd.pprofit,
                price_updated_at: upd.price_updated_at,
                price_provider: upd.price_provider,
              })
              .eq('id', upd.id);
            if (error) {
              logger.warn('Failed to update watchlist item', { id: upd.id, error: error.message });
            }
          } catch (err) {
            logger.warn('Exception updating watchlist item', { id: upd.id, error: err.message });
          }
        }));
      }
    }

    // 7. Check price alerts (FR-WP-05/06)
    try {
      await checkPriceAlerts(priceMapForAlerts);
    } catch (alertErr) {
      logger.warn('Price alert check failed (non-critical)', {
        error: alertErr.message,
        correlationId,
      });
    }

    // 8. Broadcast to UI (best-effort)
    safeBroadcast({
      v: 1,
      type: MESSAGE_TYPES.WATCHLIST_BG_PRICES_FETCHED,
      correlationId,
      timestamp: Date.now(),
      items: updates.map(u => ({
        id: u.id,
        price: u.price,
        ediff: u.ediff,
        pprofit: u.pprofit,
        price_provider: u.price_provider,
        price_updated_at: u.price_updated_at,
      })),
    });

    const latency = Date.now() - startTime;
    logger.info('Background price fetch completed', {
      correlationId,
      totalSymbols: symbols.length,
      updated: successCount,
      failed: failCount,
      latencyMs: latency,
    });

    return createResponse(message, MESSAGE_TYPES.WATCHLIST_BG_PRICES_FETCHED, {
      success: true,
      updated: successCount,
      failed: failCount,
      totalSymbols: symbols.length,
      latencyMs: latency,
    });

  } catch (error) {
    logger.error('Background price fetch failed', {
      correlationId,
      error: error.message,
      stack: error.stack,
    });

    return createErrorResponse(
      message,
      'BG_PRICE_FETCH_ERROR',
      `Cập nhật giá watchlist thất bại: ${error.message}`
    );
  }
}

// ============================================================
// Helpers
// ============================================================

/**
 * Fetch prices from VPS (primary) with SSI fallback.
 * Returns map: { SYMBOL: { price, provider } }
 */
async function fetchPricesFromProviders(symbols, correlationId) {
  const providers = createAllProviders();
  const result = {};

  // Split into batches
  const batchSize = SSI_BATCH_SIZE || 5;

  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);

    // Try each provider in priority order
    for (const provider of providers) {
      try {
        const stocks = await provider.getMultipleStocks(batch);
        for (const stock of stocks) {
          if (stock && stock.symbol && stock.matchedPrice > 0) {
            result[stock.symbol] = {
              price: stock.matchedPrice,
              provider: provider.getName?.() || 'unknown',
            };
          } else if (stock && stock.symbol && stock.lastPrice > 0) {
            result[stock.symbol] = {
              price: stock.lastPrice,
              provider: provider.getName?.() || 'unknown',
            };
          }
        }
        // If we got results, no need for fallback for this batch
        const allResolved = batch.every(s => result[s]);
        if (allResolved) break;
      } catch (err) {
        logger.warn(`Provider ${provider.getName?.()} failed for batch`, {
          correlationId,
          error: err.message,
          batch,
        });
        // Continue to next provider (failover)
      }
    }

    // Short delay between batches to respect rate limits
    if (i + batchSize < symbols.length) {
      await new Promise(r => setTimeout(r, SSI_BATCH_DELAY_MS || 500));
    }
  }

  return result;
}

/**
 * Get user settings config from Supabase.
 */
async function getUserSettingsConfig(userId) {
  try {
    const { data } = await supabase
      .from('settings')
      .select('config')
      .eq('user_id', userId)
      .maybeSingle();
    return data?.config || {};
  } catch {
    return {};
  }
}

logger.info('Background Watchlist Price Fetch handler registered');
