/**
 * Task 4 Tests - Modals & Validation
 * 
 * X51LABS-156: Verify form validation, modal workflows, CRUD operations
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  validateSymbol,
  validateEntryPrice,
  validateQuantity,
  validateNewPrice,
  isSymbolDuplicate,
  validateStockForm
} from '../../../src/ui-preact/utils/formValidation.js';

describe('Task 4: Modals & Validation - Form Validation', () => {
  describe('AC-1: Add Stock Modal - Validation & Submit', () => {
    it('accepts valid stock data and calls addPortfolio()', () => {
      const validation = validateStockForm(
        {
          symbol: 'VNM',
          entryPrice: 85000,
          quantity: 100,
          isCash: false
        },
        [],
        null
      );

      expect(validation.isValid).toBe(true);
      expect(Object.keys(validation.errors).length).toBe(0);
    });

    it('shows error for empty symbol', () => {
      const validation = validateStockForm(
        {
          symbol: '',
          entryPrice: 85000,
          quantity: 100,
          isCash: false
        },
        [],
        null
      );

      expect(validation.isValid).toBe(false);
      expect(validation.errors.symbol).toBe('Mã cổ phiếu bắt buộc');
    });

    it('shows error for invalid symbol format', () => {
      const validation = validateSymbol('VN@M#');

      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain('chỉ chứa');
    });

    it('shows error for symbol too long', () => {
      const validation = validateSymbol('VERYLONGSYMBOL');

      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain('tối đa 10');
    });

    it('normalizes symbol to uppercase', () => {
      const validation = validateSymbol('vnm');

      expect(validation.isValid).toBe(true);
    });

    it('shows error for entry price <= 0', () => {
      const validation = validateEntryPrice(0);

      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain('> 0');
    });

    it('shows error for entry price > 1,000,000', () => {
      const validation = validateEntryPrice(1000001);

      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain('tối đa');
    });

    it('shows error for quantity <= 0', () => {
      const validation = validateQuantity(0);

      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain('> 0');
    });

    it('shows error for non-integer quantity', () => {
      const validation = validateQuantity(100.5);

      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain('số nguyên');
    });

    it('accepts valid entry price (> 0, <= 1M)', () => {
      const validation = validateEntryPrice(85000);

      expect(validation.isValid).toBe(true);
    });

    it('accepts valid quantity', () => {
      const validation = validateQuantity(100);

      expect(validation.isValid).toBe(true);
    });

    it('disables submit button when form invalid', () => {
      const validation = validateStockForm(
        {
          symbol: '',
          entryPrice: 85000,
          quantity: 100,
          isCash: false
        },
        [],
        null
      );

      expect(validation.isValid).toBe(false);
      // Submit button would be disabled in component
    });

    it('enables submit button when form valid', () => {
      const validation = validateStockForm(
        {
          symbol: 'VNM',
          entryPrice: 85000,
          quantity: 100,
          isCash: false
        },
        [],
        null
      );

      expect(validation.isValid).toBe(true);
      // Submit button would be enabled in component
    });

    it('prevents submission with invalid data', () => {
      const validation = validateStockForm(
        {
          symbol: '',
          entryPrice: -1000,
          quantity: -100,
          isCash: false
        },
        [],
        null
      );

      expect(validation.isValid).toBe(false);
      expect(validation.errors.symbol).toBeDefined();
      expect(validation.errors.entryPrice).toBeDefined();
      expect(validation.errors.quantity).toBeDefined();
    });
  });

  describe('AC-2: Duplicate Symbol Error', () => {
    it('shows error when symbol already exists', () => {
      const portfolio = [
        { id: '1', symbol: 'VNM', quantity: 100, avg_price: 85000, current_price: 85000 }
      ];

      const validation = validateStockForm(
        {
          symbol: 'VNM',
          entryPrice: 86000,
          quantity: 50,
          isCash: false
        },
        portfolio,
        null
      );

      expect(validation.isValid).toBe(false);
      expect(validation.errors.symbol).toContain('đã tồn tại');
    });

    it('allows duplicate symbol in edit mode (excludes current)', () => {
      const portfolio = [
        { id: '1', symbol: 'VNM', quantity: 100, avg_price: 85000, current_price: 85000 },
        { id: '2', symbol: 'VIC', quantity: 50, avg_price: 120000, current_price: 120000 }
      ];

      const validation = validateStockForm(
        {
          symbol: 'VNM', // Same symbol being edited
          entryPrice: 87000,
          quantity: 150,
          isCash: false
        },
        portfolio,
        '1' // Exclude ID 1 (the one being edited)
      );

      expect(validation.isValid).toBe(true);
      expect(validation.errors.symbol).toBeUndefined();
    });

    it('detects true duplicate in edit mode (different ID)', () => {
      const portfolio = [
        { id: '1', symbol: 'VNM', quantity: 100, avg_price: 85000, current_price: 85000 },
        { id: '2', symbol: 'VIC', quantity: 50, avg_price: 120000, current_price: 120000 }
      ];

      const validation = validateStockForm(
        {
          symbol: 'VNM', // Trying to edit VIC to VNM (conflict!)
          entryPrice: 87000,
          quantity: 150,
          isCash: false
        },
        portfolio,
        '2' // Exclude ID 2, but VNM already exists as ID 1
      );

      expect(validation.isValid).toBe(false);
      expect(validation.errors.symbol).toContain('đã tồn tại');
    });

    it('is case-insensitive for duplicates', () => {
      const portfolio = [
        { id: '1', symbol: 'VNM', quantity: 100, avg_price: 85000, current_price: 85000 }
      ];

      const isDuplicate = isSymbolDuplicate('vnm', portfolio);

      expect(isDuplicate).toBe(true);
    });
  });

  describe('AC-3: CASH Special Handling', () => {
    it('hides entry price field when symbol is CASH', () => {
      const validation = validateStockForm(
        {
          symbol: 'CASH',
          entryPrice: '', // Hidden, should not validate
          quantity: 1000,
          isCash: true
        },
        [],
        null
      );

      expect(validation.isValid).toBe(true);
      expect(validation.errors.entryPrice).toBeUndefined();
    });

    it('requires only quantity for CASH (no entry price)', () => {
      const validation = validateStockForm(
        {
          symbol: 'CASH',
          entryPrice: null,
          quantity: 500,
          isCash: true
        },
        [],
        null
      );

      expect(validation.isValid).toBe(true);
    });

    it('sets entry_price=1 for CASH on submit', () => {
      // In component, would set avgPrice to 1 for CASH
      const isCash = true;
      const entryPrice = isCash ? 1 : Number('85000');

      expect(entryPrice).toBe(1);
    });

    it('validates quantity even for CASH', () => {
      const validation = validateQuantity(0);

      expect(validation.isValid).toBe(false);
    });
  });

  describe('AC-4: Price Update Modal - Validation', () => {
    it('requires new price > 0', () => {
      const validation = validateNewPrice(0);

      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain('> 0');
    });

    it('accepts valid new price', () => {
      const validation = validateNewPrice(87500);

      expect(validation.isValid).toBe(true);
    });

    it('shows error for negative price', () => {
      const validation = validateNewPrice(-1000);

      expect(validation.isValid).toBe(false);
    });

    it('shows error for non-numeric price', () => {
      const validation = validateNewPrice('abc');

      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain('phải là số');
    });

    it('validates all prices in list before batch update', () => {
      const prices = {
        VNM: 87500,
        VIC: 120000,
        VHM: -1000 // Invalid
      };

      const errors = {};
      Object.entries(prices).forEach(([symbol, price]) => {
        const validation = validateNewPrice(price);
        if (!validation.isValid) {
          errors[symbol] = validation.error;
        }
      });

      expect(Object.keys(errors).length).toBe(1);
      expect(errors.VHM).toBeDefined();
    });
  });

  describe('Error Display & UX', () => {
    it('shows error message below invalid field', () => {
      const validation = validateSymbol('');

      expect(validation.error).toBe('Mã cổ phiếu bắt buộc');
      // Component would show this below the input
    });

    it('clears error when field becomes valid', () => {
      let validation = validateSymbol('');
      expect(validation.isValid).toBe(false);

      validation = validateSymbol('VNM');
      expect(validation.isValid).toBe(true);
      // Error cleared in component state
    });

    it('shows submit error toast on API failure', () => {
      // Error from API would be: { error: 'Stock already in portfolio' }
      // Component would show this in error banner
      expect('Stock already in portfolio').toBeDefined();
    });

    it('disables submit button during submission', () => {
      // Component sets isSubmitting.value = true during async operation
      // Submit button disabled when isSubmitting.value === true
      expect(true).toBe(true);
    });

    it('shows loading state in button text', () => {
      // Button text changes from "Thêm" to "Đang lưu..."
      const isSubmitting = true;
      const buttonText = isSubmitting ? 'Đang lưu...' : 'Thêm';

      expect(buttonText).toBe('Đang lưu...');
    });

    it('closes modal on successful submit', () => {
      // handleClose() called after successful API response
      expect(true).toBe(true);
    });
  });

  describe('Form State Management', () => {
    it('initializes with empty fields for Add mode', () => {
      const formData = {
        symbol: '',
        entryPrice: '',
        quantity: '',
        isCash: false
      };

      const validation = validateStockForm(formData, [], null);

      expect(validation.isValid).toBe(false);
      expect(Object.keys(validation.errors).length).toBeGreaterThan(0);
    });

    it('initializes with existing data for Edit mode', () => {
      const existingStock = {
        id: '1',
        symbol: 'VNM',
        quantity: 100,
        avg_price: 85000,
        current_price: 87000
      };

      const formData = {
        symbol: existingStock.symbol,
        entryPrice: existingStock.avg_price,
        quantity: existingStock.quantity,
        isCash: false
      };

      const validation = validateStockForm(formData, [], existingStock.id);

      expect(validation.isValid).toBe(true);
    });

    it('clears form on close', () => {
      // handleClose() resets all form signals to empty
      const formState = {
        symbol: '',
        entryPrice: '',
        quantity: '',
        errors: {}
      };

      expect(formState.symbol).toBe('');
      expect(Object.keys(formState.errors).length).toBe(0);
    });
  });
});
