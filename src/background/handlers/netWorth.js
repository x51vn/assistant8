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

const logger = createLogger('Handlers/NetWorth');

/**
 * Calculate net worth from assets and portfolio
 * @param {Object[]} assets - Active assets
 * @param {Object[]} portfolio - Portfolio items
 * @returns {{ total: number, totalAssets: number, totalDebts: number, breakdown: Object, debtBreakdown: Object }}
 */
function calculateNetWorth(assets, portfolio) {
  const breakdown = {};
  let totalAssets = 0;
  let totalDebts = 0;
  const debtBreakdown = {};

  // Aggregate assets by type, separate debts
  for (const asset of assets) {
    const type = asset.asset_type || 'other';
    const value = Number(asset.current_value) || 0;

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
        // Combine breakdowns for UI
        const breakdown = {
          ...(summary.assets_breakdown || {}),
          stocks: summary.total_portfolio || 0
        };

        // Separate debts
        const debtBreakdown = summary.assets_breakdown?.debt ? 
          { debt: summary.assets_breakdown.debt } : 
          {};

        logger.info('Net worth from summary', { 
          correlationId, 
          total: summary.total_net_worth,
          source: 'asset_summaries'
        });

        return createResponse(message, MESSAGE_TYPES.NET_WORTH_DATA, {
          success: true,
          total: summary.total_net_worth || 0,
          totalPortfolio: summary.total_portfolio || 0,
          totalAssets: (summary.total_assets || 0) + (summary.total_portfolio || 0),
          totalDebts: summary.assets_breakdown?.debt || 0,
          breakdown,
          debtBreakdown,
          portfolioBreakdown: summary.portfolio_breakdown || {},
          assetsBreakdown: summary.assets_breakdown || {},
          calculatedAt: summary.updated_at,
          source: 'summary'
        });
      }
    }

    // Fallback: Calculate on-the-fly if no summary exists
    logger.info('No summary found, calculating on-the-fly', { correlationId });

    // Fetch active assets
    const assets = await supabaseWithRetry(
      async () => {
        const { data, error } = await supabase
          .from('assets')
          .select('asset_type, current_value')
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

    // Calculate net worth
    const { total, totalAssets, totalDebts, breakdown, debtBreakdown } = calculateNetWorth(assets, portfolio);

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
          .select('asset_type, current_value')
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

    const { total, breakdown } = calculateNetWorth(assets, portfolio);

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
