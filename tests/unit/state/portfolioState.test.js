/**
 * Portfolio State - Unit Tests
 * Verify signal initialization, computed signals, and helper functions
 * 
 * X51LABS-153: Task 1 AC Verification (AC-1 to AC-4, AC-10)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  portfolioItems,
  loading,
  error,
  isAddModalOpen,
  isEditModalOpen,
  isPriceUpdateModalOpen,
  selectedStock,
  editingStock,
  entryValue,
  totalValue,
  totalPL,
  totalPLPercent,
  // Helper functions
  addPortfolioItem,
  updatePortfolioItem,
  removePortfolioItem,
  setPortfolioItems,
  setLoading,
  setError,
  clearError,
  openAddModal,
  closeAddModal,
  openEditModal,
  closeEditModal,
  setSelectedStock,
  clearSelectedStock,
  resetPortfolioState
} from '../../../src/ui-preact/state/portfolioState.js';

describe('Portfolio State - Signals', () => {
  beforeEach(() => {
    // Reset state before each test
    resetPortfolioState();
  });

  describe('AC-1: Signal Initialization', () => {
    it('portfolioItems initializes as empty array', () => {
      expect(portfolioItems.value).toEqual([]);
    });

    it('loading initializes as false', () => {
      expect(loading.value).toBe(false);
    });

    it('error initializes as null', () => {
      expect(error.value).toBeNull();
    });

    it('isAddModalOpen initializes as false', () => {
      expect(isAddModalOpen.value).toBe(false);
    });

    it('isEditModalOpen initializes as false', () => {
      expect(isEditModalOpen.value).toBe(false);
    });

    it('isPriceUpdateModalOpen initializes as false', () => {
      expect(isPriceUpdateModalOpen.value).toBe(false);
    });

    it('selectedStock initializes as null', () => {
      expect(selectedStock.value).toBeNull();
    });

    it('editingStock initializes as null', () => {
      expect(editingStock.value).toBeNull();
    });
  });

  describe('AC-2: Computed Signal - totalValue', () => {
    it('returns 0 when portfolio is empty', () => {
      expect(totalValue.value).toBe(0);
    });

    it('calculates sum of (current_price × quantity) correctly', () => {
      setPortfolioItems([
        {
          id: '1',
          symbol: 'VNM',
          quantity: 100,
          avg_price: 85000,
          current_price: 90000,
          updated_at: '2026-01-31T10:00:00Z'
        },
        {
          id: '2',
          symbol: 'VIC',
          quantity: 50,
          avg_price: 75000,
          current_price: 80000,
          updated_at: '2026-01-31T10:00:00Z'
        }
      ]);

      // totalValue = (90000 * 100) + (80000 * 50) = 9000000 + 4000000 = 13000000
      expect(totalValue.value).toBe(13000000);
    });

    it('handles items with missing current_price', () => {
      setPortfolioItems([
        {
          id: '1',
          symbol: 'VNM',
          quantity: 100,
          avg_price: 85000,
          current_price: undefined,
          updated_at: '2026-01-31T10:00:00Z'
        }
      ]);

      // undefined treated as 0
      expect(totalValue.value).toBe(0);
    });
  });

  describe('AC-3: Computed Signal - totalPL', () => {
    it('returns 0 when portfolio is empty', () => {
      expect(totalPL.value).toBe(0);
    });

    it('calculates totalValue - entryValue correctly', () => {
      setPortfolioItems([
        {
          id: '1',
          symbol: 'VNM',
          quantity: 100,
          avg_price: 85000,
          current_price: 90000,
          updated_at: '2026-01-31T10:00:00Z'
        }
      ]);

      // entryValue = 85000 * 100 = 8500000
      // totalValue = 90000 * 100 = 9000000
      // totalPL = 9000000 - 8500000 = 500000
      expect(entryValue.value).toBe(8500000);
      expect(totalValue.value).toBe(9000000);
      expect(totalPL.value).toBe(500000);
    });

    it('handles negative P&L (loss)', () => {
      setPortfolioItems([
        {
          id: '1',
          symbol: 'VNM',
          quantity: 100,
          avg_price: 85000,
          current_price: 80000,
          updated_at: '2026-01-31T10:00:00Z'
        }
      ]);

      // entryValue = 8500000, totalValue = 8000000
      // totalPL = -500000
      expect(totalPL.value).toBe(-500000);
    });
  });

  describe('AC-4: Modal State Signals', () => {
    it('all modal states initialize as false', () => {
      expect(isAddModalOpen.value).toBe(false);
      expect(isEditModalOpen.value).toBe(false);
      expect(isPriceUpdateModalOpen.value).toBe(false);
    });

    it('openAddModal sets isAddModalOpen to true and clears editingStock', () => {
      editingStock.value = { id: '1' };
      openAddModal();
      expect(isAddModalOpen.value).toBe(true);
      expect(editingStock.value).toBeNull();
    });

    it('closeAddModal sets isAddModalOpen to false', () => {
      isAddModalOpen.value = true;
      closeAddModal();
      expect(isAddModalOpen.value).toBe(false);
    });

    it('openEditModal sets isEditModalOpen and pre-fills editingStock', () => {
      const stock = { id: '1', symbol: 'VNM', quantity: 100 };
      openEditModal(stock);
      expect(isEditModalOpen.value).toBe(true);
      expect(editingStock.value).toEqual(stock);
      expect(selectedStock.value).toEqual(stock);
    });

    it('closeEditModal sets isEditModalOpen to false', () => {
      isEditModalOpen.value = true;
      closeEditModal();
      expect(isEditModalOpen.value).toBe(false);
      expect(editingStock.value).toBeNull();
    });
  });

  describe('AC-10: Helper Functions', () => {
    it('setSelectedStock sets selectedStock signal', () => {
      const stock = { id: '1', symbol: 'VNM' };
      setSelectedStock(stock);
      expect(selectedStock.value).toEqual(stock);
    });

    it('clearSelectedStock clears selectedStock signal', () => {
      selectedStock.value = { id: '1' };
      clearSelectedStock();
      expect(selectedStock.value).toBeNull();
    });

    it('addPortfolioItem adds item to array and closes modal', () => {
      const item = {
        id: '1',
        symbol: 'VNM',
        quantity: 100,
        avg_price: 85000,
        current_price: 90000
      };
      isAddModalOpen.value = true;

      addPortfolioItem(item);

      expect(portfolioItems.value).toContainEqual(item);
      expect(portfolioItems.value.length).toBe(1);
      expect(isAddModalOpen.value).toBe(false);
    });

    it('updatePortfolioItem updates existing item by ID', () => {
      const item = { id: '1', symbol: 'VNM', quantity: 100, avg_price: 85000 };
      setPortfolioItems([item]);

      updatePortfolioItem('1', { quantity: 150 });

      expect(portfolioItems.value[0].quantity).toBe(150);
      expect(portfolioItems.value[0].symbol).toBe('VNM'); // Other fields preserved
    });

    it('removePortfolioItem removes item from array by ID', () => {
      setPortfolioItems([
        { id: '1', symbol: 'VNM' },
        { id: '2', symbol: 'VIC' }
      ]);

      removePortfolioItem('1');

      expect(portfolioItems.value.length).toBe(1);
      expect(portfolioItems.value[0].id).toBe('2');
    });

    it('setLoading updates loading signal', () => {
      setLoading(true);
      expect(loading.value).toBe(true);

      setLoading(false);
      expect(loading.value).toBe(false);
    });

    it('setError and clearError manage error signal', () => {
      setError('Test error');
      expect(error.value).toBe('Test error');

      clearError();
      expect(error.value).toBeNull();
    });
  });

  describe('Computed Signals - totalPLPercent', () => {
    it('returns 0 when entryValue is 0', () => {
      expect(totalPLPercent.value).toBe(0);
    });

    it('calculates (totalPL / entryValue) × 100 correctly', () => {
      setPortfolioItems([
        {
          id: '1',
          symbol: 'VNM',
          quantity: 100,
          avg_price: 100,
          current_price: 110
        }
      ]);

      // entryValue = 10000, totalValue = 11000, totalPL = 1000
      // totalPLPercent = (1000 / 10000) × 100 = 10%
      expect(totalPLPercent.value).toBe(10);
    });
  });

  describe('State Reset', () => {
    it('resetPortfolioState resets all signals to initial values', () => {
      // Set various signals
      setPortfolioItems([{ id: '1' }]);
      setLoading(true);
      setError('Error');
      openAddModal();
      setSelectedStock({ id: '1' });

      // Reset
      resetPortfolioState();

      // Verify all reset to initial
      expect(portfolioItems.value).toEqual([]);
      expect(loading.value).toBe(false);
      expect(error.value).toBeNull();
      expect(isAddModalOpen.value).toBe(false);
      expect(selectedStock.value).toBeNull();
    });
  });
});
