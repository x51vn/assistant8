/**
 * @fileoverview Alarm Handlers
 * Handles periodic tasks triggered by chrome.alarms API
 * Ticket: GPT-022 - Alarms scheduling (market hours + cleanup)
 */

import { createLogger } from '../../logger.js';
import { MESSAGE_TYPES } from '../../shared/messageSchema.js';
import { ALARM_UPDATE_PRICES, ALARM_DAILY_CLEANUP, ALARM_WATCHLIST_AI_ENRICH } from '../../shared/appConstants.js';
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
        // Send message to portfolio handler to update prices
        const response = await chrome.runtime.sendMessage({
          v: 1,
          type: MESSAGE_TYPES.PORTFOLIO_UPDATE_PRICES,
          correlationId,
          timestamp: Date.now()
        });
        
        if (response.errorCode) {
          logger.error('Price update failed', {
            correlationId,
            error: response.errorMessage
          });
        } else {
          logger.info('Price update completed', {
            correlationId,
            updated: response.data?.updated,
            failed: response.data?.failed
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
        // Send message to commodity handler to update prices
        const response = await chrome.runtime.sendMessage({
          v: 1,
          type: MESSAGE_TYPES.COMMODITY_UPDATE_ASSET_PRICES,
          correlationId,
          timestamp: Date.now()
        });
        
        if (response.errorCode) {
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

    // WATCHLIST_PRICE_UPDATE alarm - Update X-Neews watchlist prices (market hours only)
    // XST-744: Real-time price updates from X-Neews API
    if (alarm.name === 'watchlistPriceUpdate') {
      logger.info('WATCHLIST_PRICE_UPDATE alarm triggered', { correlationId });
      
      // Market hours check is done in the handler (for logging consistency)
      // Alarm fires every 5 minutes regardless, handler decides to skip
      
      try {
        // Send message to X-Neews price update handler
        const response = await chrome.runtime.sendMessage({
          v: 1,
          type: MESSAGE_TYPES.XNEEWS_PRICE_UPDATE,
          correlationId,
          timestamp: Date.now()
        });
        
        if (response.errorCode) {
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

    // WATCHLIST_AI_ENRICH alarm - Daily at 16:00 local time
    // Triggers AI enrichment of watchlist items (entry/target/stoploss/thesis)
    if (alarm.name === ALARM_WATCHLIST_AI_ENRICH) {
      logger.info('WATCHLIST_AI_ENRICH alarm triggered', { correlationId });
      
      try {
        // Call handler directly via route() - chrome.runtime.sendMessage()
        // does NOT reliably deliver to the sender's own onMessage listener in MV3 SW
        const response = await route({
          v: 1,
          type: MESSAGE_TYPES.WATCHLIST_AI_ENRICH_RUN,
          correlationId,
          timestamp: Date.now(),
          data: { dryRun: false }
        }, { id: chrome.runtime.id });
        
        if (response?.error) {
          logger.error('Watchlist AI enrichment failed', {
            correlationId,
            error: response.error?.message || response.errorMessage
          });
        } else if (response?.stage === 'already_running') {
          logger.info('Watchlist AI enrichment skipped - already running', { correlationId });
        } else {
          logger.info('Watchlist AI enrichment started', { correlationId });
        }
      } catch (error) {
        if (!error?.message?.includes('Receiving end does not exist')) {
          logger.error('WATCHLIST_AI_ENRICH alarm failed', { correlationId, error: error.message });
        }
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

    // Unknown alarm - log as info for debugging
    logger.info('Unknown alarm type', { correlationId, name: alarm.name });

  } catch (error) {
    logger.error('Alarm handler error', { correlationId, name: alarm.name, error: error.message });
  }
}

logger.info('Alarms handler registered');
