/**
 * @fileoverview Supabase Watchlist Handler (migrated from x51.vn)
 * Manages watchlist CRUD operations via Supabase
 *
 * Architecture:
 * - Stateless handler pattern (Service Worker can terminate anytime)
 * - Uses Supabase client with RLS for auth
 * - Background = Middleware: UI → Background → Supabase
 *
 * Migration: x51.vn → Supabase (2026-02-11)
 * Ticket: XST-741
 */

import { registerHandler } from '../messageRouter.js';
import { MESSAGE_TYPES, createResponse, createErrorResponse } from '../../shared/messageSchema.js';
import { createLogger } from '../../logger.js';
import { supabase } from '../../supabaseConfig.js';
import { supabaseWithRetry } from '../utils/supabaseRetry.js';

const logger = createLogger('Handlers/WatchlistSupabase');

// Vietnamese error messages
const ERROR_MESSAGES_VI = {
  NETWORK_ERROR: 'Không thể kết nối. Vui lòng kiểm tra mạng.',
  API_ERROR: 'Lỗi API. Vui lòng thử lại sau.',
  CREATE_FAILED: 'Không thể thêm mục watchlist.',
  UPDATE_FAILED: 'Không thể cập nhật mục watchlist.',
  DELETE_FAILED: 'Không thể xóa mục watchlist.',
  TOGGLE_FAILED: 'Không thể thay đổi trạng thái highlight.',
  SYMBOL_REQUIRED: 'Mã cổ phiếu là bắt buộc.',
  INVALID_INPUT: 'Dữ liệu đầu vào không hợp lệ.'
};

/**
 * Handle XNEEWS_WATCHLIST_GET
 * Fetch all watchlist items with pagination from Supabase
 *
 * @param {Object} message - { page, size }
 * @returns {Object} Response with watchlist data
 */
