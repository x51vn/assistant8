/**
 * @fileoverview Net Worth & Asset History Handlers (Supabase)
 * Handles Net Worth calculation and historical snapshots
 * Ticket: XST-698
 */

import { registerHandler } from '../messageRouter.js';
import { MESSAGE_TYPES, createResponse, createErrorResponse } from '../../shared/messageSchema.js';
import { createLogger } from '../../logger.js';
import { ERROR_CODES, getUserFriendlyMessage } from '../../shared/errorCodes.js';
import { supabase } from '../../supabaseConfig.js';
import { requireAuth } from '../utils/auth.js';
import { supabaseWithRetry } from '../utils/supabaseRetry.js';
import { getCommodityDataClient, getPricePerUnit } from '../../commodity-data/index.js';

const logger = createLogger('Handlers/NetWorth');

// Get singleton client for commodity data
const commodityClient = getCommodityDataClient();

/**
 * Extract gold unit from notes field
 * Pattern: [Unit: chi] or [Unit: luong]
 */
function extractGoldUnit(notes) {
  if (!notes) return 'chi';

  const unitMatch = notes.match(/\[Unit:\s*([^\]]+)\]/i);
  if (unitMatch) {
    return unitMatch[1].trim().toLowerCase();
  }

  const lower = notes.toLowerCase();
  if (lower.includes('lượng') || lower.includes('luong') || lower.includes('cây') || lower.includes('cay')) {
    return 'luong';
  }
  if (lower.includes('chỉ') || lower.includes('chi')) {
    return 'chi';
  }
  if (lower.includes('gram') || lower.includes('g ')) {
    return 'gram';
  }
  if (lower.includes('phân') || lower.includes('phan')) {
    return 'phan';
  }

  return 'chi'; // Default to chỉ
}

/**
 * Extract gold type from asset name
 */
function extractGoldType(name) {
  if (!name) return 'SJC';

  const upper = name.toUpperCase();
  if (upper.includes('SJC')) return 'SJC';
  if (upper.includes('9999') || upper.includes('99,99')) return 'GOLD_9999';
  if (upper.includes('999')) return 'GOLD_999';
  if (upper.includes('24K')) return 'GOLD_24K';
  if (upper.includes('18K') || upper.includes('75')) return 'GOLD_18K';
  if (upper.includes('NHẪN') || upper.includes('NHAN')) return 'GOLD_RING';
  if (upper.includes('TRANG SỨC') || upper.includes('JEWELRY') || upper.includes('NỮ')) return 'GOLD_JEWELRY';

  return 'SJC';
}

/**
 * Calculate net worth from assets and portfolio
 * @param {Object[]} assets - Active assets
 * @param {Object[]} portfolio - Portfolio items
 * @param {Object[]} goldPrices - Live gold prices (optional, for gold asset calculation)
 * @returns {{ total: number, totalAssets: number, totalDebts: number, breakdown: Object, debtBreakdown: Object }}
 */
function calculateNetWorth(assets, portfolio, goldPrices = []) {
  const breakdown = {};
  let totalAssets = 0;
  let totalDebts = 0;
  const debtBreakdown = {};

  // Aggregate assets by type, separate debts
  for (const asset of assets) {
    const type = asset.asset_type || 'other';
    let value = Number(asset.current_value) || 0;

    // For gold assets: calculate from live price instead of stored value
    if (type === 'gold' && asset.quantity && goldPrices.length > 0) {
      const goldType = extractGoldType(asset.name);
      const goldPrice = goldPrices.find(p => p.type === goldType) || goldPrices[0];

      if (goldPrice) {
        const unit = extractGoldUnit(asset.notes) || 'chi';
        const quantity = Number(asset.quantity) || 0;
        const pricePerUnit = getPricePerUnit(goldPrice.pricePerLuong, unit);
        value = Math.round(quantity * pricePerUnit);
      }
    }

    if (type === 'debt') {
      // Debts are liabilities (reduce net worth)
      totalDebts += value;
      debtBreakdown[type] = (debtBreakdown[type] || 0) + value;
    } else {
      // Regular assets
      totalAssets += value;
      breakdown[type] = (breakdown[type] || 0) + value;
    }
  }

  // Add stocks from portfolio
  let stocksTotal = 0;
  if (portfolio && portfolio.length > 0) {
    stocksTotal = portfolio.reduce((sum, item) => {
      const price = Number(item.current_price) || 0;
      const qty = Number(item.quantity) || 0;
      return sum + (price * qty);
    }, 0);

    if (stocksTotal > 0) {
      breakdown.stocks = stocksTotal;
      totalAssets += stocksTotal;
    }
  }

  // Calculate total: assets - debts
  const total = totalAssets - totalDebts;

  return { 
    total, 
    totalAssets, 
    totalDebts, 
    breakdown, 
    debtBreakdown
  };
}

