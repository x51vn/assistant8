// Portfolio P&L Calculation Module

export async function getPortfolioData() {
  const stored = await chrome.storage.local.get('portfolio');
  return stored.portfolio || [];
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
  const portfolio = await getPortfolioData();
  const index = portfolio.findIndex(s => s.code === code);
  
  if (index >= 0) {
    portfolio[index].currentPrice = price;
    portfolio[index].priceUpdatedAt = new Date().toISOString();
    await chrome.storage.local.set({ portfolio });
    return portfolio[index];
  }
  return null;
}

export async function bulkUpdatePrices(priceMap) {
  // priceMap: { 'VNM': 100.5, 'BID': 45.2 }
  const portfolio = await getPortfolioData();
  
  portfolio.forEach(stock => {
    if (priceMap[stock.code]) {
      stock.currentPrice = priceMap[stock.code];
      stock.priceUpdatedAt = new Date().toISOString();
    }
  });
  
  await chrome.storage.local.set({ portfolio });
  return portfolio;
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
