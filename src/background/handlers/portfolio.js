/**
 * @fileoverview Portfolio Feature Handlers (Supabase)
 * Handles portfolio-related operations with Supabase backend
 * Ticket: GPT-018 - Background portfolio CRUD (Supabase)
 */

import { registerHandler } from '../messageRouter.js';
import { MESSAGE_TYPES, createResponse, createErrorResponse } from '../../shared/messageSchema.js';
import { createLogger } from '../../logger.js';
import { ERROR_CODES, getUserFriendlyMessage } from '../../shared/errorCodes.js';
import { supabase } from '../../supabaseConfig.js';
import { requireAuth } from '../utils/auth.js';
import { supabaseWithRetry } from '../utils/supabaseRetry.js';
import { fetchStockPricesBatch } from '../utils/ssiPriceFetcher.js';

const logger = createLogger('Handlers/Portfolio');

/**
 * Validate portfolio entry data
 */
function validatePortfolioEntry(symbol, quantity, avgPrice) {
  if (!symbol || typeof symbol !== 'string' || symbol.trim().length === 0) {
    return { valid: false, error: 'Mã cổ phiếu là bắt buộc' };
  }
  
  if (quantity !== undefined) {
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      return { valid: false, error: 'Số lượng phải là số dương' };
    }
  }
  
  if (avgPrice !== undefined) {
    const price = Number(avgPrice);
    if (!Number.isFinite(price) || price <= 0) {
      return { valid: false, error: 'Giá trung bình phải là số dương' };
    }
  }
  
  return { valid: true };
}

/**
 * Handle PORTFOLIO_GET
 * Get all portfolio items for current user
 */
registerHandler(MESSAGE_TYPES.PORTFOLIO_GET, async (message) => {
  const correlationId = message.correlationId;
  logger.info('Handling PORTFOLIO_GET', { correlationId });
  
  try {
    // Require authentication
    const userId = await requireAuth(message);
    
    // Query portfolio from Supabase
    const items = await supabaseWithRetry(
      async () => {
        const { data, error } = await supabase
          .from('portfolio')
          .select('*')
          .eq('user_id', userId)
          .order('symbol', { ascending: true });
        
        if (error) throw error;
        return data || [];
      },
      {
        operationName: 'getPortfolio',
        correlationId
      }
    );
    
    logger.info('Portfolio fetched', { correlationId, itemCount: items.length });
    
    return createResponse(message, MESSAGE_TYPES.PORTFOLIO_DATA, {
      success: true,
      items
    });
    
  } catch (error) {
    // If error already formatted by requireAuth
    if (error.errorCode) return error;
    
    logger.error('Portfolio fetch failed', { correlationId, error: error.message });
    return createErrorResponse(
      message,
      ERROR_CODES.SUPABASE_ERROR,
      getUserFriendlyMessage(ERROR_CODES.SUPABASE_ERROR),
      { technicalError: error.message }
    );
  }
});

/**
 * Handle PORTFOLIO_ADD
 * Add new stock to portfolio
 */
