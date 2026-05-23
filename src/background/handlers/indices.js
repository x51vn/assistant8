/**
 * Market Indices Handler - Background script
 * Fetches live market indices (VNI, VN30, HNX, UPCOM) from SSI iBoard API
 *
 * SSI API Endpoints:
 * - GET /exchange-index/{indexCode} - Single index data
 * - POST /exchange-index/multiple - Multiple indices at once (not always reliable)
 *
 * Message Types:
 * - MARKET_INDICES_GET: Fetch current market indices
 */

import { registerHandler } from '../messageRouter.js';
import { MESSAGE_TYPES, createResponse, createErrorResponse } from '../../shared/messageSchema.js';
import { createLogger } from '../../logger.js';
import { SSI_REQUEST_TIMEOUT_MS } from '../../shared/appConstants.js';
import { ERROR_CODES } from '../../shared/errorCodes.js';

const logger = createLogger('Handlers/MarketIndices');

const SSI_API_BASE = 'https://iboard-query.ssi.com.vn';

/**
 * Index codes mapping:
 * - SSI uses specific codes for each index
 * - We map them to user-friendly display symbols
 * - Verified working: VNINDEX, VN30, HNXIndex
 * - Note: UpcomIndex returns empty data from SSI API
 */
const INDEX_CONFIGS = [
  { code: 'VNINDEX',   symbol: 'VNI',   name: 'VN-Index' },
  { code: 'VN30',      symbol: 'VN30',  name: 'VN30' },
  { code: 'HNXIndex',  symbol: 'HNX',   name: 'HNX-Index' },
];

/**
 * Handle MARKET_INDICES_GET message
 * Fetches current market indices from SSI iBoard API
 */
registerHandler(MESSAGE_TYPES.MARKET_INDICES_GET, async (message) => {
  const correlationId = message.correlationId;
  logger.info('Handling MARKET_INDICES_GET', { correlationId });

  try {
    const indices = await fetchIndicesFromSSI(correlationId);

    logger.info('Indices fetched successfully', { correlationId, count: indices.length });

    return createResponse(message, MESSAGE_TYPES.MARKET_INDICES_DATA, {
      success: true,
      indices: indices,
      timestamp: Date.now()
    });
  } catch (error) {
    logger.error('Failed to fetch indices', { correlationId, error: error.message });

    return createErrorResponse(
      message,
      ERROR_CODES.SSI_API_ERROR,
      error.message || 'Không thể tải chỉ số thị trường. Vui lòng thử lại.'
    );
  }
});

/**
 * Fetch a single index from SSI API
 * Endpoint: GET /exchange-index/{indexCode}
 *
 * @param {Object} config - Index config { code, symbol, name }
 * @param {string} correlationId - Request correlation ID
 * @returns {Promise<Object|null>} Transformed index data or null on failure
 */
async function fetchSingleIndex(config, correlationId) {
  const { code, symbol, name } = config;
  const controller = new AbortController();
  const timeout = SSI_REQUEST_TIMEOUT_MS || 5000;
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const url = `${SSI_API_BASE}/exchange-index/${code}`;
    logger.debug(`Fetching index ${code}`, { correlationId, url });

    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      logger.warn(`SSI API returned ${response.status} for index ${code}`, { correlationId });
      return null;
    }

    const data = await response.json();

    // SSI wraps index data in .data property
    // Response structure: { code: 'SUCCESS', data: { indexValue, change, ... } }
    const indexData = data.data || data;

    // Validate that we got actual data
    if (!indexData || !indexData.indexValue) {
      logger.warn(`No index data returned for ${code}`, { correlationId });
      return null;
    }

    // SSI API provides change and changePercent directly
    const indexValue = parseFloat(indexData.indexValue);
    const change = parseFloat(indexData.change || 0);
    const changePercent = parseFloat(indexData.changePercent || 0);

    logger.debug(`Index ${code} fetched`, {
      correlationId,
      indexValue,
      change: change.toFixed(2),
      changePercent: changePercent.toFixed(2)
    });

    return {
      symbol,
      name,
      value: indexValue,
      change: parseFloat(change.toFixed(2)),
      changePercent: parseFloat(changePercent.toFixed(2)),
      volume: indexData.totalQtty || indexData.allQty || 0,
      totalValue: indexData.totalValue || indexData.allValue || 0,
      advances: indexData.advances || 0,
      declines: indexData.declines || 0,
      unchanged: indexData.nochanges || 0,
      updatedAt: new Date().toISOString()
    };
  } catch (error) {
    clearTimeout(timeoutId);

    if (error.name === 'AbortError') {
      logger.warn(`Timeout fetching index ${code}`, { correlationId });
    } else {
      logger.warn(`Error fetching index ${code}`, { correlationId, error: error.message });
    }
    return null;
  }
}

/**
 * Fetch all market indices from SSI iBoard API
 * Fetches each index in parallel for speed
 *
 * @param {string} correlationId - Request correlation ID
 * @returns {Promise<Array>} Array of index objects
 */
async function fetchIndicesFromSSI(correlationId) {
  logger.info('Fetching indices from SSI API', { correlationId, indices: INDEX_CONFIGS.map(c => c.code) });

  const startTime = Date.now();

  // Fetch all indices in parallel
  const results = await Promise.all(
    INDEX_CONFIGS.map(config => fetchSingleIndex(config, correlationId))
  );

  // Filter out failed fetches
  const indices = results.filter(r => r !== null);

  const duration = Date.now() - startTime;
  logger.info('SSI indices fetch completed', {
    correlationId,
    total: INDEX_CONFIGS.length,
    success: indices.length,
    failed: INDEX_CONFIGS.length - indices.length,
    duration: `${duration}ms`
  });

  if (indices.length === 0) {
    throw new Error('Không thể lấy dữ liệu chỉ số từ SSI. Vui lòng kiểm tra kết nối mạng.');
  }

  return indices;
}
