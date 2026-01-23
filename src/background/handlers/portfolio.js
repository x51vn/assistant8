/**
 * @fileoverview Portfolio Feature Handlers
 * Handles portfolio-related operations
 */

import { registerHandler } from '../messageRouter.js';
import { MESSAGE_TYPES, createResponse, createErrorResponse } from '../../shared/messageSchema.js';
import { createLogger } from '../../logger.js';
import { ERROR_CODES } from '../../types.js';

const logger = createLogger('Handlers/Portfolio');

/**
 * X51LABS-63: Validate portfolio entry data
 */
function validatePortfolioEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return { valid: false, error: 'Entry must be an object' };
  }
  
  if (!entry.code || typeof entry.code !== 'string' || entry.code.trim().length === 0) {
    return { valid: false, error: 'Stock code is required and must be a non-empty string' };
  }
  
  if (entry.quantity !== undefined) {
    const qty = Number(entry.quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      return { valid: false, error: 'Quantity must be a positive number' };
    }
  }
  
  if (entry.entryPrice !== undefined) {
    const price = Number(entry.entryPrice);
    if (!Number.isFinite(price) || price <= 0) {
      return { valid: false, error: 'Entry price must be a positive number' };
    }
  }
  
  return { valid: true };
}

/**
 * Handle PORTFOLIO_ADD
 * X51LABS-63: Full implementation with validation
 */
registerHandler(MESSAGE_TYPES.PORTFOLIO_ADD, async (message, sender) => {
  const correlationId = logger.startOperation('portfolioAdd', message.correlationId);
  
  try {
    const { entry } = message.payload || {};
    
    // Validate entry
    const validation = validatePortfolioEntry(entry);
    if (!validation.valid) {
      logger.endOperation(correlationId, 'error', validation.error);
      return createErrorResponse(message, ERROR_CODES.INVALID_INPUT, validation.error);
    }
    
    // Normalize stock code
    const stockCode = entry.code.trim().toUpperCase();
    
    // Get current portfolio from storage
    const storage = await chrome.storage.local.get(['portfolio']);
    const portfolio = Array.isArray(storage.portfolio) ? storage.portfolio : [];
    
    // Check for duplicates
    const existingIndex = portfolio.findIndex(item => 
      item.code && item.code.toUpperCase() === stockCode
    );
    
    if (existingIndex >= 0) {
      logger.warn('Duplicate stock code', { correlationId, stockCode });
      logger.endOperation(correlationId, 'error', 'Duplicate stock');
      return createErrorResponse(
        message, 
        ERROR_CODES.INVALID_INPUT, 
        `Stock ${stockCode} already exists in portfolio`
      );
    }
    
    // Create new entry with timestamp
    const newEntry = {
      code: stockCode,
      quantity: entry.quantity ? Number(entry.quantity) : 0,
      entryPrice: entry.entryPrice ? Number(entry.entryPrice) : 0,
      note: entry.note || '',
      addedAt: Date.now()
    };
    
    // Add to portfolio
    portfolio.push(newEntry);
    await chrome.storage.local.set({ portfolio });
    
    logger.info('Portfolio entry added', { correlationId, stockCode, portfolioSize: portfolio.length });
    logger.endOperation(correlationId, 'success');
    
    return createResponse(message, MESSAGE_TYPES.PORTFOLIO_ADDED, {
      success: true,
      entry: newEntry,
      portfolioSize: portfolio.length
    });
    
  } catch (error) {
    logger.error('Portfolio add failed', { correlationId, error });
    logger.endOperation(correlationId, 'error', error);
    return createErrorResponse(
      message,
      ERROR_CODES.OPERATION_FAILED,
      error.message || 'Failed to add portfolio entry'
    );
  }
});

logger.info('Portfolio handlers registered');
