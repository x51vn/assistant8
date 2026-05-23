/**
 * @fileoverview Background handler for LLM API key management
 *
 * Persists API keys to Supabase `settings` table (JSONB) per-user.
 * RLS enforces auth.uid() = user_id.
 *
 * Message types handled:
 *  - SETTINGS_APIKEY_SET        → store key in Supabase
 *  - SETTINGS_APIKEY_GET        → read key from Supabase
 *  - SETTINGS_APIKEY_DELETE     → remove key from Supabase
 *  - SETTINGS_APIKEY_MIGRATE    → migrate local keys → Supabase
 *  - SETTINGS_APIKEY_HEALTHCHECK → test provider connection
 *
 * Implementation notes:
 *  - Keys stored as JSONB in `settings.config` under key `api_keys.<provider>`
 *  - Value shape: { apiKey: "<masked>", updatedAt: ISO }
 *  - Consider enabling pgcrypto / Supabase DB KMS for encryption-at-rest
 *  - Keys are NEVER logged; only provider name and correlationId appear in logs
 *
 * Ticket: llmClient feature
 */

import { registerHandler } from '../messageRouter.js';
import { MESSAGE_TYPES, createResponse, createErrorResponse } from '../../shared/messageSchema.js';
import { createLogger } from '../../logger.js';
import { requireAuth } from '../utils/auth.js';
import { supabaseWithRetry } from '../utils/supabaseRetry.js';
import { supabase } from '../../supabaseConfig.js';
import { ERROR_CODES } from '../../shared/errorCodes.js';
import { healthCheck as llmHealthCheck, migrateLocalKeysToSupabase } from '../../shared/llmClient.js';

const logger = createLogger('SettingsApiKeys');

/** Known provider identifiers */
const KNOWN_PROVIDERS = ['litellm', 'jira', 'confluence'];

// ---------------------------------------------------------------------------
// Internal Supabase helpers (passed to llmClient as _readFromSupabase / _writeToSupabase)
// ---------------------------------------------------------------------------

/**
 * Read API key for a provider directly from Supabase settings.
 * @param {string} userId
 * @param {string} provider
 * @param {string} [correlationId]
 * @returns {Promise<string|null>}
 */
async function readKeyFromSupabase(userId, provider, correlationId) {
  const data = await supabaseWithRetry(
    async () => {
      const { data, error } = await supabase
        .from('settings')
        .select('config')
        .eq('user_id', userId)
        .single();

      if (error && error.code === 'PGRST116') return null; // No row
      if (error) throw error;
      return data;
    },
    { operationName: 'readApiKey', correlationId }
  );

  if (!data?.config) return null;
  const keyEntry = data.config?.api_keys?.[provider];
  return keyEntry?.apiKey || null;
}

/**
 * Write API key for a provider to Supabase settings (upsert).
 * @param {string} userId
 * @param {string} provider
 * @param {string} apiKey
 * @param {string} [correlationId]
 * @returns {Promise<void>}
 */
