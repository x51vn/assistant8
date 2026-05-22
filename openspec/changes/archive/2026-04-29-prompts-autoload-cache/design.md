## Context

Unified prompts are defined in `src/shared/allPrompts.js`, backed by Supabase `public.prompts`, and accessed through `src/background/handlers/prompts.js`. The UI stores loaded prompts in the `allPrompts` signal, but that signal is currently populated only when `PromptsPage` or `SettingsForm` mounts.

This means extension startup can leave prompt consumers with empty state or local defaults until a prompt-management page is opened. `writingApi.js` also keeps a short-lived in-memory writing-template cache, which is not durable across side panel reloads and can drift from the unified prompt source after prompt saves.

The extension is MV3-based. Background service workers can be terminated at any time, so durable prompt cache state must live in extension storage rather than in module variables.

## Goals / Non-Goals

**Goals:**

- Load unified prompts automatically after authenticated UI startup.
- Cache prompt data persistently in `chrome.storage.local` by authenticated user.
- Avoid Supabase reads on repeated extension opens while cache is valid and fresh.
- Preserve correct fallback behavior when cache or Supabase is unavailable.
- Keep prompt consumers aligned with the unified prompt source after saves.
- Provide enough cache metadata to debug source, age, user, and registry compatibility.

**Non-Goals:**

- Do not add Supabase realtime subscriptions for prompt changes.
- Do not sync prompt cache through `chrome.storage.sync`.
- Do not preload prompts during service worker startup.
- Do not change the Supabase `prompts` schema.
- Do not rewrite unrelated Settings UI or prompt editor behavior.

## Decisions

### Background owns the persistent prompt cache

`src/background/handlers/prompts.js` remains the only runtime path for loading and saving prompt data. A new `src/background/services/promptCacheService.js` provides cache key creation, validation, read/write/remove, and type filtering.

Rationale: keeping cache ownership in background avoids duplicating validation rules in UI modules and keeps all prompt reads aligned with existing message handlers.

Alternative considered: UI reads `chrome.storage.local` directly before calling background. This was rejected because user isolation, registry-version checks, and stale/fallback behavior would be duplicated across UI code.

### Cache is stored in `chrome.storage.local` and keyed by user

Cache keys use:

```text
x51labs_prompts_cache_v1:{userId}
```

The cache payload contains `schemaVersion`, `registryVersion`, `userId`, `cachedAt`, `source`, and normalized `prompts`.

Rationale: prompt data can be large, is not suited to `chrome.storage.sync`, and must not leak between users.

### Registry version invalidates incompatible prompt cache

`src/shared/allPrompts.js` exports `PROMPT_REGISTRY_VERSION`. The cache service rejects cache payloads whose registry version does not match.

Rationale: default prompt keys and metadata are part of the runtime contract. A version guard prevents old cache from hiding newly introduced prompt keys or incompatible metadata.

### MVP uses cache-first with stale fallback, not fire-and-forget refresh

For `PROMPTS_GET_ALL`:

- Fresh cache returns immediately.
- Stale cache triggers a bounded Supabase refresh. If refresh succeeds, fresh data is returned and cache is updated. If refresh fails, stale cache is returned with cache metadata marking it stale.
- Cache miss fetches Supabase. If Supabase fails, defaults are returned.

Rationale: MV3 service workers can terminate before fire-and-forget refresh work completes. Blocking stale refresh with a short timeout is more predictable for MVP.

### UI bootstrap runs in authenticated app lifecycle

A new `usePromptsBootstrap(user)` hook runs from `MainApp` after authentication. It calls `loadAllPrompts({ preferCache: true })`, writes results to `allPrompts.value`, avoids duplicate loads for the same user, and clears prompt state when user becomes null or changes.

Rationale: `MainApp` is mounted for all authenticated feature pages, unlike Settings or Prompts pages.

### Save path updates or invalidates cache

`PROMPTS_UPSERT` updates the user cache only after full save success. Partial success does not overwrite the full cache; it invalidates the cache so a later load refreshes from Supabase/defaults.

Rationale: overwriting cache after partial success could make local state look complete while Supabase contains only a subset of saved changes.

### Feature-level prompt caches are consolidated

Writing templates and other prompt consumers use `PROMPTS_GET_BY_TYPE` or the already-bootstraped `allPrompts` signal instead of keeping independent long-lived prompt caches.

Rationale: feature-level caches can serve stale prompt content after prompt edits. One shared cache policy is easier to reason about and test.

## Risks / Trade-offs

- User-scoped cache leak risk -> validate `userId` on every cache read and clear UI prompt state on logout/user switch.
- Stale cache after remote prompt edits from another device -> use TTL plus explicit Prompts page force refresh. Realtime sync remains out of scope.
- Stale refresh can delay startup when cache is expired -> use a bounded timeout and fallback to stale cache/defaults.
- Registry version churn can force extra Supabase fetches -> increment version only when prompt keys/metadata compatibility changes.
- Existing prompt count comments are inconsistent -> normalize comments before relying on registry metadata in tests.

## Migration Plan

1. Add `PROMPT_REGISTRY_VERSION` and normalize prompt registry comments/counts.
2. Add and test `promptCacheService`.
3. Wire cache behavior into `PROMPTS_GET_ALL`, `PROMPTS_GET_BY_TYPE`, and `PROMPTS_UPSERT`.
4. Add `loadAllPrompts(options)` support for `preferCache` and `forceRefresh`.
5. Add `usePromptsBootstrap(user)` and call it from `MainApp`.
6. Update Prompts page, Settings form, and Writing API to use the unified cached path.
7. Keep default prompt fallback unchanged so rollback can remove cache usage without data migration.

## Open Questions

- Should `writing.english_learning` be included in the unified prompt UI and registry count, or remain an internal fallback-only template?
- Should context menu prompt caching be fully migrated to the new cache service in MVP, or only invalidated when unified prompts are saved?
