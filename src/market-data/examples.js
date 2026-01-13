/**
 * Market Data Module Examples
 * 
 * Demonstrates how to use the market data client with SSI provider
 * and how to extend with additional providers
 */

import { createSSIProvider } from './ssi.provider.js';
import { createMarketDataClient } from './client.js';

/**
 * EXAMPLE 1: Get stock price from SSI
 */
export async function example1_getStockPrice() {
  const provider = createSSIProvider();
  const client = createMarketDataClient([provider]);
  
  try {
    const stockData = await client.getStockPrice('ACB');
    console.log('ACB Stock Data:', {
      symbol: stockData.symbol,
      name: stockData.name,
      price: stockData.currentPrice,
      change: stockData.change,
      percentChange: stockData.percentChange + '%'
    });
  } catch (error) {
    console.error('Error:', error.message);
  }
}

/**
 * EXAMPLE 2: Get price table (bảng giá)
 */
export async function example2_getPriceTable() {
  const provider = createSSIProvider();
  const client = createMarketDataClient([provider]);
  
  try {
    // Get VN30 price table
    const table = await client.getPriceTable('VN30');
    console.log(`VN30 Price Table (${table.stocks.length} stocks):`);
    
    table.stocks.slice(0, 5).forEach(stock => {
      console.log(`  ${stock.symbol}: ${stock.currentPrice} (${stock.percentChange > 0 ? '+' : ''}${stock.percentChange}%)`);
    });
  } catch (error) {
    console.error('Error:', error.message);
  }
}

/**
 * EXAMPLE 3: Get index data
 */
export async function example3_getIndexData() {
  const provider = createSSIProvider();
  const client = createMarketDataClient([provider]);
  
  try {
    const indexData = await client.getIndexData('VNINDEX');
    console.log('VNINDEX Data:', {
      value: indexData.currentValue,
      change: indexData.change,
      percentChange: indexData.percentChange + '%',
      volume: indexData.volume,
      advances: indexData.stats.advances,
      declines: indexData.stats.declines
    });
  } catch (error) {
    console.error('Error:', error.message);
  }
}

/**
 * EXAMPLE 4: Get multiple indices at once
 */
export async function example4_getMultipleIndices() {
  const provider = createSSIProvider();
  const client = createMarketDataClient([provider]);
  
  try {
    const indices = await client.getMultipleIndices(['VNINDEX', 'VN30', 'HNX30']);
    indices.forEach(index => {
      console.log(`${index.indexCode}: ${index.currentValue} (${index.percentChange}%)`);
    });
  } catch (error) {
    console.error('Error:', error.message);
  }
}

/**
 * EXAMPLE 5: Get exchange statistics
 */
export async function example5_getExchangeStats() {
  const provider = createSSIProvider();
  const client = createMarketDataClient([provider]);
  
  try {
    const [hoseStats, hnxStats] = await Promise.all([
      client.getExchangeStats('HOSE'),
      client.getExchangeStats('HNX')
    ]);
    
    console.log('HOSE:', {
      totalVolume: hoseStats.totalVolume,
      totalValue: hoseStats.totalValue,
      advances: hoseStats.advanceCount
    });
    
    console.log('HNX:', {
      totalVolume: hnxStats.totalVolume,
      totalValue: hnxStats.totalValue,
      advances: hnxStats.advanceCount
    });
  } catch (error) {
    console.error('Error:', error.message);
  }
}

/**
 * EXAMPLE 6: Multiple stocks at once
 */
export async function example6_getMultipleStocks() {
  const provider = createSSIProvider();
  const client = createMarketDataClient([provider]);
  
  try {
    const stocks = await client.getMultipleStocks(['ACB', 'VNM', 'VCB']);
    stocks.forEach(stock => {
      console.log(`${stock.symbol}: ${stock.currentPrice} (${stock.percentChange}%)`);
    });
  } catch (error) {
    console.error('Error:', error.message);
  }
}

/**
 * EXAMPLE 7: Using cache to improve performance
 */
export async function example7_useCache() {
  const provider = createSSIProvider();
  const client = createMarketDataClient([provider]);
  
  try {
    console.time('First call');
    const data1 = await client.getStockPrice('ACB');
    console.timeEnd('First call');
    
    console.time('Second call (cached)');
    const data2 = await client.getStockPrice('ACB');
    console.timeEnd('Second call (cached)');
    
    console.log('Cache stats:', client.getCacheStats());
  } catch (error) {
    console.error('Error:', error.message);
  }
}

