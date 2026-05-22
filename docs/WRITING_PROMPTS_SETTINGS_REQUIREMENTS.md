# Requirements: Writing Prompt Templates in `prompts` Table + Collapsed Settings UI

**Date**: 2026-02-05  
**Owner**: ChatGPT Assistant (extension)  
**Scope**: Writing Assistant prompt templates currently hard-coded in `src/ui-preact/api/writingApi.js`

---

## 1) Background (Current State)

- Writing Assistant templates are hard-coded as JS functions in `src/ui-preact/api/writingApi.js` (`PROMPT_TEMPLATES`).
- Settings prompt templates (master/portfolio/stockEval/teaStock/contextMenu/english) are stored in Supabase table `public.settings` as JSONB `config.prompts.*` and edited via Settings UI (`src/ui-preact/settings/SettingsForm.jsx`).
- Supabase schema already contains `public.prompts` (prompt library) and `public.categories` (organizing prompts), but the extension UI does not currently manage `public.prompts`.

---

## 2) Goals

1. Store Writing Assistant templates in Supabase table `public.prompts` (per user).
2. Allow editing those Writing templates via the Settings page, using a flow consistent with existing Settings prompts (load → edit → save).
3. Redesign Settings prompts UI to be compact: prompts are collapsed by default, users can expand to view/edit.
4. Maintain reliability: Writing Assistant must still work with sane defaults even when Supabase/auth is unavailable.

---

## 3) Non-Goals (Explicitly Out of Scope)

- Building a full “Prompt Library” UI for arbitrary prompt CRUD beyond the system-defined Writing templates.
- Changing Writing Assistant job types, inputs, or output format rules (unless required by templating support).
- Server-side transactional guarantees across `settings` and `prompts` tables (nice-to-have; see options).

---

## 4) Key Decisions Required

### 4.1 Stable Identification of System Templates

**Problem**: `public.prompts` currently has no stable `key/slug` column and no uniqueness constraint for system templates.

Acceptable approaches:
1. **Recommended**: Add `key TEXT` + unique constraint `(user_id, key)` to `public.prompts`.
2. **Minimal (no schema change)**: Use `tags` (array) to store a stable key tag (e.g., `system:writing:email`) and enforce uniqueness at the application layer.
3. Use `category_id` + `title` convention (e.g., category “Writing Assistant”, title “email”) and enforce uniqueness at the application layer.

**Constraint**: Without a stable key enforced by schema, duplicates can occur and lookups become brittle.

---

## 5) Data Model Requirements

### 5.1 Templates to Store

Store exactly 6 templates (one per job type) per user:

| Job type | Stable key (recommended) | Default title (suggested) |
|---|---|---|
| `email` | `writing.email` | `Writing: Email` |
| `social` | `writing.social` | `Writing: Social` |
| `summarize` | `writing.summarize` | `Writing: Summarize` |
| `rewrite` | `writing.rewrite` | `Writing: Rewrite` |
| `translate` | `writing.translate` | `Writing: Translate` |
| `outline` | `writing.outline` | `Writing: Outline` |

### 5.2 Categories/Tags

Best practice (optional but recommended):
- Create/find a category per user, e.g. `Writing Assistant`.
- Add tags to each system template, e.g. `system`, `writing_assistant`, `job:email`.

### 5.3 Defaults and Fallback

Required:
- Built-in defaults must remain shipped in code (source of fallback) so Writing Assistant can still generate prompts when:
  - user is not authenticated
  - Supabase is unavailable
  - the `prompts` rows are missing/corrupted

Constraint:
- `public.prompts.content` has a DB check constraint `content_not_empty`, so the system cannot represent “disabled template” by saving empty content.

---

## 6) Template Rendering Requirements

### 6.1 Template Format

The stored template content must be a **plain text template** (no code execution).

Choose one format:
1. **Recommended**: Mustache-like variables `{{var}}` and optional blocks `{{#if var}}...{{/if}}`.
2. Minimal: variables only `{{var}}` with missing vars replaced by `''` (no conditionals).

Constraints:
- Rendering must be deterministic and safe (no `eval`, no function injection).
- Unknown placeholders must not crash; they should render as empty or remain unchanged (pick one rule and keep it consistent).
- Prototype pollution must be prevented (do not allow `__proto__`, `constructor`, `prototype` access).

### 6.2 Variable Contract (Per Job Type)

The renderer must support these variables at minimum (values come from WritingPage inputs/options):

| Job type | Variables (minimum) |
|---|---|
| `email` | `keyPoints`, `context`, `recipient`, `emailGoal`, `tone`, `audience`, `length`, `languageOutput`, `includeSubject` |
| `social` | `rawContent`, `link`, `platform`, `cta`, `hashtags`, `variants`, `tone`, `languageOutput`, `length` |
| `summarize` | `sourceText`, `summaryStyle`, `focus`, `maxLines`, `languageOutput` |
| `rewrite` | `sourceText`, `rewriteGoal`, `faithfulness`, `targetLength`, `tone`, `audience`, `languageOutput` |
| `translate` | `sourceText`, `direction`, `style`, `domain`, `glossary` |
| `outline` | `topic`, `goal`, `mustInclude`, `docType`, `structureDepth`, `includeExamples`, `languageOutput` |

