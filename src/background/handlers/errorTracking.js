/**
 * @fileoverview Errors CRUD Handlers
 * Manages error tracking operations with Supabase backend
 * 
 * Ticket: GPT-016
 */

import { registerHandler } from '../messageRouter.js';
import { MESSAGE_TYPES, createResponse, createErrorResponse } from '../../shared/messageSchema.js';
import { supabase } from '../../supabaseConfig.js';
import { requireAuth } from '../utils/auth.js';
import { supabaseWithRetry } from '../utils/supabaseRetry.js';
import { ERROR_CODES, getUserFriendlyMessage } from '../../shared/errorCodes.js';
import { createLogger } from '../../logger.js';

const logger = createLogger('ErrorsHandler');

/**
 * ERROR_GET_ALL - Get all errors for current user
 */
registerHandler(MESSAGE_TYPES.ERROR_GET_ALL, async (message) => {
  const correlationId = logger.startOperation('getErrors', message.correlationId);
  const { resolved, limit = 100 } = message.data || {};
  
  try {
    const userId = await requireAuth(message);
    
    let query = supabase
      .from('errors')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
    
    // Filter by resolved status if specified
    if (resolved !== undefined) {
      query = query.eq('resolved', resolved);
    }
    
    const data = await supabaseWithRetry(
      async () => {
        const { data, error } = await query;
        if (error) throw error;
        return data;
      },
      {
        operationName: 'getErrors',
        correlationId
      }
    );
    
    logger.endOperation(correlationId, 'success', { count: data.length });
    return createResponse(message, MESSAGE_TYPES.ERROR_LIST, { errors: data });
    
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
 * ERROR_GET_BY_ID - Get single error by ID
 */
registerHandler(MESSAGE_TYPES.ERROR_GET_BY_ID, async (message) => {
  const correlationId = logger.startOperation('getErrorById', message.correlationId);
  const { id } = message.data || {};
  
  try {
    const userId = await requireAuth(message);
    
    if (!id) {
      logger.endOperation(correlationId, 'error', { reason: 'missing_id' });
      return createErrorResponse(
        message,
        ERROR_CODES.INVALID_INPUT,
        'ID lỗi không hợp lệ.'
      );
    }
    
    const data = await supabaseWithRetry(
      async () => {
        const { data, error } = await supabase
          .from('errors')
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
        operationName: 'getErrorById',
        correlationId
      }
    );
    
    logger.endOperation(correlationId, 'success', { errorId: id });
    return createResponse(message, MESSAGE_TYPES.ERROR_DETAIL, { error: data });
    
  } catch (error) {
    logger.endOperation(correlationId, 'error', { error: error.message });
    
    if (error.errorCode) {
      return error;
    }
    
    if (error.message === 'NOT_FOUND') {
      return createErrorResponse(
        message,
        ERROR_CODES.NOT_FOUND,
        'Không tìm thấy lỗi.'
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
 * ERROR_ADD - Add new error entry
 */
registerHandler(MESSAGE_TYPES.ERROR_ADD, async (message) => {
  const correlationId = logger.startOperation('addError', message.correlationId);
  const { title, description, severity, type, details } = message.data || {};
  
  try {
    const userId = await requireAuth(message);
    
    // Validation
    if (!title || typeof title !== 'string' || !title.trim()) {
      logger.endOperation(correlationId, 'error', { reason: 'invalid_title' });
      return createErrorResponse(
        message,
        ERROR_CODES.INVALID_INPUT,
        'Tiêu đề lỗi không được để trống.'
      );
    }
    
    const data = await supabaseWithRetry(
      async () => {
        const { data, error } = await supabase
          .from('errors')
          .insert({
            user_id: userId,
            title: title.trim(),
            description: description || null,
            severity: severity || 'medium',
            type: type || 'general',
            details: details || null,
            timestamp: Date.now(),  // ✅ FIX: bigint milliseconds required
            resolved: false,
            created_at: new Date().toISOString()
          })
          .select()
          .single();
        
        if (error) throw error;
        return data;
      },
      {
        operationName: 'addError',
        correlationId
      }
    );
    
    logger.endOperation(correlationId, 'success', { errorId: data.id });
    return createResponse(message, MESSAGE_TYPES.ERROR_ADDED, { error: data });
    
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
 * ERROR_UPDATE - Update error entry
 */
registerHandler(MESSAGE_TYPES.ERROR_UPDATE, async (message) => {
  const correlationId = logger.startOperation('updateError', message.correlationId);
  const { id, title, description, severity, type, resolved, details } = message.data || {};
  
  try {
    const userId = await requireAuth(message);
    
    if (!id) {
      logger.endOperation(correlationId, 'error', { reason: 'missing_id' });
      return createErrorResponse(
        message,
        ERROR_CODES.INVALID_INPUT,
        'ID lỗi không hợp lệ.'
      );
    }
    
    const updateData = {};
    if (title !== undefined) {
      if (!title.trim()) {
        logger.endOperation(correlationId, 'error', { reason: 'empty_title' });
        return createErrorResponse(
          message,
          ERROR_CODES.INVALID_INPUT,
          'Tiêu đề lỗi không được để trống.'
        );
      }
      updateData.title = title.trim();
    }
    if (description !== undefined) updateData.description = description;
    if (severity !== undefined) updateData.severity = severity;
    if (type !== undefined) updateData.type = type;
    if (resolved !== undefined) {
      updateData.resolved = resolved;
      if (resolved) {
        updateData.resolved_at = new Date().toISOString();
      }
    }
    if (details !== undefined) updateData.details = details;
    
    const data = await supabaseWithRetry(
      async () => {
        const { data, error } = await supabase
          .from('errors')
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
        operationName: 'updateError',
        correlationId
      }
    );
    
    logger.endOperation(correlationId, 'success', { errorId: id });
    return createResponse(message, MESSAGE_TYPES.ERROR_UPDATED, { error: data });
    
  } catch (error) {
    logger.endOperation(correlationId, 'error', { error: error.message });
    
    if (error.errorCode) {
      return error;
    }
    
    if (error.message === 'NOT_FOUND') {
      return createErrorResponse(
        message,
        ERROR_CODES.NOT_FOUND,
        'Không tìm thấy lỗi.'
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
 * ERROR_DELETE - Delete error entry
 */
registerHandler(MESSAGE_TYPES.ERROR_DELETE, async (message) => {
  const correlationId = logger.startOperation('deleteError', message.correlationId);
  const { id } = message.data || {};
  
  try {
    const userId = await requireAuth(message);
    
    if (!id) {
      logger.endOperation(correlationId, 'error', { reason: 'missing_id' });
      return createErrorResponse(
        message,
        ERROR_CODES.INVALID_INPUT,
        'ID lỗi không hợp lệ.'
      );
    }
    
    await supabaseWithRetry(
      async () => {
        const { error } = await supabase
          .from('errors')
          .delete()
          .eq('id', id)
          .eq('user_id', userId);
        
        if (error) throw error;
      },
      {
        operationName: 'deleteError',
        correlationId
      }
    );
    
    logger.endOperation(correlationId, 'success', { errorId: id });
    return createResponse(message, MESSAGE_TYPES.ERROR_DELETED, { id });
    
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