registerHandler(MESSAGE_TYPES.XNEEWS_WATCHLIST_GET, async (message) => {
  const { correlationId } = message;
  logger.info('Handling XNEEWS_WATCHLIST_GET', { correlationId });

  try {
    const { page = 1, size = 20 } = message.data || {};
    const normalizedPage = Math.max(1, Number(page) || 1);
    const normalizedSize = Math.min(100, Math.max(1, Number(size) || 20));

    // Calculate offset for pagination
    const offset = (normalizedPage - 1) * normalizedSize;

    // Query Supabase with retry
    const result = await supabaseWithRetry(
      async () => {
        // Count total items
        const countResult = await supabase
          .from('watchlist')
          .select('*', { count: 'exact', head: true });

        if (countResult.error) throw countResult.error;

        // Fetch paginated items, ordered by created_at DESC
        const dataResult = await supabase
          .from('watchlist')
          .select('*', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(offset, offset + normalizedSize - 1);

        if (dataResult.error) throw dataResult.error;

        return {
          data: dataResult.data || [],
          count: dataResult.count || 0
        };
      },
      {
        operationName: 'watchlist.get',
        maxRetries: 2,
        correlationId
      }
    );

    // Calculate total pages
    const totalPages = Math.ceil(result.count / normalizedSize);

    logger.info('Watchlist GET successful', {
      total: result.count,
      page: normalizedPage,
      size: normalizedSize,
      correlationId
    });

    return createResponse(message, MESSAGE_TYPES.XNEEWS_WATCHLIST_DATA, {
      success: true,
      items: result.data || [],
      total: result.count || 0,
      page: normalizedPage,
      size: normalizedSize,
      totalPages: totalPages
    });

  } catch (error) {
    logger.error('Watchlist GET exception', {
      error: error.message,
      correlationId
    });

    if (error.message?.includes('fetch') || error.name === 'TypeError') {
      return createErrorResponse(message, 'NETWORK_ERROR', ERROR_MESSAGES_VI.NETWORK_ERROR);
    }

    return createErrorResponse(message, 'UNKNOWN_ERROR', ERROR_MESSAGES_VI.API_ERROR);
  }
});

/**
 * Handle XNEEWS_WATCHLIST_CREATE
 * Create new watchlist item in Supabase
 *
 * @param {Object} message - { symbol, investment_thesis, risk, entry, target, stoploss, notes, highlighted }
 * @returns {Object} Response with created item
 */
registerHandler(MESSAGE_TYPES.XNEEWS_WATCHLIST_CREATE, async (message) => {
  const { correlationId } = message;
  logger.info('Handling XNEEWS_WATCHLIST_CREATE', { correlationId });

  try {
    const data = message.data || {};
    const {
      symbol,
      investmentThesis, investment_thesis,
      risk,
      entry,
      target,
      stoploss,
      notes,
      highlighted
    } = data;

    // Validation
    if (!symbol || typeof symbol !== 'string' || !symbol.trim()) {
      logger.warn('Watchlist CREATE failed: missing symbol', { correlationId });
      return createErrorResponse(message, 'INVALID_INPUT', ERROR_MESSAGES_VI.SYMBOL_REQUIRED);
    }

    // Build insert data - support both camelCase and snake_case
    const insertData = {
      symbol: symbol.trim().toUpperCase()
    };

    // Optional fields
    const thesis = investmentThesis || investment_thesis;
    if (thesis) insertData.investment_thesis = thesis;
    if (risk) insertData.risk = risk;
    if (entry !== undefined && entry !== null) insertData.entry = Number(entry);
    if (target !== undefined && target !== null) insertData.target = Number(target);
    if (stoploss !== undefined && stoploss !== null) insertData.stoploss = Number(stoploss);
    if (notes) insertData.notes = notes;
    if (highlighted !== undefined) insertData.highlighted = Boolean(highlighted);

    // Insert into Supabase with retry
    const result = await supabaseWithRetry(
      async () => {
        const response = await supabase
          .from('watchlist')
          .insert([insertData])
          .select();

        if (response.error) throw response.error;
        return response;
      },
      {
        operationName: 'watchlist.create',
        maxRetries: 2,
        correlationId
      }
    );

    // Success
    const createdItem = result.data?.[0];
    logger.info('Watchlist CREATE successful', {
      symbol: createdItem?.symbol,
      correlationId
    });

    return createResponse(message, MESSAGE_TYPES.XNEEWS_WATCHLIST_CREATED, {
      success: true,
      item: createdItem
    });

  } catch (error) {
    logger.error('Watchlist CREATE exception', {
      error: error.message,
      correlationId
    });

    // Check for duplicate symbol constraint
    if (error.message?.includes('unique') || error.code === '23505') {
      return createErrorResponse(
        message,
        'DUPLICATE_ERROR',
        'Mã cổ phiếu này đã tồn tại trong watchlist của bạn.'
      );
    }

    if (error.message?.includes('fetch') || error.name === 'TypeError') {
      return createErrorResponse(message, 'NETWORK_ERROR', ERROR_MESSAGES_VI.NETWORK_ERROR);
    }

    return createErrorResponse(message, 'UNKNOWN_ERROR', ERROR_MESSAGES_VI.CREATE_FAILED);
  }
});

/**
 * Handle XNEEWS_WATCHLIST_UPDATE
 * Update existing watchlist item in Supabase by symbol
 *
 * @param {Object} message - { symbol, updates: { investment_thesis, risk, entry, target, stoploss, notes, highlighted } }
 * @returns {Object} Response with updated item
 */
registerHandler(MESSAGE_TYPES.XNEEWS_WATCHLIST_UPDATE, async (message) => {
  const { correlationId } = message;
  logger.info('Handling XNEEWS_WATCHLIST_UPDATE', { correlationId });

  try {
    const { symbol, updates } = message.data || {};

    // Validation
    if (!symbol || typeof symbol !== 'string' || !symbol.trim()) {
      logger.warn('Watchlist UPDATE failed: missing symbol', { correlationId });
      return createErrorResponse(message, 'INVALID_INPUT', ERROR_MESSAGES_VI.SYMBOL_REQUIRED);
    }

    if (!updates || typeof updates !== 'object') {
      logger.warn('Watchlist UPDATE failed: missing updates', { correlationId });
      return createErrorResponse(message, 'INVALID_INPUT', ERROR_MESSAGES_VI.INVALID_INPUT);
    }

    // Build update data - support both camelCase and snake_case
    const updateData = {};
    if (updates.investmentThesis !== undefined) updateData.investment_thesis = updates.investmentThesis;
    if (updates.investment_thesis !== undefined) updateData.investment_thesis = updates.investment_thesis;
    if (updates.risk !== undefined) updateData.risk = updates.risk;
    if (updates.entry !== undefined && updates.entry !== null) updateData.entry = Number(updates.entry);
    if (updates.target !== undefined && updates.target !== null) updateData.target = Number(updates.target);
    if (updates.stoploss !== undefined && updates.stoploss !== null) updateData.stoploss = Number(updates.stoploss);
    if (updates.notes !== undefined) updateData.notes = updates.notes;
    if (updates.highlighted !== undefined) updateData.highlighted = Boolean(updates.highlighted);

    // Update in Supabase with retry
    const result = await supabaseWithRetry(
      async () => {
        const response = await supabase
          .from('watchlist')
          .update(updateData)
          .eq('symbol', symbol.trim().toUpperCase())
          .select();

        if (response.error) throw response.error;
        return response;
      },
      {
        operationName: 'watchlist.update',
        maxRetries: 2,
        correlationId
      }
    );

    // Check if item was found
    if (!result.data || result.data.length === 0) {
      logger.warn('Watchlist UPDATE failed: symbol not found', {
        symbol,
        correlationId
      });
      return createErrorResponse(
        message,
        'NOT_FOUND_ERROR',
        'Mục watchlist không tồn tại.'
      );
    }

    // Success
    const updatedItem = result.data?.[0];
    logger.info('Watchlist UPDATE successful', {
      symbol: updatedItem?.symbol,
      correlationId
    });

    return createResponse(message, MESSAGE_TYPES.XNEEWS_WATCHLIST_UPDATED, {
      success: true,
      item: updatedItem
    });

  } catch (error) {
    logger.error('Watchlist UPDATE exception', {
      error: error.message,
      correlationId
    });

    if (error.message?.includes('fetch') || error.name === 'TypeError') {
      return createErrorResponse(message, 'NETWORK_ERROR', ERROR_MESSAGES_VI.NETWORK_ERROR);
    }

    return createErrorResponse(message, 'UNKNOWN_ERROR', ERROR_MESSAGES_VI.UPDATE_FAILED);
  }
});

/**
 * Handle XNEEWS_WATCHLIST_DELETE
 * Delete watchlist item from Supabase by symbol
 *
 * @param {Object} message - { symbol }
 * @returns {Object} Response with success status
 */
registerHandler(MESSAGE_TYPES.XNEEWS_WATCHLIST_DELETE, async (message) => {
  const { correlationId } = message;
  logger.info('Handling XNEEWS_WATCHLIST_DELETE', { correlationId });

  try {
    const { symbol } = message.data || {};

    // Validation
    if (!symbol || typeof symbol !== 'string' || !symbol.trim()) {
      logger.warn('Watchlist DELETE failed: missing symbol', { correlationId });
      return createErrorResponse(message, 'INVALID_INPUT', ERROR_MESSAGES_VI.SYMBOL_REQUIRED);
    }

    // Delete from Supabase with retry
    const result = await supabaseWithRetry(
      async () => {
        const response = await supabase
          .from('watchlist')
          .delete()
          .eq('symbol', symbol.trim().toUpperCase())
          .select();

        if (response.error) throw response.error;
        return response;
      },
      {
        operationName: 'watchlist.delete',
        maxRetries: 2,
        correlationId
      }
    );

    // Check if item was found and deleted
    if (!result.data || result.data.length === 0) {
      logger.warn('Watchlist DELETE failed: symbol not found', {
        symbol,
        correlationId
      });
      return createErrorResponse(
        message,
        'NOT_FOUND_ERROR',
        'Mục watchlist không tồn tại.'
      );
    }

    // Success
    logger.info('Watchlist DELETE successful', {
      symbol,
      correlationId
    });

    return createResponse(message, MESSAGE_TYPES.XNEEWS_WATCHLIST_DELETED, {
      success: true,
      symbol: symbol.trim().toUpperCase(),
      message: `Đã xóa ${symbol} khỏi watchlist`
    });

  } catch (error) {
    logger.error('Watchlist DELETE exception', {
      error: error.message,
      correlationId
    });

    if (error.message?.includes('fetch') || error.name === 'TypeError') {
      return createErrorResponse(message, 'NETWORK_ERROR', ERROR_MESSAGES_VI.NETWORK_ERROR);
    }

    return createErrorResponse(message, 'UNKNOWN_ERROR', ERROR_MESSAGES_VI.DELETE_FAILED);
  }
});

/**
 * Handle XNEEWS_WATCHLIST_TOGGLE_HIGHLIGHT
 * Toggle highlight status for watchlist item in Supabase
 *
 * @param {Object} message - { symbol }
 * @returns {Object} Response with updated item
 */
registerHandler(MESSAGE_TYPES.XNEEWS_WATCHLIST_TOGGLE_HIGHLIGHT, async (message) => {
  const { correlationId } = message;
  logger.info('Handling XNEEWS_WATCHLIST_TOGGLE_HIGHLIGHT', { correlationId });

  try {
    const { symbol } = message.data || {};

    // Validation
    if (!symbol || typeof symbol !== 'string' || !symbol.trim()) {
      logger.warn('Watchlist TOGGLE_HIGHLIGHT failed: missing symbol', { correlationId });
      return createErrorResponse(message, 'INVALID_INPUT', ERROR_MESSAGES_VI.SYMBOL_REQUIRED);
    }

    const sanitizedSymbol = symbol.trim().toUpperCase();

    // Toggle highlight status in Supabase with retry
    const result = await supabaseWithRetry(
      async () => {
        // First, get current item to get current highlighted status
        const getResponse = await supabase
          .from('watchlist')
          .select('highlighted')
          .eq('symbol', sanitizedSymbol)
          .single();

        if (getResponse.error) throw getResponse.error;

        const currentHighlighted = getResponse.data?.highlighted || false;
        const newHighlighted = !currentHighlighted;

        // Then update with toggled value
        const updateResponse = await supabase
          .from('watchlist')
          .update({ highlighted: newHighlighted })
          .eq('symbol', sanitizedSymbol)
          .select();

        if (updateResponse.error) throw updateResponse.error;
        return updateResponse;
      },
      {
        operationName: 'watchlist.toggle-highlight',
        maxRetries: 2,
        correlationId
      }
    );

    // Check if item was found
    if (!result.data || result.data.length === 0) {
      logger.warn('Watchlist TOGGLE_HIGHLIGHT failed: symbol not found', {
        symbol,
        correlationId
      });
      return createErrorResponse(
        message,
        'NOT_FOUND_ERROR',
        'Mục watchlist không tồn tại.'
      );
    }

    // Success
    const updatedItem = result.data?.[0];
    logger.info('Watchlist TOGGLE_HIGHLIGHT successful', {
      symbol: updatedItem?.symbol,
      highlighted: updatedItem?.highlighted,
      correlationId
    });

    return createResponse(message, MESSAGE_TYPES.XNEEWS_WATCHLIST_HIGHLIGHT_TOGGLED, {
      success: true,
      item: updatedItem,
      highlighted: updatedItem?.highlighted
    });

  } catch (error) {
    logger.error('Watchlist TOGGLE_HIGHLIGHT exception', {
      error: error.message,
      correlationId
    });

    if (error.message?.includes('fetch') || error.name === 'TypeError') {
      return createErrorResponse(message, 'NETWORK_ERROR', ERROR_MESSAGES_VI.NETWORK_ERROR);
    }

    return createErrorResponse(message, 'UNKNOWN_ERROR', ERROR_MESSAGES_VI.TOGGLE_FAILED);
  }
});

logger.info('Watchlist Supabase handlers registered');
