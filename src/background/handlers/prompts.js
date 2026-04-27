/**
 * Unified Prompts Handler
 * Manages unified prompts: 8 system prompts + 7 writing templates + custom prompts
 * All stored in public.prompts table with prompt_type and is_system metadata
 */

import { supabase } from '../../supabaseConfig.js';
import { registerHandler } from '../messageRouter.js';
import { MESSAGE_TYPES, createResponse, createErrorResponse } from '../../shared/messageSchema.js';
import { createLogger } from '../../logger.js';
import { requireAuth } from '../utils/auth.js';
import { supabaseWithRetry } from '../utils/supabaseRetry.js';
import { ERROR_CODES, getUserFriendlyMessage } from '../../shared/errorCodes.js';
import { invalidatePromptCache } from './contextMenu.js';
import {
  getAllPromptMetadata,
  getAllDefaultPrompts,
  getSystemPromptKeys,
  getWritingTemplateKeys,
  getPromptType,
  PROMPT_TYPE
} from '../../shared/allPrompts.js';
import {
  filterPromptsByType,
  readPromptCache,
  removePromptCache,
  writePromptCache
} from '../services/promptCacheService.js';

const logger = createLogger('Prompts');
const STALE_REFRESH_TIMEOUT_MS = 5000;

function buildDefaultPromptMap(promptType = null) {
  const defaults = {};
  const allMetadata = getAllPromptMetadata();
  const allDefaults = getAllDefaultPrompts();
  const metadata = promptType
    ? allMetadata.filter(meta => meta.prompt_type === promptType)
    : allMetadata;

  for (const meta of metadata) {
    defaults[meta.key] = {
      key: meta.key,
      title: meta.title,
      content: allDefaults[meta.key],
      tags: meta.tags || [],
      promptType: meta.prompt_type,
      isSystem: meta.is_system,
      isDefault: true
    };
  }

  return defaults;
}

function buildPromptMapFromRows(prompts) {
  const result = {};
  const allMetadata = getAllPromptMetadata();
  const allDefaults = getAllDefaultPrompts();

  for (const meta of allMetadata) {
    const dbPrompt = prompts.find(p => p.key === meta.key);

    if (dbPrompt) {
      result[meta.key] = {
        id: dbPrompt.id,
        key: dbPrompt.key,
        title: dbPrompt.title,
        content: dbPrompt.content,
        tags: dbPrompt.tags || [],
        promptType: dbPrompt.prompt_type,
        isSystem: dbPrompt.is_system,
        updatedAt: dbPrompt.updated_at,
        isCustom: false
      };
    } else {
      result[meta.key] = {
        key: meta.key,
        title: meta.title,
        content: allDefaults[meta.key],
        tags: meta.tags || [],
        promptType: meta.prompt_type,
        isSystem: meta.is_system,
        isDefault: true
      };
    }
  }

  const customPrompts = prompts.filter(p => !allMetadata.find(meta => meta.key === p.key));
  for (const custom of customPrompts) {
    result[custom.key] = {
      id: custom.id,
      key: custom.key,
      title: custom.title,
      content: custom.content,
      tags: custom.tags || [],
      promptType: custom.prompt_type || PROMPT_TYPE.CUSTOM,
      isSystem: false,
      updatedAt: custom.updated_at,
      isCustom: true
    };
  }

  return result;
}

function buildPromptMapForTypeFromRows(prompts, promptType) {
  const result = {};
  const allMetadata = getAllPromptMetadata().filter(meta => meta.prompt_type === promptType);
  const allDefaults = getAllDefaultPrompts();

  for (const meta of allMetadata) {
    const dbPrompt = prompts.find(p => p.key === meta.key);

    if (dbPrompt) {
      result[meta.key] = {
        id: dbPrompt.id,
        key: dbPrompt.key,
        title: dbPrompt.title,
        content: dbPrompt.content,
        tags: dbPrompt.tags || [],
        promptType: dbPrompt.prompt_type,
        isSystem: dbPrompt.is_system,
        updatedAt: dbPrompt.updated_at
      };
    } else {
      result[meta.key] = {
        key: meta.key,
        title: meta.title,
        content: allDefaults[meta.key],
        tags: meta.tags || [],
        promptType: meta.prompt_type,
        isSystem: meta.is_system,
        isDefault: true
      };
    }
  }

  return result;
}

async function fetchAllPromptRows(userId, correlationId) {
  return await supabaseWithRetry(
    async () => {
      const { data, error } = await supabase
        .from('prompts')
        .select('id, key, title, content, tags, prompt_type, is_system, updated_at')
        .eq('user_id', userId);

      if (error) throw error;
      return data || [];
    },
    {
      operationName: 'getAllPrompts',
      correlationId
    }
  );
}

