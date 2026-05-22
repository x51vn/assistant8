/**
 * Settings Handler - Manage user settings
 * ✅ GPT-FIX: Migrate from chrome.storage.local to Supabase
 */

import { supabase } from '../../supabaseConfig.js';
import { registerHandler } from '../messageRouter.js';
import { MESSAGE_TYPES, createResponse, createErrorResponse } from '../../shared/messageSchema.js';
import { createLogger } from '../../logger.js';
import { requireAuth } from '../utils/auth.js';
import { supabaseWithRetry } from '../utils/supabaseRetry.js';
import { ERROR_CODES, getUserFriendlyMessage } from '../../shared/errorCodes.js';

const logger = createLogger('Settings');

/**
 * Deep-merge two config objects: nested objects are merged recursively,
 * arrays and primitives from `patch` overwrite `base`.
 * @param {Object} base - Existing config from DB
 * @param {Object} patch - Incoming partial config
 * @returns {Object} Merged config
 */
function deepMergeConfig(base, patch) {
  const result = { ...base };
  for (const key of Object.keys(patch)) {
    const bVal = base[key];
    const pVal = patch[key];
    if (
      pVal !== null &&
      typeof pVal === 'object' &&
      !Array.isArray(pVal) &&
      bVal !== null &&
      typeof bVal === 'object' &&
      !Array.isArray(bVal)
    ) {
      result[key] = deepMergeConfig(bVal, pVal);
    } else {
      result[key] = pVal;
    }
  }
  return result;
}

/**
 * SETTINGS_GET - Get user settings with normalized structure
 * Normalizes legacy format (config.prompt) → (config.prompts.master)
 */
registerHandler(MESSAGE_TYPES.SETTINGS_GET, async (message) => {
  const correlationId = logger.startOperation('getSettings', message.correlationId);
  
  try {
    const userId = await requireAuth(message);
    
    const data = await supabaseWithRetry(
      async () => {
        const { data, error } = await supabase
          .from('settings')
          .select('*')
          .eq('user_id', userId)
          .single();
        
        // If no settings found, return empty config (not an error)
        if (error && error.code === 'PGRST116') {
          return { config: {} };
        }
        
        if (error) throw error;
        return data;
      },
      {
        operationName: 'getSettings',
        correlationId
      }
    );
    
    logger.endOperation(correlationId, 'success');
    
    // ✅ NORMALIZE: Move legacy config.prompt → config.prompts.master
    let config = data.config || {};
    if (config.prompt && !config.prompts?.master) {
      config = {
        ...config,
        prompts: {
          ...(config.prompts || {}),
          master: config.prompt
        }
      };
      delete config.prompt; // Remove legacy field from response
      logger.debug('Normalized legacy config.prompt → config.prompts.master');
    }
    
    return createResponse(message, MESSAGE_TYPES.SETTINGS_DATA, {
      config
    });
    
  } catch (error) {
    logger.endOperation(correlationId, 'error', { error: error.message });
    
    if (error.errorCode) {
      return error;
    }
    
    if (error.message?.includes('Failed to fetch')) {
      return createErrorResponse(
        message,
        ERROR_CODES.NETWORK_ERROR,
        getUserFriendlyMessage(ERROR_CODES.NETWORK_ERROR)
      );
    }
    
    return createErrorResponse(
      message,
      ERROR_CODES.SUPABASE_ERROR,
      getUserFriendlyMessage(ERROR_CODES.SUPABASE_ERROR),
      { technicalError: error.message }
    );
  }
});

/**
 * SETTINGS_UPDATE - Update user settings (upsert)
 * Accepts multiple formats:
 *   1. { data: { config: { ... } } }          — standard format
 *   2. { data: { theme, consent_*, onboarding_*, ... } } — direct fields (legacy callers)
 *   3. { data: { config: { prompt: '...' } } } — legacy prompt field
 */