async function writeKeyToSupabase(userId, provider, apiKey, correlationId) {
  // Read existing config first
  const existing = await supabaseWithRetry(
    async () => {
      const { data, error } = await supabase
        .from('settings')
        .select('config')
        .eq('user_id', userId)
        .single();

      if (error && error.code === 'PGRST116') return null;
      if (error) throw error;
      return data;
    },
    { operationName: 'readSettingsForKeyWrite', correlationId }
  );

  const config = existing?.config || {};
  if (!config.api_keys) config.api_keys = {};
  config.api_keys[provider] = {
    apiKey,
    updatedAt: new Date().toISOString(),
  };

  await supabaseWithRetry(
    async () => {
      const { error } = await supabase
        .from('settings')
        .upsert(
          { user_id: userId, config, updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        );
      if (error) throw error;
    },
    { operationName: 'writeApiKey', correlationId }
  );
}

/**
 * Delete API key for a provider from Supabase settings.
 * @param {string} userId
 * @param {string} provider
 * @param {string} [correlationId]
 * @returns {Promise<void>}
 */
async function deleteKeyFromSupabase(userId, provider, correlationId) {
  const existing = await supabaseWithRetry(
    async () => {
      const { data, error } = await supabase
        .from('settings')
        .select('config')
        .eq('user_id', userId)
        .single();

      if (error && error.code === 'PGRST116') return null;
      if (error) throw error;
      return data;
    },
    { operationName: 'readSettingsForKeyDelete', correlationId }
  );

  if (!existing?.config?.api_keys?.[provider]) return; // Nothing to delete

  const config = { ...existing.config };
  delete config.api_keys[provider];

  await supabaseWithRetry(
    async () => {
      const { error } = await supabase
        .from('settings')
        .update({ config, updated_at: new Date().toISOString() })
        .eq('user_id', userId);
      if (error) throw error;
    },
    { operationName: 'deleteApiKey', correlationId }
  );
}

/**
 * Log an audit event to the `runs` table.
 * @param {string} userId
 * @param {string} action
 * @param {Object} meta
 * @param {string} [correlationId]
 */
async function logAuditEvent(userId, action, meta, correlationId) {
  try {
    await supabase
      .from('runs')
      .insert({
        user_id: userId,
        run_id: `apikey_${action}_${Date.now()}`,
        status: 'completed',
        metadata: {
          action: `apikey_${action}`,
          ...meta,
          correlationId,
          timestamp: new Date().toISOString(),
        },
        timestamp: Date.now(),
      });
  } catch (err) {
    logger.warn('Audit log failed (non-blocking)', { action, error: err.message });
  }
}

// ---------------------------------------------------------------------------
// Message Handlers
// ---------------------------------------------------------------------------

/**
 * SETTINGS_APIKEY_SET — Store API key in Supabase
 */
registerHandler(MESSAGE_TYPES.SETTINGS_APIKEY_SET, async (message) => {
  const correlationId = message.correlationId;
  try {
    const userId = await requireAuth(message);
    const { provider, apiKey } = message;

    if (!provider || !KNOWN_PROVIDERS.includes(provider)) {
      return createErrorResponse(message, ERROR_CODES.INVALID_INPUT, `Provider không hợp lệ: ${provider}`);
    }
    if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length < 8) {
      return createErrorResponse(message, ERROR_CODES.INVALID_INPUT, 'API key quá ngắn hoặc không hợp lệ');
    }

    await writeKeyToSupabase(userId, provider, apiKey.trim(), correlationId);

    // Audit log (don't include the key)
    await logAuditEvent(userId, 'set', { provider }, correlationId);

    // Update local cache (short-lived)
    try {
      await chrome.storage.local.set({
        [`llm_key_cache_${provider}`]: { value: apiKey.trim(), expiresAt: Date.now() + 10 * 60 * 1000 },
      });
    } catch { /* cache failure is non-critical */ }

    logger.info('API key saved', { provider, correlationId });
    return createResponse(message, MESSAGE_TYPES.SETTINGS_APIKEY_SET_DONE, { success: true, provider });
  } catch (err) {
    if (err.errorCode) return err; // requireAuth formatted error
    logger.error('SETTINGS_APIKEY_SET failed', { error: err.message, correlationId });
    return createErrorResponse(message, ERROR_CODES.LLM_APIKEY_SAVE_FAILED, err.message);
  }
});

/**
 * SETTINGS_APIKEY_GET — Read API key from Supabase
 */
registerHandler(MESSAGE_TYPES.SETTINGS_APIKEY_GET, async (message) => {
  const correlationId = message.correlationId;
  try {
    const userId = await requireAuth(message);
    const { provider } = message;

    if (!provider || !KNOWN_PROVIDERS.includes(provider)) {
      return createErrorResponse(message, ERROR_CODES.INVALID_INPUT, `Provider không hợp lệ: ${provider}`);
    }

    const apiKey = await readKeyFromSupabase(userId, provider, correlationId);

    return createResponse(message, MESSAGE_TYPES.SETTINGS_APIKEY_DATA, {
      success: true,
      provider,
      apiKey: apiKey || null,
      hasKey: !!apiKey,
    });
  } catch (err) {
    if (err.errorCode) return err;
    logger.error('SETTINGS_APIKEY_GET failed', { error: err.message, correlationId });
    return createErrorResponse(message, ERROR_CODES.OPERATION_FAILED, err.message);
  }
});