/**
 * Handle NET_WORTH_GET
 * Fetch pre-computed totals from asset_summaries table (updated by DB triggers)
 * Falls back to on-the-fly calculation if summary not found
 */
registerHandler(MESSAGE_TYPES.NET_WORTH_GET, async (message) => {
  const correlationId = message.correlationId;
  logger.info('Handling NET_WORTH_GET', { correlationId });

  try {
    const userId = await requireAuth(message);
    const { forceRecalculate = false } = message.data || {};

    // Try to fetch from pre-computed summary first (fast path)
    if (!forceRecalculate) {
      const summary = await supabaseWithRetry(
        async () => {
          const { data, error } = await supabase
            .from('asset_summaries')
            .select('total_portfolio, total_assets, total_net_worth, portfolio_breakdown, assets_breakdown, updated_at')
            .eq('user_id', userId)
            .single();

          if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found
          return data;
        },
        {
          operationName: 'getAssetSummary',
          correlationId
        }
      );

      if (summary) {
        // Even with pre-computed summary, fetch live gold prices to recalculate gold values
        let goldPrices = [];
        try {
          goldPrices = await commodityClient.getAllGoldPrices();
        } catch (error) {
          logger.warn('Failed to fetch live gold prices for summary', { correlationId, error: error.message });
          // Continue without live prices - will use pre-computed values
        }

        // If we have live gold prices, recalculate gold portion
        let adjustedBreakdown = { ...(summary.assets_breakdown || {}) };
        let adjustedTotalAssets = summary.total_assets || 0;

        if (goldPrices.length > 0 && adjustedBreakdown.gold) {
          // Fetch gold assets to recalculate with live prices
          const goldAssets = await supabaseWithRetry(
            async () => {
              const { data, error } = await supabase
                .from('assets')
                .select('id, name, quantity, notes')
                .eq('user_id', userId)
                .eq('asset_type', 'gold')
                .eq('is_active', true);

              if (error) throw error;
              return data || [];
            },
            { operationName: 'getGoldAssetsForSummary', correlationId }
          );

          // Recalculate gold total
          let goldTotal = 0;
          for (const asset of goldAssets) {
            if (asset.quantity) {
              const goldType = extractGoldType(asset.name);
              const goldPrice = goldPrices.find(p => p.type === goldType) || goldPrices[0];
              if (goldPrice) {
                const unit = extractGoldUnit(asset.notes) || 'chi';
                const quantity = Number(asset.quantity) || 0;
                const pricePerUnit = getPricePerUnit(goldPrice.pricePerLuong, unit);
                goldTotal += Math.round(quantity * pricePerUnit);
              }
            }
          }

          // Adjust breakdown with live gold values
          const goldDifference = goldTotal - (adjustedBreakdown.gold || 0);
          adjustedBreakdown.gold = goldTotal;
          adjustedTotalAssets += goldDifference;
        }

        // Combine breakdowns for UI
        const breakdown = {
          ...adjustedBreakdown,
          stocks: summary.total_portfolio || 0
        };

        // Separate debts
        const debtBreakdown = adjustedBreakdown?.debt ?
          { debt: adjustedBreakdown.debt } :
          {};

        const adjustedNetWorth = adjustedTotalAssets - (summary.assets_breakdown?.debt || 0);

        logger.info('Net worth from summary (with live gold prices)', {
          correlationId,
          total: adjustedNetWorth,
          source: 'asset_summaries + live_gold_prices'
        });

        return createResponse(message, MESSAGE_TYPES.NET_WORTH_DATA, {
          success: true,
          total: adjustedNetWorth,
          totalPortfolio: summary.total_portfolio || 0,
          totalAssets: adjustedTotalAssets + (summary.total_portfolio || 0),
          totalDebts: summary.assets_breakdown?.debt || 0,
          breakdown,
          debtBreakdown,
          portfolioBreakdown: summary.portfolio_breakdown || {},
          assetsBreakdown: adjustedBreakdown,
          calculatedAt: summary.updated_at,
          source: 'summary + live_gold'
        });
      }
    }

    // Fallback: Calculate on-the-fly if no summary exists
    logger.info('No summary found, calculating on-the-fly', { correlationId });

    // Fetch active assets (including fields needed for gold price calculation)
    const assets = await supabaseWithRetry(
      async () => {
        const { data, error } = await supabase
          .from('assets')
          .select('asset_type, current_value, name, quantity, notes')
          .eq('user_id', userId)
          .eq('is_active', true);

        if (error) throw error;
        return data || [];
      },
      {
        operationName: 'getAssetsForNetWorth',
        correlationId
      }
    );

    // Fetch live gold prices for dynamic calculation
    let goldPrices = [];
    try {
      goldPrices = await commodityClient.getAllGoldPrices();
    } catch (error) {
      logger.warn('Failed to fetch live gold prices', { correlationId, error: error.message });
      // Continue without live prices - will use stored values
    }

    // Fetch portfolio
    const portfolio = await supabaseWithRetry(
      async () => {
        const { data, error } = await supabase
          .from('portfolio')
          .select('current_price, avg_price, quantity')
          .eq('user_id', userId);

        if (error) throw error;
        return data || [];
      },
      {
        operationName: 'getPortfolioForNetWorth',
        correlationId
      }
    );

    // Calculate net worth (pass goldPrices for live calculation)
    const { total, totalAssets, totalDebts, breakdown, debtBreakdown } = calculateNetWorth(assets, portfolio, goldPrices);

    logger.info('Net worth calculated on-the-fly', { 
      correlationId, 
      total, 
      totalAssets,
      totalDebts,
      assetTypes: Object.keys(breakdown).length 
    });

    return createResponse(message, MESSAGE_TYPES.NET_WORTH_DATA, {
      success: true,
      total,
      totalAssets,
      totalDebts,
      breakdown,
      debtBreakdown,
      calculatedAt: new Date().toISOString(),
      source: 'calculated'
    });

  } catch (error) {
    if (error.errorCode) return error;

    logger.error('Net worth fetch failed', { correlationId, error: error.message });
    return createErrorResponse(
      message,
      ERROR_CODES.SUPABASE_ERROR,
      'Không thể tải tổng tài sản. Vui lòng thử lại.',
      { technicalError: error.message }
    );
  }
});