registerHandler(MESSAGE_TYPES.SETTINGS_UPDATE, async (message) => {
  const correlationId = logger.startOperation('updateSettings', message.correlationId);
  const data = message.data || {};
  // ✅ NORMALIZE: if callers send fields directly without wrapping in `config`, treat data as config
  let config = (data.config && typeof data.config === 'object')
    ? data.config
    : (Object.keys(data).length > 0 && !('config' in data) ? data : data.config);
  
  try {
    const userId = await requireAuth(message);
    
    // Validation
    if (!config || typeof config !== 'object') {
      logger.endOperation(correlationId, 'error', { reason: 'invalid_config' });
      return createErrorResponse(
        message,
        ERROR_CODES.INVALID_INPUT,
        'Config không hợp lệ.'
      );
    }
    
    // ✅ NORMALIZE: Convert config.prompt (legacy) → config.prompts.master
    if (config.prompt) {
      config = {
        ...config,
        prompts: {
          ...(config.prompts || {}),
          master: config.prompt
        }
      };
      delete config.prompt; // Remove legacy field before saving
      logger.debug('Normalized legacy config.prompt → config.prompts.master on save');
    }
    
    const savedData = await supabaseWithRetry(
      async () => {
        // ✅ MERGE: Fetch existing config first and deep-merge to avoid wiping unrelated fields
        // (e.g. saving llm_provider must NOT wipe onboarding_completed or consent_* fields)
        const { data: existing } = await supabase
          .from('settings')
          .select('config')
          .eq('user_id', userId)
          .maybeSingle();

        const mergedConfig = deepMergeConfig(existing?.config || {}, config);

        const { data: upserted, error } = await supabase
          .from('settings')
          .upsert(
            {
              user_id: userId,
              config: mergedConfig
            },
            {
              onConflict: 'user_id',
              ignoreDuplicates: false
            }
          )
          .select()
          .single();

        if (error) throw error;
        return upserted;
      },
      {
        operationName: 'updateSettings',
        correlationId
      }
    );

    logger.endOperation(correlationId, 'success');
    // ✅ Return normalized config
    return createResponse(message, MESSAGE_TYPES.SETTINGS_UPDATED, {
      config: savedData.config || {}
    });
    
  } catch (error) {
    logger.endOperation(correlationId, 'error', { error: error.message });
    
    if (error.errorCode) {
      return error;
    }
    
    if (error.message?.includes('Failed to fetch')) {
      return createErrorResponse(
        message,
        ERROR_CODES.NETWORK_ERROR,
        getUserFriendlyMessage(ERROR_CODES.NETWORK_ERROR)
      );
    }
    
    return createErrorResponse(
      message,
      ERROR_CODES.SUPABASE_ERROR,
      getUserFriendlyMessage(ERROR_CODES.SUPABASE_ERROR),
      { technicalError: error.message }
    );
  }
});

/**
 * SETTINGS_DELETE - Delete user settings
 */
registerHandler(MESSAGE_TYPES.SETTINGS_DELETE, async (message) => {
  const correlationId = logger.startOperation('deleteSettings', message.correlationId);
  
  try {
    const userId = await requireAuth(message);
    
    const data = await supabaseWithRetry(
      async () => {
        const { error } = await supabase
          .from('settings')
          .delete()
          .eq('user_id', userId);
        
        if (error) throw error;
        return { success: true };
      },
      {
        operationName: 'deleteSettings',
        correlationId
      }
    );
    
    logger.endOperation(correlationId, 'success');
    return createResponse(message, MESSAGE_TYPES.SETTINGS_DELETED, data);
    
  } catch (error) {
    logger.endOperation(correlationId, 'error', { error: error.message });
    
    if (error.errorCode) {
      return error;
    }
    
    if (error.message?.includes('Failed to fetch')) {
      return createErrorResponse(
        message,
        ERROR_CODES.NETWORK_ERROR,
        getUserFriendlyMessage(ERROR_CODES.NETWORK_ERROR)
      );
    }
    
    return createErrorResponse(
      message,
      ERROR_CODES.SUPABASE_ERROR,
      getUserFriendlyMessage(ERROR_CODES.SUPABASE_ERROR),
      { technicalError: error.message }
    );
  }
});
