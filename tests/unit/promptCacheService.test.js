import { beforeEach, describe, expect, it } from 'vitest';

import {
  PROMPTS_CACHE_SCHEMA_VERSION,
  PROMPTS_CACHE_TTL_MS,
  filterPromptsByType,
  getPromptCacheKey,
  readPromptCache,
  removePromptCache,
  writePromptCache
} from '../../src/background/services/promptCacheService.js';
import { PROMPT_REGISTRY_VERSION } from '../../src/shared/allPrompts.js';

function createStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    get: async (keys) => {
      if (Array.isArray(keys)) {
        return Object.fromEntries(keys.map((key) => [key, data[key]]));
      }
      if (typeof keys === 'string') {
        return { [keys]: data[keys] };
      }
      return { ...data };
    },
    set: async (items) => {
      Object.assign(data, items);
    },
    remove: async (keys) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        delete data[key];
      }
    }
  };
}

describe('promptCacheService', () => {
  const now = 1_777_248_000_000;
  const prompts = {
    'prompt.master': {
      key: 'prompt.master',
      content: 'master',
      promptType: 'system',
      isSystem: true
    },
    'writing.email': {
      key: 'writing.email',
      content: 'email',
      promptType: 'writing',
      isSystem: true
    }
  };

  let storage;

  beforeEach(() => {
    storage = createStorage();
  });

  it('scopes cache keys by user id', () => {
    expect(getPromptCacheKey('user-a')).toBe('x51labs_prompts_cache_v1:user-a');
    expect(getPromptCacheKey('user-b')).toBe('x51labs_prompts_cache_v1:user-b');
  });

  it('writes and reads fresh prompt cache for the same user', async () => {
    await writePromptCache('user-a', prompts, { storage, now });

    const result = await readPromptCache('user-a', { storage, now });

    expect(result.hit).toBe(true);
    expect(result.stale).toBe(false);
    expect(result.source).toBe('supabase');
    expect(result.prompts).toEqual(prompts);
    expect(storage.data[getPromptCacheKey('user-a')]).toMatchObject({
      schemaVersion: PROMPTS_CACHE_SCHEMA_VERSION,
      registryVersion: PROMPT_REGISTRY_VERSION,
      userId: 'user-a',
      cachedAt: now
    });
  });

  it('detects stale cache by TTL', async () => {
    await writePromptCache('user-a', prompts, { storage, now });

    const result = await readPromptCache('user-a', {
      storage,
      now: now + PROMPTS_CACHE_TTL_MS + 1
    });

    expect(result.hit).toBe(true);
    expect(result.stale).toBe(true);
    expect(result.prompts).toEqual(prompts);
  });

  it('rejects cache for a different user', async () => {
    await storage.set({
      [getPromptCacheKey('user-a')]: {
        schemaVersion: PROMPTS_CACHE_SCHEMA_VERSION,
        registryVersion: PROMPT_REGISTRY_VERSION,
        userId: 'user-b',
        cachedAt: now,
        source: 'supabase',
        prompts
      }
    });

    const result = await readPromptCache('user-a', { storage, now });

    expect(result.hit).toBe(false);
    expect(result.reason).toBe('user_mismatch');
  });

  it('rejects cache with schema mismatch', async () => {
    await storage.set({
      [getPromptCacheKey('user-a')]: {
        schemaVersion: 0,
        registryVersion: PROMPT_REGISTRY_VERSION,
        userId: 'user-a',
        cachedAt: now,
        source: 'supabase',
        prompts
      }
    });

    const result = await readPromptCache('user-a', { storage, now });

    expect(result.hit).toBe(false);
    expect(result.reason).toBe('schema_mismatch');
  });

  it('rejects cache with registry mismatch', async () => {
    await storage.set({
      [getPromptCacheKey('user-a')]: {
        schemaVersion: PROMPTS_CACHE_SCHEMA_VERSION,
        registryVersion: PROMPT_REGISTRY_VERSION + 1,
        userId: 'user-a',
        cachedAt: now,
        source: 'supabase',
        prompts
      }
    });

    const result = await readPromptCache('user-a', { storage, now });

    expect(result.hit).toBe(false);
    expect(result.reason).toBe('registry_mismatch');
  });

  it('filters cached prompts by prompt type', () => {
    expect(filterPromptsByType(prompts, 'writing')).toEqual({
      'writing.email': prompts['writing.email']
    });
  });

  it('removes user cache without touching other users', async () => {
    await writePromptCache('user-a', prompts, { storage, now });
    await writePromptCache('user-b', prompts, { storage, now });

    await removePromptCache('user-a', { storage });

    expect(storage.data[getPromptCacheKey('user-a')]).toBeUndefined();
    expect(storage.data[getPromptCacheKey('user-b')]).toBeDefined();
  });
});