/**
 * SETTINGS_APIKEY_DELETE — Remove API key from Supabase
 */
registerHandler(MESSAGE_TYPES.SETTINGS_APIKEY_DELETE, async (message) => {
  const correlationId = message.correlationId;
  try {
    const userId = await requireAuth(message);
    const { provider } = message;

    if (!provider || !KNOWN_PROVIDERS.includes(provider)) {
      return createErrorResponse(message, ERROR_CODES.INVALID_INPUT, `Provider không hợp lệ: ${provider}`);
    }

    await deleteKeyFromSupabase(userId, provider, correlationId);

    // Remove from local cache
    try {
      await chrome.storage.local.remove([`llm_key_cache_${provider}`]);
    } catch { /* non-critical */ }

    // Audit log
    await logAuditEvent(userId, 'delete', { provider }, correlationId);

    logger.info('API key deleted', { provider, correlationId });
    return createResponse(message, MESSAGE_TYPES.SETTINGS_APIKEY_DELETED, { success: true, provider });
  } catch (err) {
    if (err.errorCode) return err;
    logger.error('SETTINGS_APIKEY_DELETE failed', { error: err.message, correlationId });
    return createErrorResponse(message, ERROR_CODES.OPERATION_FAILED, err.message);
  }
});

/**
 * SETTINGS_APIKEY_MIGRATE — Migrate local keys to Supabase (idempotent)
 */
registerHandler(MESSAGE_TYPES.SETTINGS_APIKEY_MIGRATE, async (message) => {
  const correlationId = message.correlationId;
  try {
    const userId = await requireAuth(message);

    // Build a scoped writer that includes userId
    const _writeToSupabase = async (provider, key) => {
      await writeKeyToSupabase(userId, provider, key, correlationId);
    };

    const result = await migrateLocalKeysToSupabase({ correlationId, _writeToSupabase });

    // Audit log
    await logAuditEvent(userId, 'migrate', { migrated: result.data?.migrated, failed: result.data?.failed }, correlationId);

    logger.info('API key migration completed', { migrated: result.data?.migrated, correlationId });
    return createResponse(message, MESSAGE_TYPES.SETTINGS_APIKEY_MIGRATED, {
      success: result.success,
      migrated: result.data?.migrated || [],
      failed: result.data?.failed || [],
    });
  } catch (err) {
    if (err.errorCode) return err;
    logger.error('SETTINGS_APIKEY_MIGRATE failed', { error: err.message, correlationId });
    return createErrorResponse(message, ERROR_CODES.LLM_APIKEY_MIGRATE_FAILED, err.message);
  }
});

/**
 * SETTINGS_APIKEY_HEALTHCHECK — Test provider connection
 */
registerHandler(MESSAGE_TYPES.SETTINGS_APIKEY_HEALTHCHECK, async (message) => {
  const correlationId = message.correlationId;
  try {
    const userId = await requireAuth(message);
    const { provider } = message;

    if (!provider || !KNOWN_PROVIDERS.includes(provider)) {
      return createErrorResponse(message, ERROR_CODES.INVALID_INPUT, `Provider không hợp lệ: ${provider}`);
    }

    // Build scoped reader
    const _readFromSupabase = async (prov) => readKeyFromSupabase(userId, prov, correlationId);

    const result = await llmHealthCheck(provider, { correlationId, _readFromSupabase });

    return createResponse(message, MESSAGE_TYPES.SETTINGS_APIKEY_HEALTH_RESULT, {
      success: result.success,
      provider,
      status: result.status,
      message: result.data?.message || result.errorMessage,
    });
  } catch (err) {
    if (err.errorCode) return err;
    logger.error('SETTINGS_APIKEY_HEALTHCHECK failed', { error: err.message, correlationId });
    return createErrorResponse(message, ERROR_CODES.LLM_HEALTHCHECK_FAILED, err.message);
  }
});
