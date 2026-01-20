/**
 * @fileoverview Content Extraction Handlers
 * Handles content extraction and API proxy requests
 */

import { registerHandler } from '../messageRouter.js';
import { MESSAGE_TYPES, createResponse, createErrorResponse } from '../../shared/messageSchema.js';
import { createLogger } from '../../logger.js';

const logger = createLogger('Handlers/Content');

const SSI_API_BASE = 'https://iboard-query.ssi.com.vn';

/**
 * Fetch from SSI API (bypass CORS via background)
 * @param {string} endpoint - API endpoint
 * @param {string} method - HTTP method
 * @param {any} body - Request body
 * @returns {Promise<Object>} API response
 */
async function fetchSSIAPI(endpoint, method = 'GET', body = null) {
  try {
    const url = `${SSI_API_BASE}${endpoint}`;
    logger.info('SSI API proxy request', { method, endpoint });
    
    const options = {
      method: method,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
    };
    
    if (body) {
      options.body = JSON.stringify(body);
    }
    
    const response = await fetch(url, options);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const data = await response.json();
    logger.info('SSI API success', { 
      endpoint,
      status: response.status,
      dataSize: JSON.stringify(data).length,
      dataStructure: {
        hasData: !!data.data,
        topLevelKeys: Object.keys(data).slice(0, 10),
        dataKeys: data.data ? Object.keys(data.data).slice(0, 10) : null
      }
    });
    
    return { success: true, data };
  } catch (error) {
    logger.error('SSI API error', { endpoint, error: error.message });
    return { success: false, error: error.message };
  }
}

/**
 * Handle CONTENT_EXTRACT
 * Extract content from web pages or proxy API requests
 */
registerHandler(MESSAGE_TYPES.CONTENT_EXTRACT, async (message, sender) => {
  const { action, endpoint, method, body } = message.payload || {};
  
  logger.info('Handling CONTENT_EXTRACT', { 
    correlationId: message.correlationId,
    action,
    endpoint 
  });
  
  // Handle SSI API proxy
  if (action === 'fetch_ssi_api') {
    if (!endpoint) {
      return createErrorResponse(message, 'MISSING_ENDPOINT', 'Missing endpoint parameter');
    }
    
    const result = await fetchSSIAPI(endpoint, method, body);
    
    if (!result.success) {
      return createErrorResponse(message, 'API_ERROR', result.error);
    }
    
    return createResponse(message, MESSAGE_TYPES.CONTENT_EXTRACTED, {
      data: result.data
    });
  }
  
  // Unknown action
  return createErrorResponse(message, 'UNKNOWN_ACTION', `Unknown action: ${action}`);
});

logger.info('Content handlers registered');
