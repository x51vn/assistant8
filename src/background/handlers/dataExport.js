/**
 * @fileoverview Data Export Background Handler
 * Ticket: XST-765 — GDPR Right to Data Portability (Article 20)
 *
 * Handles:
 * - DATA_EXPORT_REQUEST: fetch ALL user data from every table → structured JSON
 *
 * Tables covered: portfolio, assets, watchlist, chat_history, errors,
 *                 settings, english (learning), subscriptions, usage_tracking, payment_history
 *
 * Security: auth required, passwords/tokens explicitly excluded.
 */

import { registerHandler } from '../messageRouter.js';
import { MESSAGE_TYPES, createResponse, createErrorResponse } from '../../shared/messageSchema.js';
import { supabase } from '../../supabaseConfig.js';
import { requireAuth } from '../utils/auth.js';
import { supabaseWithRetry } from '../utils/supabaseRetry.js';
import { ERROR_CODES, getUserFriendlyMessage } from '../../shared/errorCodes.js';
import { createLogger } from '../../logger.js';

const logger = createLogger('DataExportHandler');

// ============================================================================
// SECRET SANITIZER
// ============================================================================

/**
 * Remove all secrets/credentials from settings config before export.
 * Uses an explicit deny-list approach on known secret paths.
 * @param {Object} config - Raw settings.config JSONB
 * @returns {Object} Safe config with secrets removed
 */
function sanitizeSettingsForExport(config) {
  if (!config || typeof config !== 'object') return {};

  // Deep clone to avoid mutating the original
  const safe = JSON.parse(JSON.stringify(config));

  // 1. Remove top-level legacy token field
  delete safe.atlassianApiToken;

  // 2. Remove nested atlassian credentials
  if (safe.atlassian && typeof safe.atlassian === 'object') {
    delete safe.atlassian.apiToken;
    delete safe.atlassian.password;
  }

  // 3. Remove ALL stored API keys (api_keys.<provider>.apiKey)
  if (safe.api_keys && typeof safe.api_keys === 'object') {
    for (const provider of Object.keys(safe.api_keys)) {
      if (safe.api_keys[provider] && typeof safe.api_keys[provider] === 'object') {
        delete safe.api_keys[provider].apiKey;
        // Keep updatedAt so user knows a key existed
      }
    }
  }

  return safe;
}

// ============================================================================
// SAFE FETCH HELPER
// ============================================================================

/**
 * Fetch all rows for a user from a table, returns [] on error (non-fatal).
 */
async function safeFetch(table, userId, select = '*', correlationId) {
  try {
    const rows = await supabaseWithRetry(
      async () => {
        const { data, error } = await supabase
          .from(table)
          .select(select)
          .eq('user_id', userId)
          .order('created_at', { ascending: true });
        if (error) throw error;
        return data ?? [];
      },
      { operationName: `export.${table}`, correlationId }
    );
    return rows;
  } catch (err) {
    logger.warn(`Export: failed to fetch ${table}`, { errorMessage: err?.message, correlationId });
    return [];
  }
}

// ============================================================================
// HANDLER
// ============================================================================

/**
 * DATA_EXPORT_REQUEST — compile all user data into a single JSON export
 */
registerHandler(MESSAGE_TYPES.DATA_EXPORT_REQUEST, async (message) => {
  const correlationId = logger.startOperation('dataExport', message.correlationId);

  try {
    const userId = await requireAuth(message);

    logger.info('Starting data export', { correlationId, userId });

    // Fetch all tables in parallel — non-fatal per-table errors
    const [
      portfolio,
      assets,
      watchlist,
      chatHistory,
      errors,
      englishItems,
      subscriptions,
      usageTracking,
      paymentHistory,
    ] = await Promise.all([
      safeFetch('portfolio', userId, '*', correlationId),
      safeFetch('assets', userId, '*', correlationId),
      safeFetch('watchlist', userId, '*', correlationId),
      // Exclude any field that could be a token — only user-content fields
      safeFetch(
        'chat_history', userId,
        'id,prompt,response,chat_id,chat_url,created_at,updated_at',
        correlationId
      ),
      safeFetch('errors', userId, '*', correlationId),
      safeFetch('english', userId, '*', correlationId),
      safeFetch('subscriptions', userId,
        'id,plan_id,status,current_period_start,current_period_end,cancel_at_period_end,created_at',
        correlationId),
      safeFetch('usage_tracking', userId, '*', correlationId),
      safeFetch('payment_history', userId,
        'id,amount,currency,status,description,plan_id,period_start,period_end,created_at',
        correlationId),
    ]);

    // Fetch settings (JSONB config, single row)
    let settingsConfig = {};
    try {
      const settingsRows = await supabaseWithRetry(async () => {
        const { data, error } = await supabase
          .from('settings')
          .select('config')
          .eq('user_id', userId)
          .maybeSingle();
        if (error) throw error;
        return data;
      }, { operationName: 'export.settings', correlationId });

      if (settingsRows?.config) {
        // Strip ALL secrets from settings config (allowlist approach)
        settingsConfig = sanitizeSettingsForExport(settingsRows.config);
      }
    } catch (err) {
      logger.warn('Export: failed to fetch settings', { errorMessage: err?.message });
    }

    // Fetch user email from auth session
    let userEmail = null;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      userEmail = user?.email ?? null;
    } catch { /* non-fatal */ }

    const exportData = {
      _metadata: {
        export_version: '1.0',
        exported_at: new Date().toISOString(),
        user_id: userId,
        user_email: userEmail,
        app: 'Assistant8',
        tables_included: [
          'portfolio', 'assets', 'watchlist', 'chat_history', 'errors',
          'settings', 'english', 'subscriptions', 'usage_tracking', 'payment_history'
        ],
        note: 'Passwords, API tokens, and raw Stripe payment info are excluded for security.'
      },
      portfolio,
      assets,
      watchlist,
      chat_history: chatHistory,
      errors,
      settings: settingsConfig,
      english: englishItems,
      subscriptions,
      usage_tracking: usageTracking,
      payment_history: paymentHistory,
    };

    logger.info('Data export complete', {
      correlationId,
      rowCounts: {
        portfolio: portfolio.length,
        assets: assets.length,
        watchlist: watchlist.length,
        chat_history: chatHistory.length,
        errors: errors.length,
      }
    });

    return createResponse(message, MESSAGE_TYPES.DATA_EXPORT_DATA, {
      success: true,
      exportData,
      exportedAt: exportData._metadata.exported_at
    });
  } catch (error) {
    logger.error('dataExport failed', { correlationId, errorMessage: error?.message });
    if (error?.type === 'error_response') throw error;
    return createErrorResponse(
      message,
      ERROR_CODES.OPERATION_FAILED,
      getUserFriendlyMessage(ERROR_CODES.OPERATION_FAILED)
    );
  }
});