async function fetchPromptRowsByType(userId, promptType, correlationId) {
  return await supabaseWithRetry(
    async () => {
      const keys = promptType === PROMPT_TYPE.SYSTEM ? getSystemPromptKeys() : getWritingTemplateKeys();

      const { data, error } = await supabase
        .from('prompts')
        .select('id, key, title, content, tags, prompt_type, is_system, updated_at')
        .eq('user_id', userId)
        .in('key', keys);

      if (error) throw error;
      return data || [];
    },
    {
      operationName: `getPromptsByType_${promptType}`,
      correlationId
    }
  );
}

function withTimeout(promise, timeoutMs) {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('Prompt refresh timed out')), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

function cacheResponseMetadata(cache, overrides = {}) {
  return {
    hit: cache?.hit === true,
    stale: cache?.stale === true,
    cachedAt: cache?.cachedAt,
    source: cache?.hit ? 'chrome.storage.local' : overrides.source,
    ...overrides
  };
}

function normalizeSubmittedPrompts(prompts) {
  const normalized = {};
  for (const [key, prompt] of Object.entries(prompts || {})) {
    normalized[key] = {
      ...prompt,
      key,
      promptType: prompt.promptType || prompt.prompt_type || getPromptType(key),
      isSystem: prompt.isSystem ?? prompt.is_system ?? getPromptType(key) !== PROMPT_TYPE.CUSTOM
    };
  }
  return normalized;
}

/**
 * Initialize default prompts for a user
 * Creates all default prompts if missing, idempotent (safe to run multiple times)
 */
async function initializeDefaultPrompts(userId, promptType = null) {
  const allMetadata = getAllPromptMetadata();
  const allDefaults = getAllDefaultPrompts();

  // Filter by prompt_type if specified
  const metadataToInit = promptType
    ? allMetadata.filter(meta => meta.prompt_type === promptType)
    : allMetadata;

  for (const promptMeta of metadataToInit) {
    const defaultContent = allDefaults[promptMeta.key];
    if (!defaultContent) {
      logger.warn(`No default content found for key: ${promptMeta.key}`);
      continue;
    }

    try {
      // Insert if not exists (based on unique constraint user_id + key)
      // If already exists, do nothing (respect user edits)
      await supabaseWithRetry(
        async () => {
          const { data, error: insertError } = await supabase
            .from('prompts')
            .insert({
              user_id: userId,
              key: promptMeta.key,
              title: promptMeta.title,
              content: defaultContent,
              tags: promptMeta.tags || [],
              prompt_type: promptMeta.prompt_type,
              is_system: promptMeta.is_system
            })
            .select();

          // If insert fails due to unique constraint, it already exists - that's OK
          if (insertError && insertError.code === '23505') {
            logger.debug(`Prompt already exists (skipping): ${promptMeta.key}`);
            return { skipped: true };
          }

          if (insertError) throw insertError;

          // Log success if data was returned
          if (data && data.length > 0) {
            logger.debug(`Prompt created: ${promptMeta.key} (type: ${promptMeta.prompt_type})`);
          }

          return { inserted: true };
        },
        {
          operationName: `initPrompt_${promptMeta.key}`,
          correlationId: null,
          maxRetries: 2
        }
      );
    } catch (error) {
      logger.warn('Failed to initialize prompt', {
        key: promptMeta.key,
        errorMessage: error?.message || String(error)
      });
    }
  }
}

/**
 * PROMPTS_GET_ALL - Fetch ALL prompts for current user (default + any custom)
 * Returns prompts from DB, or defaults if not found
 */
