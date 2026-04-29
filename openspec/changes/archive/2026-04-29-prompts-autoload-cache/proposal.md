## Why

Prompts are currently loaded only when the user opens Settings or the Prompts page, so features that need custom prompts can start from empty/default state after the extension opens. Re-fetching prompts from Supabase on every open also wastes time and network calls for configuration data that changes infrequently.

## What Changes

- Autoload unified prompts when the authenticated extension UI opens, before the user visits Settings or Prompts.
- Add a persistent prompt cache in `chrome.storage.local`, keyed by Supabase `user_id`.
- Serve prompt reads from cache when valid and fresh, with Supabase/default fallback behavior when cache is missing or stale.
- Update prompt save behavior so successful prompt changes update the local cache immediately.
- Ensure logout and user switching cannot display or reuse prompts from the previous user.
- Consolidate feature-level prompt caching so Writing and related flows use the same unified prompt source.
- Add tests for cache validation, stale/fresh behavior, user isolation, prompt save invalidation/update, and UI bootstrap behavior.

## Capabilities

### New Capabilities

- `prompt-autoload-cache`: Defines automatic prompt loading, persistent cache behavior, user isolation, fallback behavior, and prompt cache invalidation/update rules.

### Modified Capabilities

- None.

## Impact

- Background prompt handler: `src/background/handlers/prompts.js`.
- New background cache service: `src/background/services/promptCacheService.js`.
- Prompt registry/version metadata: `src/shared/allPrompts.js`.
- Runtime message/API layer: `src/ui-preact/api/settingsApi.js`, optionally `src/shared/messageSchema.js` for later cache update broadcast.
- UI bootstrap: `src/ui-preact/hooks/usePromptsBootstrap.js`, `src/ui-preact/components/MainApp.jsx`.
- Prompt management pages/forms: `src/ui-preact/pages/PromptsPage.jsx`, `src/ui-preact/settings/SettingsForm.jsx`.
- Feature prompt consumers/cache: `src/ui-preact/api/writingApi.js` and any existing context-menu prompt cache path that must stay consistent with saved prompts.
- Tests: unit tests for the cache service and hook, plus focused handler/API contract coverage.
