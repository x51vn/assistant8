# Branding Audit: ChatGPT Assistant -> Assistant8

Date: 2026-04-29

## Scoped Audit Results

### Rename Now

- `src/extension/manifest.json`
- `src/extension/sidepanel-preact.html`
- `src/extension/privacy-policy.html`
- `src/extension/terms-of-service.html`
- `src/ui-preact/App.jsx`
- `src/ui-preact/components/auth/RegisterForm.jsx`
- `src/ui-preact/components/OnboardingWizard.jsx`
- `src/ui-preact/components/ConsentDialog.jsx`
- `src/ui-preact/settings/SettingsPage.jsx`
- `src/content/navigationGuard.js`
- `src/background/handlers/dataExport.js`
- `src/extension/images/README.md`
- `docs/CWS_LISTING.md`

### Defer (compatibility/internal identifiers)

- `src/background/handlers/contextMenu.js` (menu item IDs include `chatgpt-assistant-*`; kept stable to avoid menu re-registration and compatibility drift)
- `src/supabaseConfig.js` (`X-Client-Info: chatgpt-assistant-extension`; kept stable for telemetry/client fingerprint continuity)
- `src/content/editor.js` log tag `[ChatGPT Assistant]`; non-user-facing debug tag, low priority
- `src/content/output.js` internal comments only

### Defer (broad documentation sweep, follow-up)

A larger set of historical docs still contains legacy naming for archival context. These are not runtime-critical and can be migrated in a dedicated docs sweep after release rename cutover.

## Classification Rule

- User-facing runtime/packaging/release surfaces: rename now
- Internal protocol/schema/identifiers and compatibility-sensitive tags: defer
- Archival or non-critical docs: defer to dedicated documentation pass
