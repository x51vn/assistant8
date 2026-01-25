/**
 * @fileoverview Alarm Handlers
 * Handles periodic tasks triggered by chrome.alarms API
 * Ticket: GPT-022 - Alarms scheduling (market hours + cleanup)
 */

import { createLogger } from '../../logger.js';
import { MESSAGE_TYPES } from '../../shared/messageSchema.js';
import { ALARM_UPDATE_PRICES, ALARM_DAILY_CLEANUP, MARKET_OPEN_HOUR, MARKET_CLOSE_HOUR } from '../../shared/appConstants.js';
import { generateCorrelationId } from '../../logger.js';

const logger = createLogger('Alarms');

/**
 * Check if current time is during market hours
 * Vietnam stock market: 9:00 AM - 3:00 PM
 */
function isMarketHours() {
  const now = new Date();
  const hour = now.getHours();
  
  // Market hours: 9:00 - 15:00 (3:00 PM)
  return hour >= MARKET_OPEN_HOUR && hour < MARKET_CLOSE_HOUR;
}

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