registerHandler(MESSAGE_TYPES.PORTFOLIO_ADD, async (message) => {
  const correlationId = message.correlationId;
  logger.info('Handling PORTFOLIO_ADD', { correlationId });
  
  try {
    // Require authentication
    const userId = await requireAuth(message);
    
    const { symbol, quantity, avgPrice, notes } = message.data || {};
    
    // Validate input
    const validation = validatePortfolioEntry(symbol, quantity, avgPrice);
    if (!validation.valid) {
      logger.warn('Portfolio add validation failed', { correlationId, error: validation.error });
      return createErrorResponse(
        message,
        ERROR_CODES.INVALID_INPUT,
        validation.error
      );
    }
    
    // Normalize symbol
    const normalizedSymbol = symbol.trim().toUpperCase();
    
    // Insert to Supabase (will fail if duplicate due to unique constraint)
    const item = await supabaseWithRetry(
      async () => {
        const { data, error } = await supabase
          .from('portfolio')
          .insert({
            user_id: userId,
            symbol: normalizedSymbol,
            quantity: Number(quantity),
            avg_price: Number(avgPrice),
            notes: notes || null
          })
          .select()
          .single();
        
        if (error) {
          // Check for duplicate key violation
          if (error.code === '23505') {
            throw new Error(`Cổ phiếu ${normalizedSymbol} đã có trong danh mục`);
          }
          throw error;
        }
        
        return data;
      },
      {
        operationName: 'addPortfolio',
        correlationId,
        maxRetries: 1 // Don't retry on constraint violations
      }
    );
    
    logger.info('Portfolio item added', { correlationId, symbol: normalizedSymbol });
    
    return createResponse(message, MESSAGE_TYPES.PORTFOLIO_ADDED, {
      success: true,
      item
    });
    
  } catch (error) {
    // If error already formatted by requireAuth
    if (error.errorCode) return error;
    
    logger.error('Portfolio add failed', { correlationId, error: error.message });
    return createErrorResponse(
      message,
      ERROR_CODES.SUPABASE_ERROR,
      error.message || getUserFriendlyMessage(ERROR_CODES.SUPABASE_ERROR),
      { technicalError: error.message }
    );
  }
});

/**
 * Handle PORTFOLIO_UPDATE
 * Update existing portfolio item
 */
registerHandler(MESSAGE_TYPES.PORTFOLIO_UPDATE, async (message) => {
  const correlationId = message.correlationId;
  logger.info('Handling PORTFOLIO_UPDATE', { correlationId });
  
  try {
    // Require authentication
    const userId = await requireAuth(message);
    
    const { id, updates } = message.data || {};
    
    if (!id) {
      return createErrorResponse(
        message,
        ERROR_CODES.INVALID_INPUT,
        'ID cổ phiếu là bắt buộc'
      );
    }
    
    // Build update object
    const updateData = {};
    if (updates.quantity !== undefined) updateData.quantity = Number(updates.quantity);
    if (updates.avgPrice !== undefined) updateData.avg_price = Number(updates.avgPrice);
    if (updates.avg_price !== undefined) updateData.avg_price = Number(updates.avg_price);
    if (updates.notes !== undefined) updateData.notes = updates.notes;
    // Support both camelCase and snake_case for current_price
    if (updates.currentPrice !== undefined) updateData.current_price = Number(updates.currentPrice);
    if (updates.current_price !== undefined) updateData.current_price = Number(updates.current_price);
    
    updateData.updated_at = new Date().toISOString();
    
    // Update in Supabase
    const item = await supabaseWithRetry(
      async () => {
        const { data, error } = await supabase
          .from('portfolio')
          .update(updateData)
          .eq('id', id)
          .eq('user_id', userId) // Security: only update own items
          .select()
          .single();
        
        if (error) throw error;
        if (!data) throw new Error('Không tìm thấy cổ phiếu');
        
        return data;
      },
      {
        operationName: 'updatePortfolio',
        correlationId
      }
    );
    
    logger.info('Portfolio item updated', { correlationId, id });
    
    return createResponse(message, MESSAGE_TYPES.PORTFOLIO_UPDATED, {
      success: true,
      item
    });
    
  } catch (error) {
    // If error already formatted by requireAuth
    if (error.errorCode) return error;
    
    logger.error('Portfolio update failed', { correlationId, error: error.message });
    return createErrorResponse(
      message,
      ERROR_CODES.SUPABASE_ERROR,
      error.message || getUserFriendlyMessage(ERROR_CODES.SUPABASE_ERROR),
      { technicalError: error.message }
    );
  }
});

/**
 * Handle PORTFOLIO_REMOVE
 * Delete portfolio item
 */