/**
 * EXAMPLE 8: How to create a custom provider
 * 
 * This shows how to extend the market data system with other sources
 * like Fireant, VietStock, or your own API
 */
export class CustomProvider {
  // Import the base class
  // import { MarketDataProvider } from './provider.interface.js';
  // export class CustomProvider extends MarketDataProvider {
  //
  //   constructor(options = {}) {
  //     super();
  //     this.apiKey = options.apiKey;
  //     this.baseUrl = 'https://api.yoursource.com';
  //   }
  //
  //   async getStockPrice(symbol) {
  //     const response = await fetch(`${this.baseUrl}/stocks/${symbol}?key=${this.apiKey}`);
  //     const data = await response.json();
  //     return {
  //       symbol: data.code,
  //       name: data.name,
  //       currentPrice: data.price,
  //       change: data.change,
  //       percentChange: data.changePercent,
  //       // ... map other fields
  //     };
  //   }
  //
  //   // Implement other required methods...
  //
  //   getName() {
  //     return 'CustomProvider';
  //   }
  //
  //   async isAvailable() {
  //     // Check if API is accessible
  //     return true;
  //   }
  // }

  static getTemplate() {
    return `
import { MarketDataProvider } from './provider.interface.js';

export class FireantProvider extends MarketDataProvider {
  constructor(options = {}) {
    super();
    this.apiKey = options.apiKey;
    this.baseUrl = 'https://api.fireant.vn/api/v1';
  }

  async getStockPrice(symbol) {
    const response = await fetch(
      \`\${this.baseUrl}/stocks/\${symbol}/prices?token=\${this.apiKey}\`
    );
    const data = await response.json();
    
    return {
      symbol: data.code,
      name: data.companyName,
      exchange: data.exchange,
      currentPrice: data.lastPrice,
      change: data.priceChange,
      percentChange: data.priceChangePercent,
      // ... map all fields
    };
  }

  async getMultipleStocks(symbols) {
    return Promise.all(symbols.map(s => this.getStockPrice(s)));
  }

  getName() {
    return 'Fireant';
  }

  async isAvailable() {
    try {
      const response = await fetch(\`\${this.baseUrl}/stocks?token=\${this.apiKey}\`);
      return response.ok;
    } catch {
      return false;
    }
  }
}
    `;
  }
}

/**
 * EXAMPLE 9: Real-world usage - Dashboard data fetcher
 */
export async function example9_dashboardFetcher() {
  const provider = createSSIProvider();
  const client = createMarketDataClient([provider]);
  
  try {
    // Fetch all dashboard data in parallel
    const [
      indices,
      hoseStats,
      vn30Table
    ] = await Promise.all([
      client.getMultipleIndices(['VNINDEX', 'VN30', 'HNX30', 'HNXIndex']),
      client.getExchangeStats('HOSE'),
      client.getPriceTable('VN30')
    ]);
    
    const dashboard = {
      indices: indices.map(idx => ({
        code: idx.indexCode,
        value: idx.currentValue,
        change: idx.change,
        percent: idx.percentChange
      })),
      exchangeStats: {
        hose: {
          volume: hoseStats.totalVolume,
          value: hoseStats.totalValue,
          up: hoseStats.advanceCount,
          down: hoseStats.declineCount
        }
      },
      topStocks: vn30Table.stocks.slice(0, 10).map(s => ({
        symbol: s.symbol,
        price: s.currentPrice,
        change: s.percentChange
      }))
    };
    
    console.log('Dashboard Data:', dashboard);
    return dashboard;
  } catch (error) {
    console.error('Error:', error.message);
  }
}

/**
 * EXAMPLE 10: Error handling and fallback
 */
export async function example10_errorHandling() {
  // Create multiple providers for fallback
  const ssiProvider = createSSIProvider();
  // const fireantProvider = new FireantProvider({ apiKey: 'xxx' });
  
  const client = createMarketDataClient([ssiProvider]);
  
  try {
    const stock = await client.getStockPrice('ACB');
    console.log('Data retrieved:', stock);
  } catch (error) {
    console.error('Failed to get stock data:', error.message);
    
    // Try manual fallback or cached data
    const cachedData = client.cache.get('stock:ACB');
    if (cachedData) {
      console.log('Using cached data:', cachedData);
    }
  }
}

// Run examples
if (typeof window !== 'undefined') {
  // Browser environment
  console.log('Market Data Examples loaded. Run example functions:');
  console.log('- example1_getStockPrice()');
  console.log('- example2_getPriceTable()');
  console.log('- example3_getIndexData()');
  console.log('- etc.');
}
