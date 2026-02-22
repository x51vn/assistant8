/**
 * @fileoverview Enterprise API Key Management Handler
 * Ticket: XST-778 — API Access for Enterprise Users
 *
 * Message types:
 *  API_KEY_LIST     — list user's API keys (prefix + metadata only)
 *  API_KEY_GENERATE — generate a new API key
 *  API_KEY_REVOKE   — revoke an existing key
 *
 * Security:
 *  - Raw API key returned ONLY on generation (never stored/re-exposed)
 *  - Stored as SHA-256 hash in api_keys table
 *  - Enterprise-plan gate enforced
 */

import { registerHandler } from '../messageRouter.js';
import {
  MESSAGE_TYPES,
  createResponse,
  createErrorResponse,
} from '../../shared/messageSchema.js';
import { supabase } from '../../supabaseConfig.js';
import { requireAuth } from '../utils/auth.js';
import { supabaseWithRetry } from '../utils/supabaseRetry.js';
import { createLogger } from '../../logger.js';

const logger = createLogger('APIKeys');

// ============================================================
// HELPERS
// ============================================================

/** Generate a cryptographically random API key (48 hex chars + prefix) */
function generateRawKey() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `xst_${hex}`;
}

/** SHA-256 hash of raw key (hex string) */
async function hashKey(rawKey) {
  const encoder = new TextEncoder();
  const data = encoder.encode(rawKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Check that user is on Enterprise plan */
async function requireEnterprise(userId) {
  const { data } = await supabase
    .from('subscriptions')
    .select('plan_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();

  if (data?.plan_id !== 'enterprise') {
    throw Object.assign(new Error('Tính năng API Access chỉ dành cho gói Enterprise'), {
      code: 'PLAN_LIMIT',
    });
  }
}

// ============================================================
// API_KEY_LIST
// ============================================================
registerHandler('API_KEY_LIST', async (message) => {
  const correlationId = message.correlationId;
  try {
    const userId = await requireAuth(message);
    await requireEnterprise(userId);

    const items = await supabaseWithRetry(async () => {
      const { data, error } = await supabase
        .from('api_keys')
        .select('id, key_prefix, label, created_at, last_used_at, request_count, revoked, revoked_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    }, { operationName: 'apiKeyList', correlationId });

    return createResponse(message, 'API_KEY_DATA', { success: true, items });
  } catch (err) {
    const code = err?.code || 'API_KEY_LIST_ERROR';
    return createErrorResponse(message, code, err?.message || 'Lấy danh sách API key thất bại');
  }
});

// ============================================================
// API_KEY_GENERATE
// ============================================================
registerHandler('API_KEY_GENERATE', async (message) => {
  const correlationId = message.correlationId;
  const { label = 'Default Key' } = message;

  try {
    const userId = await requireAuth(message);
    await requireEnterprise(userId);

    // Max 5 active keys per user
    const { count } = await supabase
      .from('api_keys')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('revoked', false);

    if ((count || 0) >= 5) {
      return createErrorResponse(message, 'PLAN_LIMIT', 'Tối đa 5 API keys đang hoạt động. Hủy key cũ để tạo mới.');
    }

    const rawKey = generateRawKey();
    const keyHash = await hashKey(rawKey);
    const keyPrefix = rawKey.substring(0, 12); // "xst_" + 8 chars

    const item = await supabaseWithRetry(async () => {
      const { data, error } = await supabase
        .from('api_keys')
        .insert({ user_id: userId, key_hash: keyHash, key_prefix: keyPrefix, label })
        .select('id, key_prefix, label, created_at')
        .single();
      if (error) throw error;
      return data;
    }, { operationName: 'apiKeyGenerate', correlationId });

    logger.info('API key generated', { prefix: keyPrefix, correlationId });

    // Return rawKey ONCE — user must copy it now
    return createResponse(message, 'API_KEY_GENERATED', {
      success: true,
      rawKey,       // ⚠️ Only time this is returned — not stored in DB
      item,
    });
  } catch (err) {
    const code = err?.code || 'API_KEY_GENERATE_ERROR';
    return createErrorResponse(message, code, err?.message || 'Tạo API key thất bại');
  }
});

// ============================================================
// API_KEY_REVOKE
// ============================================================
registerHandler('API_KEY_REVOKE', async (message) => {
  const correlationId = message.correlationId;
  const { id } = message;
  if (!id) return createErrorResponse(message, 'VALIDATION_ERROR', 'Thiếu id');

  try {
    const userId = await requireAuth(message);
    await requireEnterprise(userId);

    await supabaseWithRetry(async () => {
      const { error } = await supabase
        .from('api_keys')
        .update({ revoked: true, revoked_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', userId);
      if (error) throw error;
    }, { operationName: 'apiKeyRevoke', correlationId });

    return createResponse(message, 'API_KEY_REVOKED', { success: true, id });
  } catch (err) {
    const code = err?.code || 'API_KEY_REVOKE_ERROR';
    return createErrorResponse(message, code, err?.message || 'Hủy API key thất bại');
  }
});