registerHandler(MESSAGE_TYPES.PORTFOLIO_REMOVE, async (message) => {
  const correlationId = message.correlationId;
  logger.info('Handling PORTFOLIO_REMOVE', { correlationId });
  
  try {
    // Require authentication
    const userId = await requireAuth(message);
    
    const { id } = message.data || {};
    
    if (!id) {
      return createErrorResponse(
        message,
        ERROR_CODES.INVALID_INPUT,
        'ID cổ phiếu là bắt buộc'
      );
    }
    
    // Delete from Supabase
    await supabaseWithRetry(
      async () => {
        const { error } = await supabase
          .from('portfolio')
          .delete()
          .eq('id', id)
          .eq('user_id', userId); // Security: only delete own items
        
        if (error) throw error;
      },
      {
        operationName: 'removePortfolio',
        correlationId
      }
    );
    
    logger.info('Portfolio item removed', { correlationId, id });
    
    return createResponse(message, MESSAGE_TYPES.PORTFOLIO_REMOVED, {
      success: true,
      id
    });
    
  } catch (error) {
    // If error already formatted by requireAuth
    if (error.errorCode) return error;
    
    logger.error('Portfolio remove failed', { correlationId, error: error.message });
    return createErrorResponse(
      message,
      ERROR_CODES.SUPABASE_ERROR,
      getUserFriendlyMessage(ERROR_CODES.SUPABASE_ERROR),
      { technicalError: error.message }
    );
  }
});

logger.info('Portfolio handlers registered');

/**
 * Handle PORTFOLIO_UPDATE_PRICES
 * Update current prices for all portfolio items from SSI API
 * Ticket: GPT-020, GPT-021
 */
registerHandler(MESSAGE_TYPES.PORTFOLIO_UPDATE_PRICES, async (message) => {
  const correlationId = message.correlationId;
  logger.info('Handling PORTFOLIO_UPDATE_PRICES', { correlationId });
  
  try {
    // Require authentication
    const userId = await requireAuth(message);
    
    // Get all portfolio items
    const items = await supabaseWithRetry(
      async () => {
        const { data, error } = await supabase
          .from('portfolio')
          .select('id, symbol')
          .eq('user_id', userId);
        
        if (error) throw error;
        return data || [];
      },
      {
        operationName: 'getPortfolioForPriceUpdate',
        correlationId
      }
    );
    
    if (items.length === 0) {
      logger.info('No portfolio items to update', { correlationId });
      return createResponse(message, MESSAGE_TYPES.PORTFOLIO_PRICES_UPDATED, {
        success: true,
        updated: 0,
        prices: {}
      });
    }
    
    const symbols = items.map(item => item.symbol);
    
    logger.info('Fetching prices from SSI', {
      correlationId,
      symbolCount: symbols.length,
      symbols
    });
    
    // Fetch prices from SSI API (batch)
    const priceMap = await fetchStockPricesBatch(symbols, { correlationId });
    
    // Update prices in Supabase
    const updates = [];
    for (const item of items) {
      const price = priceMap[item.symbol];
      if (price !== null && price > 0) {
        updates.push({
          id: item.id,
          current_price: price,
          updated_at: new Date().toISOString()
        });
      }
    }
    
    if (updates.length > 0) {
      await supabaseWithRetry(
        async () => {
          // Batch update using upsert
          const { error } = await supabase
            .from('portfolio')
            .upsert(updates, { onConflict: 'id' });
          
          if (error) throw error;
        },
        {
          operationName: 'updatePortfolioPrices',
          correlationId
        }
      );
    }
    
    const successCount = updates.length;
    const failCount = items.length - successCount;
    
    logger.info('Portfolio prices updated', {
      correlationId,
      total: items.length,
      success: successCount,
      failed: failCount
    });
    
    return createResponse(message, MESSAGE_TYPES.PORTFOLIO_PRICES_UPDATED, {
      success: true,
      updated: successCount,
      failed: failCount,
      prices: priceMap
    });
    
  } catch (error) {
    // If error already formatted by requireAuth
    if (error.errorCode) return error;
    
    logger.error('Portfolio price update failed', { correlationId, error: error.message });
    return createErrorResponse(
      message,
      ERROR_CODES.PRICE_UPDATE_FAILED,
      getUserFriendlyMessage(ERROR_CODES.PRICE_UPDATE_FAILED),
      { technicalError: error.message }
    );
  }
});

logger.info('Portfolio handlers registered');