registerHandler(MESSAGE_TYPES.PROMPTS_GET_ALL, async (message) => {
  const correlationId = logger.startOperation('getAllPrompts', message.correlationId);

  let userId;
  try {
    userId = await requireAuth(message);
  } catch (error) {
    logger.endOperation(correlationId, 'error', { error: error.message });

    const authErrorCode = error?.errorCode;
    const isAuthError = authErrorCode === ERROR_CODES.AUTH_REQUIRED ||
      authErrorCode === ERROR_CODES.AUTH_EXPIRED ||
      authErrorCode === ERROR_CODES.AUTH_INVALID ||
      authErrorCode === ERROR_CODES.AUTH_ERROR;

    if (!isAuthError) {
      return createErrorResponse(message, ERROR_CODES.DATABASE_ERROR, error.message, correlationId);
    }

    logger.info('Auth unavailable, returning default prompts');
    return createResponse(message, MESSAGE_TYPES.PROMPTS_DATA_ALL, {
      success: true,
      prompts: buildDefaultPromptMap(),
      isDefaultFallback: true,
      cache: { hit: false, source: 'defaults' }
    });
  }

  const { preferCache = false, forceRefresh = false } = message.data || {};
  let cache = null;

  if (preferCache && !forceRefresh) {
    cache = await readPromptCache(userId);
    if (cache.hit && !cache.stale) {
      logger.endOperation(correlationId, 'success', {
        count: Object.keys(cache.prompts).length,
        source: 'cache'
      });

      return createResponse(message, MESSAGE_TYPES.PROMPTS_DATA_ALL, {
        success: true,
        prompts: cache.prompts,
        cache: cacheResponseMetadata(cache)
      });
    }

    if (cache.hit && cache.stale) {
      try {
        const rows = await withTimeout(fetchAllPromptRows(userId, correlationId), STALE_REFRESH_TIMEOUT_MS);
        const result = buildPromptMapFromRows(rows);
        await writePromptCache(userId, result, { source: 'supabase' });
        logger.endOperation(correlationId, 'success', { count: Object.keys(result).length, source: 'supabase' });

        return createResponse(message, MESSAGE_TYPES.PROMPTS_DATA_ALL, {
          success: true,
          prompts: result,
          cache: { hit: false, refreshed: true, source: 'supabase' }
        });
      } catch (error) {
        logger.warn('Failed to refresh stale prompt cache, using stale cache', {
          errorMessage: error?.message || String(error)
        });
        logger.endOperation(correlationId, 'success', {
          count: Object.keys(cache.prompts).length,
          source: 'stale-cache'
        });

        return createResponse(message, MESSAGE_TYPES.PROMPTS_DATA_ALL, {
          success: true,
          prompts: cache.prompts,
          cache: cacheResponseMetadata(cache, { stale: true, fallback: true })
        });
      }
    }
  }

  try {
    const rows = await fetchAllPromptRows(userId, correlationId);
    const result = buildPromptMapFromRows(rows);
    await writePromptCache(userId, result, { source: 'supabase' });

    logger.endOperation(correlationId, 'success', { count: Object.keys(result).length });

    return createResponse(message, MESSAGE_TYPES.PROMPTS_DATA_ALL, {
      success: true,
      prompts: result,
      cache: { hit: false, source: 'supabase' }
    });
  } catch (error) {
    logger.endOperation(correlationId, 'error', { error: error.message });

    return createResponse(message, MESSAGE_TYPES.PROMPTS_DATA_ALL, {
      success: true,
      prompts: buildDefaultPromptMap(),
      isDefaultFallback: true,
      cache: { hit: false, source: 'defaults', errorMessage: error.message }
    });
  }
});

/**
 * PROMPTS_GET_BY_TYPE - Fetch prompts by type (system or writing)
 */
registerHandler(MESSAGE_TYPES.PROMPTS_GET_BY_TYPE, async (message) => {
  const correlationId = logger.startOperation('getPromptsByType', message.correlationId);
  const { promptType, preferCache = true, forceRefresh = false } = message.data || {};

  if (!promptType || ![PROMPT_TYPE.SYSTEM, PROMPT_TYPE.WRITING].includes(promptType)) {
    return createErrorResponse(message, ERROR_CODES.INVALID_INPUT, 'Invalid or missing promptType', correlationId);
  }

  try {
    const userId = await requireAuth(message);

    if (preferCache && !forceRefresh) {
      const cache = await readPromptCache(userId);
      if (cache.hit && !cache.stale) {
        const cachedByType = filterPromptsByType(cache.prompts, promptType);
        logger.endOperation(correlationId, 'success', {
          count: Object.keys(cachedByType).length,
          type: promptType,
          source: 'cache'
        });

        return createResponse(message, MESSAGE_TYPES.PROMPTS_DATA_BY_TYPE, {
          success: true,
          prompts: cachedByType,
          promptType,
          cache: cacheResponseMetadata(cache)
        });
      }
    }

    const prompts = await fetchPromptRowsByType(userId, promptType, correlationId);
    const result = buildPromptMapForTypeFromRows(prompts, promptType);

    logger.endOperation(correlationId, 'success', { count: Object.keys(result).length, type: promptType });

    return createResponse(message, MESSAGE_TYPES.PROMPTS_DATA_BY_TYPE, {
      success: true,
      prompts: result,
      promptType,
      cache: { hit: false, source: 'supabase' }
    });
  } catch (error) {
    logger.endOperation(correlationId, 'error', { error: error.message });
    return createResponse(message, MESSAGE_TYPES.PROMPTS_DATA_BY_TYPE, {
      success: true,
      prompts: buildDefaultPromptMap(promptType),
      promptType,
      isDefaultFallback: true,
      cache: { hit: false, source: 'defaults', errorMessage: error.message }
    });
  }
});

/**
 * PROMPTS_INIT - Initialize default prompts for user
 */