/**
 * Handle ASSET_HISTORY_GET
 * Get historical asset snapshots
 */
registerHandler(MESSAGE_TYPES.ASSET_HISTORY_GET, async (message) => {
  const correlationId = message.correlationId;
  logger.info('Handling ASSET_HISTORY_GET', { correlationId });

  try {
    const userId = await requireAuth(message);
    const { 
      range = '30d', // '7d', '30d', '90d', '1y', 'all'
      startDate,
      endDate 
    } = message.data || {};

    // Calculate date range
    let fromDate;
    const toDate = endDate ? new Date(endDate) : new Date();

    if (startDate) {
      fromDate = new Date(startDate);
    } else {
      fromDate = new Date();
      switch (range) {
        case '7d':
          fromDate.setDate(fromDate.getDate() - 7);
          break;
        case '30d':
          fromDate.setDate(fromDate.getDate() - 30);
          break;
        case '90d':
          fromDate.setDate(fromDate.getDate() - 90);
          break;
        case '1y':
          fromDate.setFullYear(fromDate.getFullYear() - 1);
          break;
        case 'all':
          fromDate = new Date('2020-01-01'); // Reasonable start date
          break;
        default:
          fromDate.setDate(fromDate.getDate() - 30);
      }
    }

    // Format dates for query
    const fromDateStr = fromDate.toISOString().split('T')[0];
    const toDateStr = toDate.toISOString().split('T')[0];

    // Fetch history
    const history = await supabaseWithRetry(
      async () => {
        const { data, error } = await supabase
          .from('asset_history')
          .select('snapshot_date, total_value, breakdown')
          .eq('user_id', userId)
          .gte('snapshot_date', fromDateStr)
          .lte('snapshot_date', toDateStr)
          .order('snapshot_date', { ascending: true });

        if (error) throw error;
        return data || [];
      },
      {
        operationName: 'getAssetHistory',
        correlationId
      }
    );

    logger.info('Asset history fetched', { 
      correlationId, 
      range, 
      recordCount: history.length 
    });

    return createResponse(message, MESSAGE_TYPES.ASSET_HISTORY_DATA, {
      success: true,
      history,
      range,
      fromDate: fromDateStr,
      toDate: toDateStr
    });

  } catch (error) {
    if (error.errorCode) return error;

    logger.error('Asset history fetch failed', { correlationId, error: error.message });
    return createErrorResponse(
      message,
      ERROR_CODES.SUPABASE_ERROR,
      'Không thể tải lịch sử tài sản. Vui lòng thử lại.',
      { technicalError: error.message }
    );
  }
});

