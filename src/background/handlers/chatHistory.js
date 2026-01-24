/**
 * @fileoverview Chat History CRUD Handlers
 * Manages chat history operations with Supabase backend
 * 
 * Ticket: GPT-014
 */

import { registerHandler } from '../messageRouter.js';
import { MESSAGE_TYPES, createResponse, createErrorResponse } from '../../shared/messageSchema.js';
import { supabase } from '../../supabaseConfig.js';
import { requireAuth } from '../utils/auth.js';
import { supabaseWithRetry } from '../utils/supabaseRetry.js';
import { ERROR_CODES, getUserFriendlyMessage } from '../../shared/errorCodes.js';
import { MAX_CHAT_HISTORY } from '../../shared/appConstants.js';
import { createLogger } from '../../logger.js';

const logger = createLogger('ChatHistoryHandler');

/**
 * HISTORY_GET_ALL - Get chat history for current user
 */
registerHandler(MESSAGE_TYPES.HISTORY_GET_ALL, async (message) => {
  const correlationId = logger.startOperation('getHistory', message.correlationId);
  const { limit = MAX_CHAT_HISTORY } = message.data || {};
  
  try {
    const userId = await requireAuth(message);
    
    const data = await supabaseWithRetry(
      async () => {
        const { data, error } = await supabase
          .from('chat_history')
          .select('*')
          .eq('user_id', userId)
          .order('timestamp', { ascending: false })
          .limit(Math.min(limit, MAX_CHAT_HISTORY));
        
        if (error) throw error;
        return data;
      },
      {
        operationName: 'getHistory',
        correlationId
      }
    );
    
    logger.endOperation(correlationId, 'success', { count: data.length });
    return createResponse(message, MESSAGE_TYPES.HISTORY_LIST, { history: data });
    
  } catch (error) {
    logger.endOperation(correlationId, 'error', { error: error.message });
    
    if (error.errorCode) {
      return error;
    }
    
    if (error.message?.includes('Failed to fetch')) {
      return createErrorResponse(
        message,
        ERROR_CODES.NETWORK_ERROR,
        getUserFriendlyMessage(ERROR_CODES.NETWORK_ERROR)
      );
    }
    
    return createErrorResponse(
      message,
      ERROR_CODES.SUPABASE_ERROR,
      getUserFriendlyMessage(ERROR_CODES.SUPABASE_ERROR),
      { technicalError: error.message }
    );
  }
});

/**
 * HISTORY_GET_BY_ID - Get single history item by ID
 */
registerHandler(MESSAGE_TYPES.HISTORY_GET_BY_ID, async (message) => {
  const correlationId = logger.startOperation('getHistoryById', message.correlationId);
  const { id } = message.data || {};
  
  try {
    const userId = await requireAuth(message);
    
    if (!id) {
      logger.endOperation(correlationId, 'error', { reason: 'missing_id' });
      return createErrorResponse(
        message,
        ERROR_CODES.INVALID_INPUT,
        'ID lịch sử không hợp lệ.'
      );
    }
    
    const data = await supabaseWithRetry(
      async () => {
        const { data, error } = await supabase
          .from('chat_history')
          .select('*')
          .eq('id', id)
          .eq('user_id', userId)
          .single();
        
        if (error) {
          if (error.code === 'PGRST116') {
            throw new Error('NOT_FOUND');
          }
          throw error;
        }
        return data;
      },
      {
        operationName: 'getHistoryById',
        correlationId
      }
    );
    
    logger.endOperation(correlationId, 'success', { historyId: id });
    return createResponse(message, MESSAGE_TYPES.HISTORY_DETAIL, { history: data });
    
  } catch (error) {
    logger.endOperation(correlationId, 'error', { error: error.message });
    
    if (error.errorCode) {
      return error;
    }
    
    if (error.message === 'NOT_FOUND') {
      return createErrorResponse(
        message,
        ERROR_CODES.NOT_FOUND,
        'Không tìm thấy lịch sử.'
      );
    }
    
    if (error.message?.includes('Failed to fetch')) {
      return createErrorResponse(
        message,
        ERROR_CODES.NETWORK_ERROR,
        getUserFriendlyMessage(ERROR_CODES.NETWORK_ERROR)
      );
    }
    
    return createErrorResponse(
      message,
      ERROR_CODES.SUPABASE_ERROR,
      getUserFriendlyMessage(ERROR_CODES.SUPABASE_ERROR),
      { technicalError: error.message }
    );
  }
});

/**
 * HISTORY_ADD - Add new chat history entry
 */
