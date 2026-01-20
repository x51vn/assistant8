/**
 * @fileoverview X51LABS-94: Telemetry Handlers
 * Collect selector match statistics for monitoring ChatGPT UI changes
 */

import { registerHandler } from '../messageRouter.js';
import { MESSAGE_TYPES, createResponse } from '../../shared/messageSchema.js';
import { createLogger } from '../../logger.js';

const logger = createLogger('TelemetryHandlers');

// In-memory telemetry storage (could be persisted to storage.local)
const telemetryData = {
  selectorStats: {},
  versionHistory: []
};

/**
 * TELEMETRY_REPORT - Record selector statistics
 */
registerHandler(MESSAGE_TYPES.TELEMETRY_REPORT, async (message, sender) => {
  const correlationId = logger.startOperation('telemetryReport', message.correlationId);
  const { stats, version, timestamp } = message.payload || {};
  
  try {
    // Store version info
    if (version && !telemetryData.versionHistory.some(v => v.version === version)) {
      telemetryData.versionHistory.push({ 
        version, 
        firstSeen: timestamp,
        tabId: sender.tab?.id 
      });
      logger.info('New ChatGPT version detected', { version, correlationId });
    }
    
    // Aggregate selector stats
    if (stats) {
      for (const [chain, data] of Object.entries(stats)) {
        if (!telemetryData.selectorStats[chain]) {
          telemetryData.selectorStats[chain] = {
            matchCount: {},
            lastMatch: null,
            totalCalls: 0
          };
        }
        
        // Merge match counts
        if (data.matchCount) {
          for (const [selector, count] of Object.entries(data.matchCount)) {
            telemetryData.selectorStats[chain].matchCount[selector] = 
              (telemetryData.selectorStats[chain].matchCount[selector] || 0) + count;
          }
        }
        
        telemetryData.selectorStats[chain].lastMatch = data.lastMatch;
        telemetryData.selectorStats[chain].totalCalls++;
      }
    }
    
    logger.debug('Telemetry recorded', { 
      version, 
      chains: Object.keys(stats || {}),
      correlationId 
    });
    
    logger.endOperation(correlationId, 'success');
    return createResponse(message, MESSAGE_TYPES.TELEMETRY_RECORDED, { 
      success: true 
    });
    
  } catch (error) {
    logger.error('Telemetry recording failed', { correlationId, error });
    logger.endOperation(correlationId, 'error', error);
    return createResponse(message, MESSAGE_TYPES.TELEMETRY_RECORDED, { 
      success: false,
      error: error.message 
    });
  }
});

/**
 * Get aggregated telemetry data
 * @returns {object} Telemetry summary
 */
export function getTelemetryData() {
  return {
    ...telemetryData,
    summary: {
      totalVersions: telemetryData.versionHistory.length,
      totalChains: Object.keys(telemetryData.selectorStats).length,
      currentVersion: telemetryData.versionHistory[telemetryData.versionHistory.length - 1]?.version || 'unknown'
    }
  };
}
