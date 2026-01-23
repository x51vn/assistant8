/**
 * @fileoverview Sample Handler Demonstrating Utilities Usage
 * Simple health check handler that verifies Supabase connectivity
 * 
 * Purpose: Demonstrate supabaseWithRetry (GPT-004) and requireAuth (GPT-005) usage
 * Tickets: GPT-004, GPT-005
 */

import { registerHandler } from '../messageRouter.js';
import { MESSAGE_TYPES, createResponse, createErrorResponse } from '../../shared/messageSchema.js';
import { supabase } from '../../supabaseConfig.js';
import { supabaseWithRetry, supabaseQuery } from '../utils/supabaseRetry.js';
import { requireAuth, isAuthenticated } from '../utils/auth.js';
import { ERROR_CODES } from '../../shared/errorCodes.js';
import { logger } from '../../logger.js';

/**
 * HEALTH_CHECK: Verify Supabase connection with retry logic
 * 
 * Request: { type: 'HEALTH_CHECK', correlationId: '...' }
 * Response: { type: 'HEALTH_OK', data: { timestamp, authenticated, userId } }
 * 
 * This handler demonstrates:
 * 1. Using supabaseWithRetry for operations that may fail transiently
 * 2. Proper error handling with user-friendly messages
 * 3. Logging with correlation IDs
 */
registerHandler(MESSAGE_TYPES.PING, async (message) => {
  const { correlationId } = message;
  
  try {
    logger.info('Health check started', { correlationId });

    // Example 1: Using supabaseWithRetry with raw operation
    const healthData = await supabaseWithRetry(
      async () => {
        // This operation may fail with network errors or 5xx
        // It will be retried automatically with exponential backoff
        const { data: { user }, error } = await supabase.auth.getUser();
        
        if (error) {
          throw error;
        }

        return {
          timestamp: Date.now(),
          authenticated: !!user,
          userId: user?.id || null
        };
      },
      {
        operationName: 'healthCheck',
        correlationId,
        maxRetries: 3
      }
    );

    logger.info('Health check succeeded', { 
      correlationId, 
      authenticated: healthData.authenticated 
    });

    return createResponse(message, MESSAGE_TYPES.PONG, healthData);

  } catch (error) {
    logger.error('Health check failed', {
      correlationId,
      errorCode: error.code,
      errorStatus: error.status,
      errorMessage: error.message
    });

    // Map Supabase errors to user-friendly messages
    let errorCode = ERROR_CODES.UNKNOWN_ERROR;
    
    if (error.status === 401 || error.status === 403) {
      errorCode = ERROR_CODES.AUTH_EXPIRED;
    } else if (error.message?.toLowerCase().includes('network')) {
      errorCode = ERROR_CODES.NETWORK_ERROR;
    } else if (error.status >= 500) {
      errorCode = ERROR_CODES.SUPABASE_ERROR;
    }

    return createErrorResponse(
      message,
      errorCode,
      'Không thể kết nối đến server. Vui lòng thử lại.',
      { technicalError: error.message }
    );
  }
});

/**
 * HEALTH_CHECK_DETAILED: Advanced health check using requireAuth
 * 
 * This demonstrates:
 * 1. requireAuth() for mandatory authentication (GPT-005)
 * 2. supabaseQuery convenience wrapper (GPT-004)
 * 3. Proper error response handling
 */
registerHandler('HEALTH_CHECK_DETAILED', async (message) => {
  const { correlationId } = message;
  
  try {
    // GPT-005: Use requireAuth to get user ID
    // This will throw formatted error if not authenticated
    const userId = await requireAuth(message);
    
    logger.info('Authenticated health check', { correlationId, userId });

    // Example: Query user-specific data with retry
    const userData = await supabaseQuery(
      () => supabase.auth.getUser(),
      {
        operationName: 'getAuthUser',
        correlationId
      }
    );

    return createResponse(message, 'HEALTH_OK_DETAILED', {
      timestamp: Date.now(),
      userId,
      user: userData?.user || null,
      authenticated: true
    });

  } catch (error) {
    // If error has errorCode, it's from requireAuth (already formatted)
    if (error.errorCode) {
      return error;
    }
    
    // Handle other errors
    return createErrorResponse(
      message,
      ERROR_CODES.SUPABASE_ERROR,
      'Không thể kiểm tra trạng thái. Vui lòng thử lại.',
      { technicalError: error.message }
    );
  }
});

/**
 * HEALTH_CHECK_PUBLIC: Public health check (no auth required)
 * 
 * This demonstrates optional auth check with isAuthenticated()
 */
registerHandler('HEALTH_CHECK_PUBLIC', async (message) => {
  const { correlationId } = message;
  
  try {
    // Check auth status without throwing
    const authenticated = await isAuthenticated();
    
    logger.info('Public health check', { correlationId, authenticated });

    return createResponse(message, 'HEALTH_OK_PUBLIC', {
      timestamp: Date.now(),
      authenticated,
      message: authenticated 
        ? 'Đã đăng nhập' 
        : 'Chưa đăng nhập'
    });

  } catch (error) {
    return createErrorResponse(
      message,
      ERROR_CODES.UNKNOWN_ERROR,
      'Lỗi kiểm tra. Vui lòng thử lại.',
      { technicalError: error.message }
    );
  }
});

logger.info('Sample handler registered (with supabaseWithRetry)');
