// Portfolio P&L Calculation Module

import { MESSAGE_TYPES } from '../shared/messageSchema.js';
import { generateCorrelationId } from '../logger.js';

/**
 * ✅ Get portfolio data from Supabase via background handler
 */
export async function getPortfolioData() {
  try {
    const response = await chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.PORTFOLIO_GET,
      correlationId: generateCorrelationId(),
      timestamp: Date.now()
    });
    
    if (response.errorCode) {
      console.warn('[PortfolioPL] Failed to get portfolio:', response.errorMessage);
      return [];
    }
    
    // ✅ FIX: Items are spread directly in response, not nested in response.data
    const items = response.items || [];
    return items.map(item => ({
      id: item.id,
      code: item.symbol,
      symbol: item.symbol,
      quantity: item.quantity,
      entry: item.avg_price,
      avg_price: item.avg_price,
      currentPrice: item.current_price,
      current_price: item.current_price
    }));
  } catch (error) {
    console.error('[PortfolioPL] Get portfolio error:', error);
    return [];
  }
}

export function calculateStockPL(stock) {
  if (!stock.entry || !stock.currentPrice) return null;
  
  const quantity = stock.quantity || 0;
  const entryPrice = parseFloat(stock.entry) || 0;
  const currentPrice = parseFloat(stock.currentPrice) || 0;
  
  const entryValue = entryPrice * quantity;
  const currentValue = currentPrice * quantity;
  const pl = currentValue - entryValue;
  const plPercent = entryPrice > 0 ? (pl / entryValue) * 100 : 0;
  
  return {
    entryValue,
    currentValue,
    pl,
    plPercent,
    priceChange: currentPrice - entryPrice,
    priceChangePercent: entryPrice > 0 ? ((currentPrice - entryPrice) / entryPrice) * 100 : 0
  };
}

export function calculatePortfolioTotalPL(portfolio) {
  let totalEntryValue = 0;
  let totalCurrentValue = 0;
  const stocks = [];

  portfolio.forEach(stock => {
    const pl = calculateStockPL(stock);
    if (pl) {
      totalEntryValue += pl.entryValue;
      totalCurrentValue += pl.currentValue;
      stocks.push({ ...stock, pl });
    }
  });

  const totalPL = totalCurrentValue - totalEntryValue;
  const totalPLPercent = totalEntryValue > 0 ? (totalPL / totalEntryValue) * 100 : 0;

  return {
    totalEntryValue,
    totalCurrentValue,
    totalPL,
    totalPLPercent,
    stocks,
    cash: 0
  };
}

export async function updateStockCurrentPrice(code, price) {
  try {
    const portfolio = await getPortfolioData();
    const stock = portfolio.find(s => s.symbol === code || s.code === code);
    
    if (!stock) {
      console.warn('[PortfolioPL] Stock not found:', code);
      return null;
    }
    
    // Update via Supabase
    const response = await chrome.runtime.sendMessage({
      v: 1,
      type: MESSAGE_TYPES.PORTFOLIO_UPDATE,
      correlationId: generateCorrelationId(),
      timestamp: Date.now(),
      data: {
        id: stock.id,
        updates: {
          current_price: price,
          updated_at: new Date().toISOString()
        }
      }
    });
    
    if (response.errorCode) {
      console.warn('[PortfolioPL] Failed to update stock price:', response.errorMessage);
      return null;
    }
    
    return response.data;
  } catch (error) {
    console.error('[PortfolioPL] Update stock price error:', error);
    return null;
  }
}

export async function bulkUpdatePrices(priceMap) {
  // priceMap: { 'VNM': 100.5, 'BID': 45.2 }
  try {
    const portfolio = await getPortfolioData();
    const updates = [];
    
    portfolio.forEach(stock => {
      if (priceMap[stock.symbol] || priceMap[stock.code]) {
        const newPrice = priceMap[stock.symbol] || priceMap[stock.code];
        updates.push({
          id: stock.id,
          updates: {
            current_price: newPrice,
            updated_at: new Date().toISOString()
          }
        });
      }
    });
    
    // Send batch updates
    for (const update of updates) {
      await chrome.runtime.sendMessage({
        v: 1,
        type: MESSAGE_TYPES.PORTFOLIO_UPDATE,
        correlationId: generateCorrelationId(),
        timestamp: Date.now(),
        data: update
      });
    }
    
    // Return updated portfolio
    return await getPortfolioData();
  } catch (error) {
    console.error('[PortfolioPL] Bulk update prices error:', error);
    return [];
  }
}

export function formatCurrency(value) {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND'
  }).format(value);
}

export function formatPercent(value) {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export function getPLClass(value) {
  if (value > 0) return 'pl-positive';
  if (value < 0) return 'pl-negative';
  return 'pl-neutral';
}

export function getPLColor(value) {
  if (value > 0) return '#28a745';  // Green
  if (value < 0) return '#dc3545';  // Red
  return '#6c757d';                 // Gray
}