registerHandler(MESSAGE_TYPES.HISTORY_ADD, async (message) => {
  const correlationId = logger.startOperation('addHistory', message.correlationId);
  const { prompt, response, chat_id, chat_url, prompt_id, run_id } = message.data || {};
  
  try {
    const userId = await requireAuth(message);
    
    // Validation
    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      logger.endOperation(correlationId, 'error', { reason: 'invalid_prompt' });
      return createErrorResponse(
        message,
        ERROR_CODES.INVALID_INPUT,
        'Prompt không được để trống.'
      );
    }
    
    const data = await supabaseWithRetry(
      async () => {
        const { data, error } = await supabase
          .from('chat_history')
          .insert({
            user_id: userId,
            prompt: prompt.trim(),
            response: response || null,
            chat_id: chat_id || null,
            chat_url: chat_url || null,
            prompt_id: prompt_id || null,
            run_id: run_id || null,
            timestamp: new Date().toISOString()
          })
          .select()
          .single();
        
        if (error) throw error;
        return data;
      },
      {
        operationName: 'addHistory',
        correlationId
      }
    );
    
    logger.endOperation(correlationId, 'success', { historyId: data.id });
    return createResponse(message, MESSAGE_TYPES.HISTORY_ADDED, { history: data });
    
  } catch (error) {
    logger.endOperation(correlationId, 'error', { error: error.message });
    
    if (error.errorCode) {
      return error;
    }
    
    if (error.message?.includes('Failed to fetch')) {
      return createErrorResponse(
        message,
        ERROR_CODES.NETWORK_ERROR,
        getUserFriendlyMessage(ERROR_CODES.NETWORK_ERROR)
      );
    }
    
    return createErrorResponse(
      message,
      ERROR_CODES.SUPABASE_ERROR,
      getUserFriendlyMessage(ERROR_CODES.SUPABASE_ERROR),
      { technicalError: error.message }
    );
  }
});

/**
 * HISTORY_UPDATE - Update history entry (typically to add response)
 */
registerHandler(MESSAGE_TYPES.HISTORY_UPDATE, async (message) => {
  const correlationId = logger.startOperation('updateHistory', message.correlationId);
  const { id, response, chat_url } = message.data || {};
  
  try {
    const userId = await requireAuth(message);
    
    if (!id) {
      logger.endOperation(correlationId, 'error', { reason: 'missing_id' });
      return createErrorResponse(
        message,
        ERROR_CODES.INVALID_INPUT,
        'ID lịch sử không hợp lệ.'
      );
    }
    
    const updateData = {};
    if (response !== undefined) updateData.response = response;
    if (chat_url !== undefined) updateData.chat_url = chat_url;
    
    const data = await supabaseWithRetry(
      async () => {
        const { data, error } = await supabase
          .from('chat_history')
          .update(updateData)
          .eq('id', id)
          .eq('user_id', userId)
          .select()
          .single();
        
        if (error) {
          if (error.code === 'PGRST116') {
            throw new Error('NOT_FOUND');
          }
          throw error;
        }
        return data;
      },
      {
        operationName: 'updateHistory',
        correlationId
      }
    );
    
    logger.endOperation(correlationId, 'success', { historyId: id });
    return createResponse(message, MESSAGE_TYPES.HISTORY_UPDATED, { history: data });
    
  } catch (error) {
    logger.endOperation(correlationId, 'error', { error: error.message });
    
    if (error.errorCode) {
      return error;
    }
    
    if (error.message === 'NOT_FOUND') {
      return createErrorResponse(
        message,
        ERROR_CODES.NOT_FOUND,
        'Không tìm thấy lịch sử.'
      );
    }
    
    if (error.message?.includes('Failed to fetch')) {
      return createErrorResponse(
        message,
        ERROR_CODES.NETWORK_ERROR,
        getUserFriendlyMessage(ERROR_CODES.NETWORK_ERROR)
      );
    }
    
    return createErrorResponse(
      message,
      ERROR_CODES.SUPABASE_ERROR,
      getUserFriendlyMessage(ERROR_CODES.SUPABASE_ERROR),
      { technicalError: error.message }
    );
  }
});

/**
 * HISTORY_CLEAR - Clear all chat history for current user
 */
registerHandler(MESSAGE_TYPES.HISTORY_CLEAR, async (message) => {
  const correlationId = logger.startOperation('clearHistory', message.correlationId);
  
  try {
    const userId = await requireAuth(message);
    
    const count = await supabaseWithRetry(
      async () => {
        // First get count
        const { count: totalCount, error: countError } = await supabase
          .from('chat_history')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', userId);
        
        if (countError) throw countError;
        
        // Then delete
        const { error } = await supabase
          .from('chat_history')
          .delete()
          .eq('user_id', userId);
        
        if (error) throw error;
        
        return totalCount || 0;
      },
      {
        operationName: 'clearHistory',
        correlationId
      }
    );
    
    logger.endOperation(correlationId, 'success', { deletedCount: count });
    return createResponse(message, MESSAGE_TYPES.HISTORY_CLEARED, { deletedCount: count });
    
  } catch (error) {
    logger.endOperation(correlationId, 'error', { error: error.message });
    
    if (error.errorCode) {
      return error;
    }
    
    if (error.message?.includes('Failed to fetch')) {
      return createErrorResponse(
        message,
        ERROR_CODES.NETWORK_ERROR,
        getUserFriendlyMessage(ERROR_CODES.NETWORK_ERROR)
      );
    }
    
    return createErrorResponse(
      message,
      ERROR_CODES.SUPABASE_ERROR,
      getUserFriendlyMessage(ERROR_CODES.SUPABASE_ERROR),
      { technicalError: error.message }
    );
  }
});
