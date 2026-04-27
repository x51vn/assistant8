import { PROMPT_REGISTRY_VERSION, PROMPT_TYPE } from '../../shared/allPrompts.js';

export const PROMPTS_CACHE_SCHEMA_VERSION = 1;
export const PROMPTS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const PROMPTS_CACHE_KEY_PREFIX = 'x51labs_prompts_cache_v1';

function getDefaultStorage() {
  return globalThis.chrome?.storage?.local;
}

export function getPromptCacheKey(userId) {
  return `${PROMPTS_CACHE_KEY_PREFIX}:${userId}`;
}

function hasRequiredPromptShape(prompts) {
  return !!(
    prompts &&
    typeof prompts === 'object' &&
    prompts['prompt.master'] &&
    typeof prompts['prompt.master'].content === 'string' &&
    prompts['prompt.master'].content.trim().length > 0
  );
}

export function validatePromptCachePayload(payload, userId, options = {}) {
  const now = options.now ?? Date.now();
  const ttlMs = options.ttlMs ?? PROMPTS_CACHE_TTL_MS;
  const registryVersion = options.registryVersion ?? PROMPT_REGISTRY_VERSION;

  if (!payload || typeof payload !== 'object') {
    return { valid: false, reason: 'missing' };
  }
  if (payload.schemaVersion !== PROMPTS_CACHE_SCHEMA_VERSION) {
    return { valid: false, reason: 'schema_mismatch' };
  }
  if (payload.registryVersion !== registryVersion) {
    return { valid: false, reason: 'registry_mismatch' };
  }
  if (payload.userId !== userId) {
    return { valid: false, reason: 'user_mismatch' };
  }
  if (!hasRequiredPromptShape(payload.prompts)) {
    return { valid: false, reason: 'invalid_prompts' };
  }
  if (!Number.isFinite(payload.cachedAt)) {
    return { valid: false, reason: 'invalid_cached_at' };
  }

  const stale = now - payload.cachedAt >= ttlMs;
  return { valid: true, stale };
}

export async function readPromptCache(userId, options = {}) {
  const storage = options.storage || getDefaultStorage();
  if (!storage || !userId) {
    return { hit: false, reason: 'storage_unavailable' };
  }

  const key = getPromptCacheKey(userId);
  try {
    const stored = await storage.get(key);
    const payload = stored?.[key];
    const validation = validatePromptCachePayload(payload, userId, options);
    if (!validation.valid) {
      return { hit: false, reason: validation.reason };
    }

    return {
      hit: true,
      stale: validation.stale,
      prompts: payload.prompts,
      cachedAt: payload.cachedAt,
      source: payload.source || 'cache',
      key
    };
  } catch (error) {
    return { hit: false, reason: 'read_error', error };
  }
}

export async function writePromptCache(userId, prompts, options = {}) {
  const storage = options.storage || getDefaultStorage();
  if (!storage || !userId || !hasRequiredPromptShape(prompts)) {
    return { success: false, reason: 'invalid_cache_input' };
  }

  const cachedAt = options.now ?? Date.now();
  const key = getPromptCacheKey(userId);
  const payload = {
    schemaVersion: PROMPTS_CACHE_SCHEMA_VERSION,
    registryVersion: PROMPT_REGISTRY_VERSION,
    userId,
    cachedAt,
    source: options.source || 'supabase',
    prompts
  };

  await storage.set({ [key]: payload });
  return { success: true, key, payload };
}

export async function removePromptCache(userId, options = {}) {
  const storage = options.storage || getDefaultStorage();
  if (!storage || !userId) {
    return { success: false, reason: 'storage_unavailable' };
  }

  const key = getPromptCacheKey(userId);
  await storage.remove(key);
  return { success: true, key };
}

export function filterPromptsByType(prompts, promptType) {
  if (!prompts || typeof prompts !== 'object') {
    return {};
  }

  return Object.fromEntries(
    Object.entries(prompts).filter(([, prompt]) => {
      if (!prompt || typeof prompt !== 'object') return false;
      const type = prompt.promptType || prompt.prompt_type || (
        prompt.key?.startsWith('prompt.') ? PROMPT_TYPE.SYSTEM :
          prompt.key?.startsWith('writing.') ? PROMPT_TYPE.WRITING :
            PROMPT_TYPE.CUSTOM
      );
      return type === promptType;
    })
  );
}