registerHandler(MESSAGE_TYPES.PROMPTS_INIT, async (message) => {
  const correlationId = logger.startOperation('initPrompts', message.correlationId);
  const { promptType } = message.data || {};

  try {
    const userId = await requireAuth(message);

    // Initialize all prompts or by type
    await initializeDefaultPrompts(userId, promptType);

    logger.endOperation(correlationId, 'success', { type: promptType || 'all' });

    return createResponse(message, MESSAGE_TYPES.PROMPTS_INITIALIZED, {
      success: true,
      message: promptType
        ? `${promptType} prompts initialized`
        : 'All prompts initialized'
    });
  } catch (error) {
    logger.endOperation(correlationId, 'error', { error: error.message });
    return createErrorResponse(message, ERROR_CODES.DATABASE_ERROR, error.message, correlationId);
  }
});

/**
 * PROMPTS_UPSERT - Bulk upsert prompts
 */
registerHandler(MESSAGE_TYPES.PROMPTS_UPSERT, async (message) => {
  const correlationId = logger.startOperation('upsertPrompts', message.correlationId);
  const { prompts } = message.data || {};

  logger.info('[PROMPTS_UPSERT] Received data:', {
    promptCount: prompts ? Object.keys(prompts).length : 0,
    promptKeys: prompts ? Object.keys(prompts) : []
  });

  if (!prompts || typeof prompts !== 'object') {
    logger.warn('[PROMPTS_UPSERT] Invalid prompts data');
    return createErrorResponse(message, ERROR_CODES.INVALID_INPUT, 'Invalid prompts data', correlationId);
  }

  try {
    const userId = await requireAuth(message);

    const promptKeys = Object.keys(prompts);
    const results = {};
    let successCount = 0;
    let failureCount = 0;

    for (const key of promptKeys) {
      const prompt = prompts[key];

      logger.info(`[PROMPTS_UPSERT] Processing key=${key}`, {
        hasTitle: !!prompt.title,
        hasContent: !!prompt.content,
        contentLength: prompt.content?.length || 0
      });

      // Validate content
      if (!prompt.content || typeof prompt.content !== 'string') {
        logger.warn(`[PROMPTS_UPSERT] Missing content for key=${key}`);
        results[key] = { success: false, error: 'Content is required' };
        failureCount++;
        continue;
      }

      // Check if required (master prompt cannot be empty)
      if (key === 'prompt.master' && prompt.content.trim().length === 0) {
        logger.warn('[PROMPTS_UPSERT] Master prompt is empty');
        results[key] = { success: false, error: 'Master prompt cannot be empty' };
        failureCount++;
        continue;
      }

      try {
        // supabaseWithRetry() throws on error, doesn't return {error}
        await supabaseWithRetry(
          async () => {
            logger.info(`[PROMPTS_UPSERT] Upserting key=${key} for user=${userId}`);

            const { error: upsertError } = await supabase
              .from('prompts')
              .upsert({
                user_id: userId,
                key: key,
                title: prompt.title || 'Untitled',
                content: prompt.content,
                tags: prompt.tags || [],
                prompt_type: getPromptType(key),
                is_system: prompt.isSystem || false
              }, {
                onConflict: 'user_id,key'
              });

            if (upsertError) throw upsertError;
          },
          {
            operationName: `upsertPrompt_${key}`,
            correlationId
          }
        );

        // Success (no error thrown)
        logger.info(`[PROMPTS_UPSERT] Successfully upserted key=${key}`);
        results[key] = { success: true };
        successCount++;
      } catch (err) {
        // Error thrown by supabaseWithRetry or upsert
        logger.error(`[PROMPTS_UPSERT] Exception for key=${key}`, { error: err.message });
        results[key] = { success: false, error: err.message };
        failureCount++;
      }
    }

    logger.info('[PROMPTS_UPSERT] Completed', { successCount, failureCount, total: promptKeys.length });

    logger.endOperation(correlationId, successCount > 0 ? 'success' : 'error', {
      successCount,
      failureCount,
      total: promptKeys.length
    });

    if (failureCount === 0) {
      await writePromptCache(userId, normalizeSubmittedPrompts(prompts), { source: 'upsert' });
      invalidatePromptCache();
    } else if (successCount > 0) {
      await removePromptCache(userId);
      invalidatePromptCache();
    }

    return createResponse(message, MESSAGE_TYPES.PROMPTS_UPSERTED, {
      success: failureCount === 0,
      partialSuccess: successCount > 0 && failureCount > 0,
      successCount,
      failureCount,
      results
    });
  } catch (error) {
    logger.endOperation(correlationId, 'error', { error: error.message });
    return createErrorResponse(message, ERROR_CODES.DATABASE_ERROR, error.message, correlationId);
  }
});

logger.info('Unified Prompts handler registered');
