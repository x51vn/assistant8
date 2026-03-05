/**
 * @fileoverview Alarm Handlers
 * Handles periodic tasks triggered by chrome.alarms API
 * Ticket: GPT-022 - Alarms scheduling (market hours + cleanup)
 */

import { createLogger } from '../../logger.js';
import { MESSAGE_TYPES } from '../../shared/messageSchema.js';
import { ALARM_UPDATE_PRICES, ALARM_DAILY_CLEANUP, ALARM_PROMPT_IMPROVEMENT_PURGE } from '../../shared/appConstants.js';
import { generateCorrelationId } from '../../logger.js';
import { route } from '../messageRouter.js';
import { isMarketHours } from '../utils/marketHours.js';
import { _performSessionCheck } from './sessionManager.js';

const logger = createLogger('Alarms');

// Alarm name for commodity (gold/crypto) price updates
export const ALARM_UPDATE_COMMODITY_PRICES = 'updateCommodityPrices';

/**
 * Handle alarm event
 * @param {chrome.alarms.Alarm} alarm - Alarm that triggered
 */
export async function handleAlarm(alarm) {
  const correlationId = generateCorrelationId();
  
  try {
    logger.info('Alarm triggered', { correlationId, name: alarm.name });

    // UPDATE_PRICES alarm - Update portfolio stock prices from SSI
    if (alarm.name === ALARM_UPDATE_PRICES || alarm.name === 'updateStockPrices') {
      logger.info('UPDATE_PRICES alarm triggered', { correlationId });
      
      // Check if market is open
      if (!isMarketHours()) {
        logger.info('Skipping price update - market closed', {
          correlationId,
          currentHour: new Date().getHours()
        });
        return;
      }
      
      try {
        // Call route() directly — reliable even when side panel is closed
        const response = await route({
          v: 1,
          type: MESSAGE_TYPES.PORTFOLIO_UPDATE_PRICES,
          correlationId,
          timestamp: Date.now()
        }, { id: 'alarm' });
        
        if (!response) {
          logger.warn('No response from portfolio price update handler', { correlationId });
        } else if (response.errorCode) {
          logger.error('Price update failed', {
            correlationId,
            error: response.errorMessage
          });
        } else {
          logger.info('Price update completed', {
            correlationId,
            updated: response.updated,
            failed: response.failed
          });
        }
      } catch (error) {
        logger.error('UPDATE_PRICES alarm failed', { correlationId, error: error.message });
      }
      return;
    }

    // UPDATE_COMMODITY_PRICES alarm - Update gold & crypto prices (24/7)
    if (alarm.name === ALARM_UPDATE_COMMODITY_PRICES || alarm.name === 'updateCommodityPrices') {
      logger.info('UPDATE_COMMODITY_PRICES alarm triggered', { correlationId });
      
      try {
        // Call route() directly — reliable even when side panel is closed
        const response = await route({
          v: 1,
          type: MESSAGE_TYPES.COMMODITY_UPDATE_ASSET_PRICES,
          correlationId,
          timestamp: Date.now()
        }, { id: 'alarm' });
        
        if (!response) {
          logger.warn('No response from commodity price update handler', { correlationId });
        } else if (response.errorCode) {
          logger.error('Commodity price update failed', {
            correlationId,
            error: response.errorMessage
          });
        } else {
          logger.info('Commodity price update completed', {
            correlationId,
            updated: response.updated,
            goldUpdated: response.results?.gold?.length || 0,
            cryptoUpdated: response.results?.crypto?.length || 0
          });
        }
      } catch (error) {
        logger.error('UPDATE_COMMODITY_PRICES alarm failed', { correlationId, error: error.message });
      }
      return;
    }

    // WATCHLIST_PRICE_UPDATE alarm - Update Supabase watchlist prices (market hours only)
    // XST-744: Real-time price updates from Supabase
    if (alarm.name === 'watchlistPriceUpdate') {
      logger.info('WATCHLIST_PRICE_UPDATE alarm triggered', { correlationId });

      // Market hours check is done in the handler (for logging consistency)
      // Alarm fires every 5 minutes regardless, handler decides to skip

      try {
        // Call route() directly — reliable even when side panel is closed
        const response = await route({
          v: 1,
          type: MESSAGE_TYPES.XNEEWS_PRICE_UPDATE,
          correlationId,
          timestamp: Date.now()
        }, { id: 'alarm' });
        
        if (!response) {
          logger.warn('No response from watchlist price update handler', { correlationId });
        } else if (response.errorCode) {
          logger.error('Watchlist price update failed', {
            correlationId,
            error: response.errorMessage
          });
        } else if (response.skipped) {
          logger.debug('Watchlist price update skipped', {
            correlationId,
            reason: response.reason
          });
        } else {
          logger.info('Watchlist price update completed', {
            correlationId,
            itemsCount: response.itemsCount
          });
        }
      } catch (error) {
        logger.error('WATCHLIST_PRICE_UPDATE alarm failed', { correlationId, error: error.message });
      }
      return;
    }

    // FSD-001: WATCHLIST_BG_PRICE_FETCH alarm — fetch live prices from providers (always-on alerts)
    if (alarm.name === 'watchlistBgPriceFetch') {
      logger.info('WATCHLIST_BG_PRICE_FETCH alarm triggered', { correlationId });

      try {
        const response = await route({
          v: 1,
          type: MESSAGE_TYPES.WATCHLIST_BG_PRICE_FETCH,
          correlationId,
          timestamp: Date.now()
        }, { id: 'alarm' });

        if (!response) {
          logger.warn('No response from watchlist bg price fetch handler', { correlationId });
        } else if (response.errorCode) {
          logger.error('Watchlist bg price fetch failed', {
            correlationId,
            error: response.errorMessage
          });
        } else if (response.skipped) {
          logger.debug('Watchlist bg price fetch skipped', {
            correlationId,
            reason: response.reason
          });
        } else {
          logger.info('Watchlist bg price fetch completed', {
            correlationId,
            updated: response.updated,
            failed: response.failed,
            latencyMs: response.latencyMs
          });
        }
      } catch (error) {
        logger.error('WATCHLIST_BG_PRICE_FETCH alarm failed', { correlationId, error: error.message });
      }
      return;
    }

    // ✅ SESSION_CHECK alarm - Check if session is about to expire (every 1 minute)
    // Calls internal function directly - NO chrome.runtime.sendMessage()
    // Guaranteed to execute even if UI closed/SW restarted
    if (alarm.name === 'SESSION_CHECK') {
      logger.debug('SESSION_CHECK alarm triggered', { correlationId });
      
      try {
        // Call directly - reliable execution regardless of UI state
        const result = await _performSessionCheck(correlationId);
        
        logger.debug('Session check completed', {
          correlationId,
          status: result.status,
          authenticated: result.authenticated,
          minutesUntilExpiry: result.minutesUntilExpiry
        });
      } catch (error) {
        logger.error('SESSION_CHECK alarm failed', { correlationId, error: error.message });
      }
      return;
    }

    // DAILY_CLEANUP alarm - Cleanup old data
    if (alarm.name === ALARM_DAILY_CLEANUP || alarm.name === 'dailyCleanup') {
      logger.info('DAILY_CLEANUP alarm triggered', { correlationId });
      
      try {
        // Note: Cleanup logic would go here
        // For now, just log that cleanup was triggered
        // Implementation would call Supabase to:
        // - Delete chat_history older than X days (keep last 100)
        // - Delete resolved errors older than 30 days
        
        logger.info('Cleanup completed', { correlationId });
      } catch (error) {
        logger.error('DAILY_CLEANUP alarm failed', { correlationId, error: error.message });
      }
      return;
    }

    // PROMPT_IMPROVEMENT_PURGE alarm - Purge expired prompt_runs (7d) and prompt_lessons
    if (alarm.name === ALARM_PROMPT_IMPROVEMENT_PURGE || alarm.name === 'promptImprovementPurge') {
      logger.info('PROMPT_IMPROVEMENT_PURGE alarm triggered', { correlationId });

      try {
        const response = await route({
          v: 1,
          type: MESSAGE_TYPES.PROMPT_IMPROVEMENT_PURGE,
          correlationId,
          timestamp: Date.now()
        }, { id: 'alarm' });

        if (!response || response.errorCode) {
          logger.error('Prompt improvement purge failed', {
            correlationId,
            error: response?.errorMessage
          });
        } else {
          logger.info('Prompt improvement purge completed', {
            correlationId,
            purgedRuns: response.purgedRuns,
            purgedLessons: response.purgedLessons
          });
        }
      } catch (error) {
        logger.error('PROMPT_IMPROVEMENT_PURGE alarm failed', { correlationId, error: error.message });
      }
      return;
    }

    // Unknown alarm - log as info for debugging
    logger.info('Unknown alarm type', { correlationId, name: alarm.name });

  } catch (error) {
    logger.error('Alarm handler error', { correlationId, name: alarm.name, error: error.message });
  }
}

logger.info('Alarms handler registered');
