## Why

The extension is currently branded as ChatGPT Assistant, which no longer matches the intended product positioning and limits future scope beyond a single assistant provider. Renaming to Assistant8 standardizes product identity across code, UI, packaging, and documentation before wider rollout.

## What Changes

- Rename product display name from ChatGPT Assistant (and chatgpt-assistant variants) to Assistant8 in user-facing and packaging metadata.
- Update extension identity strings in manifest, side panel headings, settings/about surfaces, and other UI labels.
- Update project/package naming references used for distribution and docs where the old brand appears.
- Define explicit naming consistency rules so future features use Assistant8 as the canonical product name.

## Capabilities

### New Capabilities
- `extension-branding`: Define canonical product naming and enforce Assistant8 identity in extension metadata, UI labels, and operator-facing documentation.

### Modified Capabilities
- None.

## Impact

- Affected code: extension manifest metadata, UI label strings, shared constants/messages where product name is surfaced.
- Affected systems: build/package outputs and release/docs references that include the old brand name.
- Dependencies: no new runtime dependency; requires coordinated string/data migration and regression checks for user-visible text.