/**
 * Handle ASSET_SNAPSHOT_CREATE
 * Create a daily snapshot of net worth
 */
registerHandler(MESSAGE_TYPES.ASSET_SNAPSHOT_CREATE, async (message) => {
  const correlationId = message.correlationId;
  logger.info('Handling ASSET_SNAPSHOT_CREATE', { correlationId });

  try {
    const userId = await requireAuth(message);
    const { date } = message.data || {};

    // Use provided date or today
    const snapshotDate = date || new Date().toISOString().split('T')[0];

    // First calculate current net worth
    const assets = await supabaseWithRetry(
      async () => {
        const { data, error } = await supabase
          .from('assets')
          .select('asset_type, current_value, name, quantity, notes')
          .eq('user_id', userId)
          .eq('is_active', true);

        if (error) throw error;
        return data || [];
      },
      {
        operationName: 'getAssetsForSnapshot',
        correlationId
      }
    );

    // Fetch live gold prices for dynamic calculation
    let goldPrices = [];
    try {
      goldPrices = await commodityClient.getAllGoldPrices();
    } catch (error) {
      logger.warn('Failed to fetch live gold prices for snapshot', { correlationId, error: error.message });
      // Continue without live prices - will use stored values
    }

    const portfolio = await supabaseWithRetry(
      async () => {
        const { data, error } = await supabase
          .from('portfolio')
          .select('current_price, quantity')
          .eq('user_id', userId);

        if (error) throw error;
        return data || [];
      },
      {
        operationName: 'getPortfolioForSnapshot',
        correlationId
      }
    );

    const { total, breakdown } = calculateNetWorth(assets, portfolio, goldPrices);

    // Upsert snapshot (update if exists for this date)
    const snapshot = await supabaseWithRetry(
      async () => {
        const { data, error } = await supabase
          .from('asset_history')
          .upsert(
            {
              user_id: userId,
              snapshot_date: snapshotDate,
              total_value: total,
              breakdown
            },
            {
              onConflict: 'user_id,snapshot_date'
            }
          )
          .select()
          .single();

        if (error) throw error;
        return data;
      },
      {
        operationName: 'createAssetSnapshot',
        correlationId
      }
    );

    logger.info('Asset snapshot created', { 
      correlationId, 
      date: snapshotDate, 
      total 
    });

    return createResponse(message, MESSAGE_TYPES.ASSET_SNAPSHOT_CREATED, {
      success: true,
      snapshot
    });

  } catch (error) {
    if (error.errorCode) return error;

    logger.error('Asset snapshot creation failed', { correlationId, error: error.message });
    return createErrorResponse(
      message,
      ERROR_CODES.SUPABASE_ERROR,
      'Không thể tạo snapshot tài sản. Vui lòng thử lại.',
      { technicalError: error.message }
    );
  }
});

// Export for testing
export { calculateNetWorth };

logger.info('Net Worth handlers registered');
