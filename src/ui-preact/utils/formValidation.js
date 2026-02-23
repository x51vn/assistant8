/**
 * formValidation.js - Form validation utilities for modals
 * 
 * X51LABS-156: Task 4 - Modals & Validation
 */

/**
 * Validate stock symbol
 * Rules: 1-10 chars, uppercase
 * @param {string} symbol - Symbol to validate
 * @returns {Object} { isValid, error }
 */
export function validateSymbol(symbol) {
  if (!symbol || symbol.trim().length === 0) {
    return { isValid: false, error: 'Mã cổ phiếu bắt buộc' };
  }
  
  const trimmed = symbol.trim().toUpperCase();
  
  if (trimmed.length < 1) {
    return { isValid: false, error: 'Mã cổ phiếu tối thiểu 1 ký tự' };
  }
  
  if (trimmed.length > 10) {
    return { isValid: false, error: 'Mã cổ phiếu tối đa 10 ký tự' };
  }
  
  if (!/^[A-Z0-9]+$/.test(trimmed)) {
    return { isValid: false, error: 'Mã cổ phiếu chỉ chứa chữ và số' };
  }
  
  return { isValid: true, error: null };
}

/**
 * Validate entry price
 * Rules: > 0, <= 1,000,000
 * @param {number|string} price - Price to validate
 * @returns {Object} { isValid, error }
 */
export function validateEntryPrice(price) {
  if (price === null || price === undefined || price === '') {
    return { isValid: false, error: 'Giá nhập bắt buộc' };
  }
  
  const num = Number(price);
  
  if (isNaN(num)) {
    return { isValid: false, error: 'Giá phải là số' };
  }
  
  if (num <= 0) {
    return { isValid: false, error: 'Giá phải > 0' };
  }
  
  if (num > 1000000) {
    return { isValid: false, error: 'Giá tối đa 1,000,000' };
  }
  
  return { isValid: true, error: null };
}

/**
 * Validate quantity
 * Rules: > 0, <= 1,000,000
 * @param {number|string} quantity - Quantity to validate
 * @returns {Object} { isValid, error }
 */
export function validateQuantity(quantity) {
  if (quantity === null || quantity === undefined || quantity === '') {
    return { isValid: false, error: 'Số lượng bắt buộc' };
  }
  
  const num = Number(quantity);
  
  if (isNaN(num) || !Number.isInteger(num)) {
    return { isValid: false, error: 'Số lượng phải là số nguyên' };
  }
  
  if (num <= 0) {
    return { isValid: false, error: 'Số lượng phải > 0' };
  }
  
  if (num > 1000000) {
    return { isValid: false, error: 'Số lượng tối đa 1,000,000' };
  }
  
  return { isValid: true, error: null };
}

/**
 * Validate new price (for price update modal)
 * Rules: > 0
 * @param {number|string} price - Price to validate
 * @returns {Object} { isValid, error }
 */
export function validateNewPrice(price) {
  if (price === null || price === undefined || price === '') {
    return { isValid: false, error: 'Giá mới bắt buộc' };
  }
  
  const num = Number(price);
  
  if (isNaN(num)) {
    return { isValid: false, error: 'Giá phải là số' };
  }
  
  if (num <= 0) {
    return { isValid: false, error: 'Giá phải > 0' };
  }
  
  return { isValid: true, error: null };
}

/**
 * Check if symbol already exists
 * @param {string} symbol - Symbol to check
 * @param {Array} portfolioItems - Current portfolio items
 * @param {string} excludeId - ID to exclude (for edit mode)
 * @returns {boolean}
 */
export function isSymbolDuplicate(symbol, portfolioItems, excludeId = null) {
  return portfolioItems.some(
    item => (item.symbol || '').toUpperCase() === symbol.toUpperCase() && item.id !== excludeId
  );
}

/**
 * Validate entire stock form
 * @param {Object} formData - { symbol, entryPrice, quantity, isCash }
 * @param {Array} portfolioItems - Current portfolio
 * @param {string} excludeId - ID to exclude (edit mode)
 * @returns {Object} { isValid, errors }
 */
export function validateStockForm(formData, portfolioItems, excludeId = null) {
  const errors = {};
  
  // Symbol validation
  const symbolCheck = validateSymbol(formData.symbol);
  if (!symbolCheck.isValid) {
    errors.symbol = symbolCheck.error;
  } else if (isSymbolDuplicate(formData.symbol, portfolioItems, excludeId)) {
    errors.symbol = 'Mã cổ phiếu đã tồn tại';
  }
  
  // Entry price validation (skip for CASH)
  if (!formData.isCash) {
    const priceCheck = validateEntryPrice(formData.entryPrice);
    if (!priceCheck.isValid) {
      errors.entryPrice = priceCheck.error;
    }
  }
  
  // Quantity validation
  const quantityCheck = validateQuantity(formData.quantity);
  if (!quantityCheck.isValid) {
    errors.quantity = quantityCheck.error;
  }
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}
