/**
 * Portfolio API - Unit Tests
 * Verify message routing, error handling, and response mapping
 * 
 * X51LABS-153: Task 1 AC Verification (AC-5 to AC-9)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchPortfolio,
  addPortfolio,
  updatePortfolio,
  deletePortfolio,
  updatePrices,
  hasError
} from '../../../src/ui-preact/api/portfolioApi.js';

// Mock chrome.runtime.sendMessage
global.chrome = {
  runtime: {
    sendMessage: vi.fn()
  }
};

describe('Portfolio API - Message Routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('AC-5: fetchPortfolio - MESSAGE_TYPES.PORTFOLIO_GET', () => {
    it('calls chrome.runtime.sendMessage with PORTFOLIO_GET', async () => {
      chrome.runtime.sendMessage.mockResolvedValueOnce({
        items: []
      });

      await fetchPortfolio();

      expect(chrome.runtime.sendMessage).toHaveBeenCalled();
      const call = chrome.runtime.sendMessage.mock.calls[0][0];
      expect(call.type).toBe('PORTFOLIO_GET');
      expect(call.v).toBe(1);
      expect(call.correlationId).toBeDefined();
      expect(call.timestamp).toBeDefined();
    });

    it('returns items array on success', async () => {
      const mockItems = [
        { id: '1', symbol: 'VNM', quantity: 100, avg_price: 85000, current_price: 90000 },
        { id: '2', symbol: 'VIC', quantity: 50, avg_price: 75000, current_price: 80000 }
      ];

      chrome.runtime.sendMessage.mockResolvedValueOnce({
        items: mockItems
      });

      const result = await fetchPortfolio();

      expect(result.items).toEqual(mockItems);
      expect(result.error).toBeNull();
    });

    it('returns empty array and no error when no items', async () => {
      chrome.runtime.sendMessage.mockResolvedValueOnce({
        items: []
      });

      const result = await fetchPortfolio();

      expect(result.items).toEqual([]);
      expect(result.error).toBeNull();
    });
  });

  describe('AC-6: Error Handling - Dual Format Support', () => {
    it('handles new error format: {errorCode, errorMessage}', async () => {
      chrome.runtime.sendMessage.mockResolvedValueOnce({
        errorCode: 'AUTH_ERROR',
        errorMessage: 'Phiên đăng nhập hết hạn'
      });

      const result = await fetchPortfolio();

      expect(result.error).toBeDefined();
      expect(result.error.code).toBe('AUTH_ERROR');
      expect(result.error.message).toBe('Phiên đăng nhập hết hạn');
    });

    it('handles vanilla error format: {error: {message}}', async () => {
      chrome.runtime.sendMessage.mockResolvedValueOnce({
        error: {
          code: 'NETWORK_ERROR',
          message: 'Không có kết nối mạng'
        }
      });

      const result = await fetchPortfolio();

      expect(result.error).toBeDefined();
      expect(result.error.code).toBe('NETWORK_ERROR');
      expect(result.error.message).toBe('Không có kết nối mạng');
    });

    it('handles errorMessage field in response', async () => {
      chrome.runtime.sendMessage.mockResolvedValueOnce({
        errorMessage: 'Lỗi không xác định'
      });

      const result = await fetchPortfolio();

      expect(result.error).toBeDefined();
      expect(result.error.message).toBe('Lỗi không xác định');
    });

    it('handles network errors gracefully', async () => {
      chrome.runtime.sendMessage.mockRejectedValueOnce(
        new Error('Network timeout')
      );

      const result = await fetchPortfolio();

      expect(result.items).toEqual([]);
      expect(result.error).toBeDefined();
      expect(result.error.code).toBe('NETWORK_ERROR');
      expect(result.error.message).toBe('Không thể kết nối. Vui lòng kiểm tra mạng.');
    });
  });

  describe('AC-7: addPortfolio - MESSAGE_TYPES.PORTFOLIO_ADD', () => {
    it('calls chrome.runtime.sendMessage with PORTFOLIO_ADD and data', async () => {
      chrome.runtime.sendMessage.mockResolvedValueOnce({
        data: { id: '1', symbol: 'VNM', quantity: 100, avg_price: 85000 }
      });

      const data = { symbol: 'VNM', quantity: 100, avgPrice: 85000 };
      await addPortfolio(data);

      expect(chrome.runtime.sendMessage).toHaveBeenCalled();
      const call = chrome.runtime.sendMessage.mock.calls[0][0];
      expect(call.type).toBe('PORTFOLIO_ADD');
      expect(call.data).toEqual(data);
    });

    it('validates symbol is provided', async () => {
      const result = await addPortfolio({ quantity: 100 });

      expect(result.error).toBeDefined();
      expect(result.error.code).toBe('VALIDATION_ERROR');
      expect(result.error.message).toContain('bắt buộc');
    });

    it('returns added item on success', async () => {
      const item = { id: '1', symbol: 'VNM', quantity: 100, avg_price: 85000 };
      chrome.runtime.sendMessage.mockResolvedValueOnce({
        data: item
      });

      const result = await addPortfolio({ symbol: 'VNM', quantity: 100, avgPrice: 85000 });

      expect(result.item).toEqual(item);
      expect(result.error).toBeNull();
    });
  });

  describe('AC-8: State Updates After Success', () => {
    it('updatePortfolio sets loading and clears error on success', async () => {
      const updatedItem = { id: '1', quantity: 150, avg_price: 85000 };
      chrome.runtime.sendMessage.mockResolvedValueOnce({
        data: updatedItem
      });

      const result = await updatePortfolio('1', { quantity: 150 });

      expect(result.item).toEqual(updatedItem);
      expect(result.error).toBeNull();
    });

    it('deletePortfolio returns success flag', async () => {
      chrome.runtime.sendMessage.mockResolvedValueOnce({
        success: true
      });

      const result = await deletePortfolio('1');

      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
    });

    it('validates deletePortfolio ID is provided', async () => {
      const result = await deletePortfolio(null);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('AC-9: Error Response Handling', () => {
    it('addPortfolio handles backend validation error', async () => {
      chrome.runtime.sendMessage.mockResolvedValueOnce({
        errorCode: 'DUPLICATE_STOCK',
        errorMessage: 'Cổ phiếu này đã có trong danh sách'
      });

      const result = await addPortfolio({ symbol: 'VNM', quantity: 100, avgPrice: 85000 });

      expect(result.error).toBeDefined();
      expect(result.error.code).toBe('DUPLICATE_STOCK');
    });

    it('updatePortfolio handles backend error', async () => {
      chrome.runtime.sendMessage.mockResolvedValueOnce({
        errorCode: 'NOT_FOUND',
        errorMessage: 'Cổ phiếu không tìm thấy'
      });

      const result = await updatePortfolio('invalid-id', { quantity: 150 });

      expect(result.error).toBeDefined();
      expect(result.error.code).toBe('NOT_FOUND');
    });

    it('updatePrices handles SSI API error', async () => {
      chrome.runtime.sendMessage.mockResolvedValueOnce({
        errorCode: 'API_ERROR',
        errorMessage: 'Không thể cập nhật giá từ SSI'
      });

      const result = await updatePrices();

      expect(result.updated).toBe(0);
      expect(result.error).toBeDefined();
    });
  });

  describe('API Response Format Flexibility', () => {
    it('returns item when response.data is undefined but response is the item', async () => {
      const item = { id: '1', symbol: 'VNM', quantity: 100 };
      chrome.runtime.sendMessage.mockResolvedValueOnce(item);

      const result = await addPortfolio({ symbol: 'VNM', quantity: 100, avgPrice: 85000 });

      expect(result.item).toEqual(item);
    });

    it('handles updatePrices response with prices object', async () => {
      chrome.runtime.sendMessage.mockResolvedValueOnce({
        updated: 3,
        prices: {
          'VNM': 90000,
          'VIC': 80000,
          'CASH': 1
        }
      });

      const result = await updatePrices();

      expect(result.updated).toBe(3);
      expect(result.prices).toEqual({
        'VNM': 90000,
        'VIC': 80000,
        'CASH': 1
      });
    });
  });

  describe('Helper: hasError', () => {
    it('detects new error format', () => {
      const response = { errorCode: 'ERROR', errorMessage: 'msg' };
      expect(hasError(response)).toBe(true);
    });

    it('detects vanilla error format', () => {
      const response = { error: { message: 'msg' } };
      expect(hasError(response)).toBe(true);
    });

    it('returns false for success response', () => {
      const response = { items: [], error: null };
      expect(hasError(response)).toBe(false);
    });
  });
});
