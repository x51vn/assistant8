/**
 * @fileoverview Market Snapshot Service — Facts Layer
 * Ticket: FSD-003 — MarketSnapshotFact for pipeline injection
 *
 * Fetches live market indices (VNINDEX, VN30, HNX) from SSI iBoard API
 * and returns a structured MarketSnapshotFact following the Facts contract.
 *
 * Used by:
 * - Market Assessment handler (inject into prompt)
 * - Stock Research orchestrator (inject into analysis prompt)
 * - Background watchlist handler (optional context)
 *
 * Contract:
 * {
 *   asOf: ISO timestamp,
 *   source: { provider, endpoint },
 *   indices: [{ symbol, value, change, changePercent, volume, advances, declines, unchanged }]
 * }
 */

import { createLogger } from '../../logger.js';
import { SSI_REQUEST_TIMEOUT_MS } from '../../shared/appConstants.js';

const logger = createLogger('MarketSnapshotService');

const SSI_API_BASE = 'https://iboard-query.ssi.com.vn';

/**
 * Index codes to fetch for the snapshot.
 * Same codes used by indices.js handler.
 */
const INDEX_CONFIGS = [
  { code: 'VNINDEX', symbol: 'VNI', name: 'VN-Index' },
  { code: 'VN30', symbol: 'VN30', name: 'VN30' },
  { code: 'HNXIndex', symbol: 'HNX', name: 'HNX-Index' },
];

/**
 * Fetch a single index from SSI API.
 * @param {Object} config - { code, symbol, name }
 * @returns {Promise<Object|null>}
 */
async function fetchSingleIndex(config) {
  const { code, symbol, name } = config;
  const controller = new AbortController();
  const timeout = SSI_REQUEST_TIMEOUT_MS || 5000;
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const url = `${SSI_API_BASE}/exchange-index/${code}`;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      logger.warn(`SSI returned ${response.status} for ${code}`);
      return null;
    }

    const data = await response.json();
    const indexData = data.data || data;

    if (!indexData || !indexData.indexValue) {
      return null;
    }

    return {
      symbol,
      name,
      value: parseFloat(indexData.indexValue),
      change: parseFloat((indexData.change || 0).toFixed(2)),
      changePercent: parseFloat((indexData.changePercent || 0).toFixed(2)),
      volume: indexData.totalQtty || indexData.allQty || 0,
      totalValue: indexData.totalValue || indexData.allValue || 0,
      advances: indexData.advances || 0,
      declines: indexData.declines || 0,
      unchanged: indexData.nochanges || 0,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      logger.warn(`Timeout fetching index ${code}`);
    } else {
      logger.warn(`Error fetching index ${code}`, { error: error.message });
    }
    return null;
  }
}

/**
 * Fetch a full MarketSnapshotFact.
 *
 * @param {Object} [options]
 * @param {string} [options.correlationId] - For logging
 * @returns {Promise<MarketSnapshotFact|null>} Snapshot or null on complete failure
 *
 * @typedef {Object} MarketSnapshotFact
 * @property {string} asOf - ISO timestamp
 * @property {{ provider: string, endpoint: string }} source
 * @property {Array<IndexFact>} indices
 *
 * @typedef {Object} IndexFact
 * @property {string} symbol
 * @property {string} name
 * @property {number} value
 * @property {number} change
 * @property {number} changePercent
 * @property {number} volume
 * @property {number} advances
 * @property {number} declines
 * @property {number} unchanged
 */
export async function fetchMarketSnapshot(options = {}) {
  const { correlationId } = options;
  const startTime = Date.now();

  logger.info('Fetching market snapshot', { correlationId });

  try {
    const results = await Promise.all(
      INDEX_CONFIGS.map(config => fetchSingleIndex(config))
    );

    const indices = results.filter(r => r !== null);

    if (indices.length === 0) {
      logger.warn('All index fetches failed — snapshot unavailable', { correlationId });
      return null;
    }

    const snapshot = {
      asOf: new Date().toISOString(),
      source: {
        provider: 'ssi',
        endpoint: '/exchange-index/{indexCode}',
      },
      indices,
    };

    const latency = Date.now() - startTime;
    logger.info('Market snapshot fetched', {
      correlationId,
      indexCount: indices.length,
      latencyMs: latency,
    });

    return snapshot;
  } catch (error) {
    logger.error('fetchMarketSnapshot failed', {
      correlationId,
      error: error.message,
    });
    return null;
  }
}

/**
 * Build a text block to inject into an LLM prompt from a MarketSnapshotFact.
 *
 * @param {MarketSnapshotFact|null} snapshot
 * @returns {string} Prompt section (empty string if snapshot is null)
 */
export function buildMarketSnapshotPromptSection(snapshot) {
  if (!snapshot || !snapshot.indices || snapshot.indices.length === 0) {
    return '';
  }

  const lines = [
    `\n## Dữ kiện thị trường (Market Snapshot Facts)`,
    `Thời điểm: ${snapshot.asOf}`,
    `Nguồn: ${snapshot.source.provider} (${snapshot.source.endpoint})`,
    '',
  ];

  for (const idx of snapshot.indices) {
    const dir = idx.change >= 0 ? '▲' : '▼';
    lines.push(
      `- **${idx.name}** (${idx.symbol}): ${idx.value.toLocaleString('vi-VN')} ${dir} ${Math.abs(idx.change).toFixed(2)} (${idx.changePercent >= 0 ? '+' : ''}${idx.changePercent.toFixed(2)}%)` +
      ` | KL: ${(idx.volume / 1e6).toFixed(1)}M | Tăng/Giảm/Đứng: ${idx.advances}/${idx.declines}/${idx.unchanged}`
    );
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Fetch price for a single symbol from SSI (for PriceFact).
 *
 * @param {string} symbol - Stock ticker
 * @param {Object} [options]
 * @returns {Promise<PriceFact|null>}
 *
 * @typedef {Object} PriceFact
 * @property {string} symbol
 * @property {number} price
 * @property {string} source
 * @property {string} asOf
 */
export async function fetchPriceFact(symbol, options = {}) {
  const controller = new AbortController();
  const timeout = SSI_REQUEST_TIMEOUT_MS || 5000;
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const url = `${SSI_API_BASE}/stock/${symbol.toUpperCase()}`;
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });

    clearTimeout(timeoutId);
    if (!response.ok) return null;

    const data = await response.json();
    const stockData = data.data || data;
    if (!stockData) return null;

    // SSI provides matchedPrice or lastPrice
    const price = stockData.matchedPrice || stockData.basicPrice || stockData.lastPrice || 0;
    if (!price || price <= 0) return null;

    return {
      symbol: symbol.toUpperCase(),
      price: price * 1000, // SSI returns price / 1000
      source: 'SSI',
      asOf: new Date().toISOString(),
    };
  } catch (error) {
    clearTimeout(timeoutId);
    return null;
  }
}
