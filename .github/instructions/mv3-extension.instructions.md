---
applyTo: "src/**/*.{js,ts,json}"
---

# Chrome MV3 Extension Rules

## Service Worker (`src/background/**`)
- **Event-driven**: Can terminate anytime → no in-memory state
- **Sync listeners**: Register at top-level in `src/background/index.js`
- **No dynamic imports**: Avoid `import()` in background (Vite incompatible)
- **Persist state**: Use `chrome.storage.local` for important data

## Content Scripts (`src/content.{js,ts}`)
- **Minimal logic**: Only DOM automation; business logic in background
- **Messaging**: Use message types from `src/shared/messageSchema.js`
- **Selectors**: ChatGPT DOM is fragile → multiple fallbacks required
- **Privacy**: Don't read sensitive content unless necessary

## Manifest (`src/extension/manifest.json`)
- **MV3 required**: `manifest_version: 3`
- **Minimal permissions**: Justify each permission
- **Narrow hosts**: Prefer specific `host_permissions` over wildcards
- **CSP**: Never loosen extension CSP; no remote scripts

## Network Rules
- **Prefer DNR**: Use `declarativeNetRequest` over `webRequest`
- **Document rules**: Each rule needs docs in `docs/`

## When Making Changes

For service worker changes, include:
- Events listened to
- Storage keys changed
- Message contract (req/res schema)

For content script changes, include:
- Which pages match
- What DOM elements touched
- Privacy considerations
