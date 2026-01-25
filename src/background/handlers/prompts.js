/**
 * @fileoverview Prompts CRUD Handlers
 * Manages prompt template operations with Supabase backend
 * 
 * Ticket: GPT-012
 */

import { registerHandler } from '../messageRouter.js';
import { MESSAGE_TYPES, createResponse, createErrorResponse } from '../../shared/messageSchema.js';
import { supabase } from '../../supabaseConfig.js';
import { requireAuth } from '../utils/auth.js';
import { supabaseWithRetry } from '../utils/supabaseRetry.js';
import { ERROR_CODES, getUserFriendlyMessage } from '../../shared/errorCodes.js';
import { createLogger } from '../../logger.js';

const logger = createLogger('PromptsHandler');

/**
 * PROMPT_GET_ALL - Get all prompts for current user
 */
registerHandler(MESSAGE_TYPES.PROMPT_GET_ALL, async (message) => {
  const correlationId = logger.startOperation('getPrompts', message.correlationId);
  const { includeCategory } = message.data || {};
  
  try {
    const userId = await requireAuth(message);
    
    let query = supabase
      .from('prompts')
      .select(includeCategory ? '*, category:categories(*)' : '*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
    
    const data = await supabaseWithRetry(
      async () => {
        const { data, error } = await query;
        if (error) throw error;
        return data;
      },
      {
        operationName: 'getPrompts',
        correlationId
      }
    );
    
    logger.endOperation(correlationId, 'success', { count: data.length });
    return createResponse(message, MESSAGE_TYPES.PROMPT_LIST, { prompts: data });
    
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
 * PROMPT_GET_BY_ID - Get single prompt by ID
 */
registerHandler(MESSAGE_TYPES.PROMPT_GET_BY_ID, async (message) => {
  const correlationId = logger.startOperation('getPromptById', message.correlationId);
  const { id } = message.data || {};
  
  try {
    const userId = await requireAuth(message);
    
    if (!id) {
      logger.endOperation(correlationId, 'error', { reason: 'missing_id' });
      return createErrorResponse(
        message,
        ERROR_CODES.INVALID_INPUT,
        'ID prompt không hợp lệ.'
      );
    }
    
    const data = await supabaseWithRetry(
      async () => {
        const { data, error } = await supabase
          .from('prompts')
          .select('*, category:categories(*)')
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
        operationName: 'getPromptById',
        correlationId
      }
    );
    
    logger.endOperation(correlationId, 'success', { promptId: id });
    return createResponse(message, MESSAGE_TYPES.PROMPT_DETAIL, { prompt: data });
    
  } catch (error) {
    logger.endOperation(correlationId, 'error', { error: error.message });
    
    if (error.errorCode) {
      return error;
    }
    
    if (error.message === 'NOT_FOUND') {
      return createErrorResponse(
        message,
        ERROR_CODES.NOT_FOUND,
        'Không tìm thấy prompt.'
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
 * PROMPT_ADD - Create new prompt
 */
registerHandler(MESSAGE_TYPES.PROMPT_ADD, async (message) => {
  const correlationId = logger.startOperation('addPrompt', message.correlationId);
  const { title, content, category_id, is_favorite } = message.data || {};
  
  try {
    const userId = await requireAuth(message);
    
    // Validation
    if (!title || typeof title !== 'string' || !title.trim()) {
      logger.endOperation(correlationId, 'error', { reason: 'invalid_title' });
      return createErrorResponse(
        message,
        ERROR_CODES.INVALID_INPUT,
        'Tiêu đề prompt không được để trống.'
      );
    }
    
    if (!content || typeof content !== 'string' || !content.trim()) {
      logger.endOperation(correlationId, 'error', { reason: 'invalid_content' });
      return createErrorResponse(
        message,
        ERROR_CODES.INVALID_INPUT,
        'Nội dung prompt không được để trống.'
      );
    }
    
    const data = await supabaseWithRetry(
      async () => {
        const { data, error } = await supabase
          .from('prompts')
          .insert({
            user_id: userId,
            title: title.trim(),
            content: content.trim(),
            category_id: category_id || null,
            is_favorite: is_favorite || false,
            usage_count: 0
          })
          .select('*, category:categories(*)')
          .single();
        
        if (error) throw error;
        return data;
      },
      {
        operationName: 'addPrompt',
        correlationId
      }
    );
    
    logger.endOperation(correlationId, 'success', { promptId: data.id });
    return createResponse(message, MESSAGE_TYPES.PROMPT_ADDED, { prompt: data });
    
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
 * PROMPT_UPDATE - Update existing prompt
 */
registerHandler(MESSAGE_TYPES.PROMPT_UPDATE, async (message) => {
  const correlationId = logger.startOperation('updatePrompt', message.correlationId);
  const { id, title, content, category_id, is_favorite } = message.data || {};
  
  try {
    const userId = await requireAuth(message);
    
    // Validation
    if (!id) {
      logger.endOperation(correlationId, 'error', { reason: 'missing_id' });
      return createErrorResponse(
        message,
        ERROR_CODES.INVALID_INPUT,
        'ID prompt không hợp lệ.'
      );
    }
    
    const updateData = { updated_at: new Date().toISOString() };
    if (title !== undefined) {
      if (!title.trim()) {
        return createErrorResponse(
          message,
          ERROR_CODES.INVALID_INPUT,
          'Tiêu đề prompt không được để trống.'
        );
      }
      updateData.title = title.trim();
    }
    if (content !== undefined) {
      if (!content.trim()) {
        return createErrorResponse(
          message,
          ERROR_CODES.INVALID_INPUT,
          'Nội dung prompt không được để trống.'
        );
      }
      updateData.content = content.trim();
    }
    if (category_id !== undefined) updateData.category_id = category_id;
    if (is_favorite !== undefined) updateData.is_favorite = is_favorite;
    
    const data = await supabaseWithRetry(
      async () => {
        const { data, error } = await supabase
          .from('prompts')
          .update(updateData)
          .eq('id', id)
          .eq('user_id', userId)
          .select('*, category:categories(*)')
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
        operationName: 'updatePrompt',
        correlationId
      }
    );
    
    logger.endOperation(correlationId, 'success', { promptId: id });
    return createResponse(message, MESSAGE_TYPES.PROMPT_UPDATED, { prompt: data });
    
  } catch (error) {
    logger.endOperation(correlationId, 'error', { error: error.message });
    
    if (error.errorCode) {
      return error;
    }
    
    if (error.message === 'NOT_FOUND') {
      return createErrorResponse(
        message,
        ERROR_CODES.NOT_FOUND,
        'Không tìm thấy prompt.'
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
 * PROMPT_DELETE - Delete prompt
 */
registerHandler(MESSAGE_TYPES.PROMPT_DELETE, async (message) => {
  const correlationId = logger.startOperation('deletePrompt', message.correlationId);
  const { id } = message.data || {};
  
  try {
    const userId = await requireAuth(message);
    
    if (!id) {
      logger.endOperation(correlationId, 'error', { reason: 'missing_id' });
      return createErrorResponse(
        message,
        ERROR_CODES.INVALID_INPUT,
        'ID prompt không hợp lệ.'
      );
    }
    
    await supabaseWithRetry(
      async () => {
        const { error } = await supabase
          .from('prompts')
          .delete()
          .eq('id', id)
          .eq('user_id', userId);
        
        if (error) throw error;
      },
      {
        operationName: 'deletePrompt',
        correlationId
      }
    );
    
    logger.endOperation(correlationId, 'success', { promptId: id });
    return createResponse(message, MESSAGE_TYPES.PROMPT_DELETED, { id });
    
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
 * PROMPT_SEARCH - Search prompts by title/content
 */
registerHandler(MESSAGE_TYPES.PROMPT_SEARCH, async (message) => {
  const correlationId = logger.startOperation('searchPrompts', message.correlationId);
  const { query } = message.data || {};
  
  try {
    const userId = await requireAuth(message);
    
    if (!query || typeof query !== 'string') {
      logger.endOperation(correlationId, 'error', { reason: 'invalid_query' });
      return createErrorResponse(
        message,
        ERROR_CODES.INVALID_INPUT,
        'Từ khóa tìm kiếm không hợp lệ.'
      );
    }
    
    const searchTerm = `%${query.trim()}%`;
    
    const data = await supabaseWithRetry(
      async () => {
        const { data, error } = await supabase
          .from('prompts')
          .select('*, category:categories(*)')
          .eq('user_id', userId)
          .or(`title.ilike.${searchTerm},content.ilike.${searchTerm}`)
          .order('usage_count', { ascending: false })
          .limit(50);
        
        if (error) throw error;
        return data;
      },
      {
        operationName: 'searchPrompts',
        correlationId
      }
    );
    
    logger.endOperation(correlationId, 'success', { count: data.length });
    return createResponse(message, MESSAGE_TYPES.PROMPT_SEARCH_RESULTS, { prompts: data });
    
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
 * PROMPT_INCREMENT_USAGE - Increment usage count for a prompt
 * Called internally when a prompt is sent to ChatGPT
 */
registerHandler(MESSAGE_TYPES.PROMPT_INCREMENT_USAGE, async (message) => {
  const correlationId = logger.startOperation('incrementPromptUsage', message.correlationId);
  const { id } = message.data || {};
  
  try {
    const userId = await requireAuth(message);
    
    if (!id) {
      logger.endOperation(correlationId, 'error', { reason: 'missing_id' });
      return createErrorResponse(
        message,
        ERROR_CODES.INVALID_INPUT,
        'ID prompt không hợp lệ.'
      );
    }
    
    await supabaseWithRetry(
      async () => {
        // Use RPC for atomic increment
        const { error } = await supabase
          .rpc('increment_prompt_usage', { prompt_id: id, user_id: userId });
        
        if (error) throw error;
      },
      {
        operationName: 'incrementPromptUsage',
        correlationId
      }
    );
    
    logger.endOperation(correlationId, 'success', { promptId: id });
    return createResponse(message, MESSAGE_TYPES.PROMPT_USAGE_UPDATED, { id });
    
  } catch (error) {
    logger.endOperation(correlationId, 'error', { error: error.message });
    
    // Don't fail the main operation if usage increment fails
    logger.warn('Failed to increment usage count, but continuing', { error: error.message });
    
    if (error.errorCode) {
      return error;
    }
    
    return createResponse(message, MESSAGE_TYPES.PROMPT_USAGE_UPDATED, { 
      id, 
      warning: 'Usage count not updated' 
    });
  }
});
