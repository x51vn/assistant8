## 1. Registry and Cache Foundation

- [x] 1.1 Add `PROMPT_REGISTRY_VERSION` to `src/shared/allPrompts.js`.
- [x] 1.2 Normalize inaccurate prompt-count comments in prompt registry, prompt handler, prompt UI, and Prompts page files.
- [x] 1.3 Decide and document whether `writing.english_learning` is part of the unified prompt registry/UI.
- [x] 1.4 Create `src/background/services/promptCacheService.js` with cache key, schema version, TTL, validation, read, write, remove, and type-filter helpers.
- [x] 1.5 Add unit tests for cache key scoping, fresh cache hits, stale cache detection, user mismatch rejection, schema mismatch rejection, and registry mismatch rejection.

## 2. Background Handler Integration

- [x] 2.1 Update `PROMPTS_GET_ALL` to accept `preferCache` and `forceRefresh` options.
- [x] 2.2 Serve `PROMPTS_GET_ALL` from fresh user-scoped cache without calling Supabase.
- [x] 2.3 Refresh stale cache from Supabase with bounded fallback to stale cache on refresh failure.
- [x] 2.4 Preserve default prompt fallback when both cache and Supabase are unavailable.
- [x] 2.5 Update `PROMPTS_GET_BY_TYPE` to filter from valid all-prompts cache before fetching Supabase by type.
- [x] 2.6 Update `PROMPTS_UPSERT` to write cache after full success and invalidate cache after partial failure.
- [x] 2.7 Add handler tests or contract tests for cache hit, stale fallback, force refresh, type filtering, save cache update, and partial-save invalidation.

## 3. UI API and Bootstrap

- [x] 3.1 Extend `loadAllPrompts(options)` in `src/ui-preact/api/settingsApi.js` to send `preferCache` and `forceRefresh`.
- [x] 3.2 Create `src/ui-preact/hooks/usePromptsBootstrap.js` to load prompts once per authenticated user.
- [x] 3.3 Clear `allPrompts.value` when auth user becomes null or changes to another user.
- [x] 3.4 Call `usePromptsBootstrap(user)` from `src/ui-preact/components/MainApp.jsx`.
- [x] 3.5 Add hook tests for first authenticated load, duplicate same-user prevention, logout clearing, and user-switch reload.

## 4. Prompt Management UI Updates

- [x] 4.1 Update `PromptsPage` normal load to prefer cache.
- [x] 4.2 Update `PromptsPage` refresh action to call `loadAllPrompts({ forceRefresh: true })`.
- [x] 4.3 Update `SettingsForm` to initialize from existing `allPrompts.value` when bootstrap has already loaded prompts.
- [x] 4.4 Ensure Settings save and Prompts save keep `allPrompts.value` synchronized with saved prompt content.

## 5. Prompt Consumer Cache Consolidation

- [x] 5.1 Refactor `writingApi.js` so writing templates use the cache-aware unified prompt path instead of a long-lived feature-local TTL cache.
- [x] 5.2 Ensure `clearTemplateCache()` remains safe for callers or remove callers if no longer needed.
- [x] 5.3 Audit the context-menu prompt cache path and either migrate it to the unified cache service or invalidate it after relevant prompt saves.
- [x] 5.4 Verify English, Writing, Context Menu, and prompt-send flows use saved prompt changes without extension reload.

## 6. Validation and Documentation

- [x] 6.1 Run focused unit tests for cache service, prompt handlers, settings API, bootstrap hook, and writing prompt loading.
- [x] 6.2 Run `npm run test:unit` or the smallest reliable full unit suite available in the repo.
- [x] 6.3 Run `npm run build` to verify the MV3 bundle still builds.
- [x] 6.4 Update `docs/PROMPTS_AUTOLOAD_CACHE.md` if implementation decisions differ from the proposal.
- [x] 6.5 Run `openspec validate prompts-autoload-cache --strict --no-interactive`.