Recommended computed variables (quality-of-life):
- `languageName` derived from `languageOutput` (e.g., `Vietnamese`/`English`).
- `lengthWordRange` derived from `length` (e.g., `50-100`, `100-200`, `200+`).

### 6.3 Validation and Warnings

Required:
- Settings UI must validate “not empty” before saving (align with DB constraint).
- UI should warn (not block) if the template does not include core variables for that job type (e.g., email template missing `{{keyPoints}}`).

---

## 7) Background/API Requirements

### 7.1 Message-Based API (MV3 Pattern)

Add background handlers to:
1. Fetch all Writing templates for the current user.
2. Upsert (insert or update) Writing templates in bulk.
3. Optionally “reset to defaults” (server-side convenience), or let UI send default content.

Constraints:
- Must require auth (same model as `SETTINGS_GET/UPDATE` with `requireAuth()`).
- Must use retry wrapper (`supabaseWithRetry`) and return user-friendly errors.
- Must not block critical user flows: WritingPage prompt generation should fall back to defaults if fetch fails.

### 7.2 Linking to Chat History (Optional)

If templates live in `public.prompts`, consider writing `prompt_id` into `public.chat_history` rows:
- Benefit: traceability, analytics, potential `usage_count` updates.
- Constraint: current persistence helper `persistPromptSafe()` does not accept `promptId`; would require extending the message/options pipeline.

---

## 8) Settings UI/UX Requirements (Collapsed Prompts)

### 8.1 Layout Principles

Required:
- Prompts are collapsed by default to reduce vertical scroll.
- User can expand/collapse each prompt to view/edit.
- Master prompt should be expanded by default (most important).

Recommended:
- Provide “Expand all / Collapse all” control.
- Show a one-line preview (first ~80 chars) and character count in collapsed state.
- Persist expanded/collapsed state locally (device-only), not in Supabase (avoid polluting user settings).

### 8.2 Prompt Grouping

Required groups:
1. Core: Master Prompt
2. Specialized: portfolio/stockEval/teaStock/contextMenu/english
3. Writing Assistant: 6 writing job templates (from `public.prompts`)

### 8.3 Actions Per Prompt

Required:
- Edit textarea (only visible when expanded).
- “Reset to default” (per prompt).

Recommended:
- “Copy” button.
- “Preview render” (render template with sample inputs/options).

### 8.4 Save Flow

Required:
- One “Save” action should persist:
  - settings config (existing `public.settings`)
  - writing templates (new `public.prompts` usage)

Constraints:
- If saving settings succeeds but saving writing templates fails (or vice versa), UI must:
  - clearly report partial failure
  - keep unsaved changes in UI so user can retry

---

## 9) Migration / Backfill Requirements

Required behavior for existing users:
- If Writing templates are missing in `public.prompts`, the app must create them using defaults.
- Creation must be idempotent (safe to run multiple times).
- Never overwrite user-edited templates automatically.

Where to run:
- Prefer background-side “ensure system prompts exist” on auth/login or on Settings open.

---

## 10) Security & Privacy Constraints

Required:
- Template content is treated as plain text (no HTML rendering, no code execution).
- Do not log full prompt contents in production logs (log length and key only).
- Respect RLS: users can only access their own prompt rows.

---

## 11) Performance Requirements

Required:
- Fetch writing templates in one query (bulk), cache in memory for the session.
- Do not fetch templates on every “Generate” click (avoid latency spikes).

Recommended:
- If `realtimeEnabled` is on, optionally subscribe to template changes and refresh cache.

---

## 12) Acceptance Criteria

1. Writing templates are no longer hard-coded as the single source of truth; they can be edited via Settings and persist per user in `public.prompts`.
2. WritingPage uses the user’s stored templates when available, and falls back to built-in defaults when not.
3. Settings prompts UI is collapsed/expandable, reducing scrolling, and remains usable on small screens.
4. Saving reports clear success/failure, including partial failure cases.
5. No regression: existing settings prompts still load/save correctly via `public.settings`.

---

## 13) Test Plan (Recommended)

Unit tests:
- Template rendering: variable replacement, missing vars behavior, conditional blocks (if supported).
- Validation: empty content blocked, missing core variables emits warning.

Integration tests:
- Settings load: returns defaults when no DB rows.
- Settings save: writes to both `settings` and `prompts` (happy path + partial failure).

Manual tests:
- Edit a Writing template, generate output from WritingPage, verify prompt changes take effect.
- Logout/offline: WritingPage still generates using defaults.

---

## 14) Open Questions

1. Do we also migrate the existing 6 Settings prompts (`config.prompts.*`) into `public.prompts` for a unified system, or keep them in `public.settings`?
2. Do we want schema changes (`key`, `is_system`) now, or accept app-layer uniqueness?
3. Should “Reset all” on Settings also reset Writing templates in `public.prompts`?

