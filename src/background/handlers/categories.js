/**
 * @fileoverview Categories CRUD Handlers
 * Manages category operations with Supabase backend
 * 
 * Ticket: GPT-010
 */

import { registerHandler } from '../messageRouter.js';
import { MESSAGE_TYPES, createResponse, createErrorResponse } from '../../shared/messageSchema.js';
import { supabase } from '../../supabaseConfig.js';
import { requireAuth } from '../utils/auth.js';
import { supabaseWithRetry } from '../utils/supabaseRetry.js';
import { ERROR_CODES, getUserFriendlyMessage } from '../../shared/errorCodes.js';
import { createLogger } from '../../logger.js';

const logger = createLogger('CategoriesHandler');

/**
 * CATEGORY_GET_ALL - Get all categories for current user
 */
registerHandler(MESSAGE_TYPES.CATEGORY_GET_ALL, async (message) => {
  const correlationId = logger.startOperation('getCategories', message.correlationId);
  
  try {
    const userId = await requireAuth(message);
    
    const data = await supabaseWithRetry(
      async () => {
        const { data, error } = await supabase
          .from('categories')
          .select('*')
          .eq('user_id', userId)
          .order('name');
        
        if (error) throw error;
        return data;
      },
      {
        operationName: 'getCategories',
        correlationId
      }
    );
    
    logger.endOperation(correlationId, 'success', { count: data.length });
    return createResponse(message, MESSAGE_TYPES.CATEGORY_LIST, { categories: data });
    
  } catch (error) {
    logger.endOperation(correlationId, 'error', { error: error.message });
    
    // If error from requireAuth, return it directly
    if (error.errorCode) {
      return error;
    }
    
    // Map Supabase errors
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
 * CATEGORY_ADD - Create new category
 */
registerHandler(MESSAGE_TYPES.CATEGORY_ADD, async (message) => {
  const correlationId = logger.startOperation('addCategory', message.correlationId);
  const { name, color, icon } = message.data || {};
  
  try {
    const userId = await requireAuth(message);
    
    // Validation
    if (!name || typeof name !== 'string' || !name.trim()) {
      logger.endOperation(correlationId, 'error', { reason: 'invalid_name' });
      return createErrorResponse(
        message,
        ERROR_CODES.INVALID_INPUT,
        'Tên danh mục không được để trống.'
      );
    }
    
    const data = await supabaseWithRetry(
      async () => {
        const { data, error } = await supabase
          .from('categories')
          .insert({
            user_id: userId,
            name: name.trim(),
            color: color || null,
            icon: icon || null
          })
          .select()
          .single();
        
        if (error) {
          // Handle duplicate name
          if (error.code === '23505' || error.message?.includes('duplicate')) {
            throw new Error('DUPLICATE_NAME');
          }
          throw error;
        }
        return data;
      },
      {
        operationName: 'addCategory',
        correlationId
      }
    );
    
    logger.endOperation(correlationId, 'success', { categoryId: data.id });
    return createResponse(message, MESSAGE_TYPES.CATEGORY_ADDED, { category: data });
    
  } catch (error) {
    logger.endOperation(correlationId, 'error', { error: error.message });
    
    if (error.errorCode) {
      return error;
    }
    
    if (error.message === 'DUPLICATE_NAME') {
      return createErrorResponse(
        message,
        ERROR_CODES.DUPLICATE_ENTRY,
        'Danh mục này đã tồn tại.'
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
 * CATEGORY_UPDATE - Update existing category
 */
registerHandler(MESSAGE_TYPES.CATEGORY_UPDATE, async (message) => {
  const correlationId = logger.startOperation('updateCategory', message.correlationId);
  const { id, name, color, icon } = message.data || {};
  
  try {
    const userId = await requireAuth(message);
    
    // Validation
    if (!id) {
      logger.endOperation(correlationId, 'error', { reason: 'missing_id' });
      return createErrorResponse(
        message,
        ERROR_CODES.INVALID_INPUT,
        'ID danh mục không hợp lệ.'
      );
    }
    
    if (name !== undefined && (!name || !name.trim())) {
      logger.endOperation(correlationId, 'error', { reason: 'invalid_name' });
      return createErrorResponse(
        message,
        ERROR_CODES.INVALID_INPUT,
        'Tên danh mục không được để trống.'
      );
    }
    
    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (color !== undefined) updateData.color = color;
    if (icon !== undefined) updateData.icon = icon;
    
    const data = await supabaseWithRetry(
      async () => {
        const { data, error } = await supabase
          .from('categories')
          .update(updateData)
          .eq('id', id)
          .eq('user_id', userId) // Security: only update own categories
          .select()
          .single();
        
        if (error) {
          if (error.code === '23505' || error.message?.includes('duplicate')) {
            throw new Error('DUPLICATE_NAME');
          }
          if (error.code === 'PGRST116') {
            throw new Error('NOT_FOUND');
          }
          throw error;
        }
        return data;
      },
      {
        operationName: 'updateCategory',
        correlationId
      }
    );
    
    logger.endOperation(correlationId, 'success', { categoryId: id });
    return createResponse(message, MESSAGE_TYPES.CATEGORY_UPDATED, { category: data });
    
  } catch (error) {
    logger.endOperation(correlationId, 'error', { error: error.message });
    
    if (error.errorCode) {
      return error;
    }
    
    if (error.message === 'DUPLICATE_NAME') {
      return createErrorResponse(
        message,
        ERROR_CODES.DUPLICATE_ENTRY,
        'Danh mục này đã tồn tại.'
      );
    }
    
    if (error.message === 'NOT_FOUND') {
      return createErrorResponse(
        message,
        ERROR_CODES.NOT_FOUND,
        'Không tìm thấy danh mục.'
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
 * CATEGORY_DELETE - Delete category
 */
registerHandler(MESSAGE_TYPES.CATEGORY_DELETE, async (message) => {
  const correlationId = logger.startOperation('deleteCategory', message.correlationId);
  const { id } = message.data || {};
  
  try {
    const userId = await requireAuth(message);
    
    // Validation
    if (!id) {
      logger.endOperation(correlationId, 'error', { reason: 'missing_id' });
      return createErrorResponse(
        message,
        ERROR_CODES.INVALID_INPUT,
        'ID danh mục không hợp lệ.'
      );
    }
    
    await supabaseWithRetry(
      async () => {
        const { error } = await supabase
          .from('categories')
          .delete()
          .eq('id', id)
          .eq('user_id', userId); // Security: only delete own categories
        
        if (error) {
          throw error;
        }
      },
      {
        operationName: 'deleteCategory',
        correlationId
      }
    );
    
    logger.endOperation(correlationId, 'success', { categoryId: id });
    return createResponse(message, MESSAGE_TYPES.CATEGORY_DELETED, { id });
    
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
