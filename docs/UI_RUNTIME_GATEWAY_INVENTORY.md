# UI Runtime Gateway Inventory

This inventory tracks direct `chrome.runtime.sendMessage` calls in `src/ui-preact`
after the `repo-hygiene-quality-baseline` migration.

## Migrated Request-Response Calls

These modules now send standardized envelopes through `sendRuntimeMessage`:

- `src/ui-preact/api/portfolioApi.js`
- `src/ui-preact/api/watchlistApi.js`
- `src/ui-preact/api/historyApi.js`
- `src/ui-preact/api/commodityApi.js`
- `src/ui-preact/api/writingApi.js`
- `src/ui-preact/api/authApi.js`
- `src/ui-preact/api/billingApi.js`
- `src/ui-preact/api/settingsApi.js`
- `src/ui-preact/api/marketAssessmentApi.js`
- `src/ui-preact/api/marketIndicesApi.js`
- `src/ui-preact/api/journalApi.js`
- `src/ui-preact/api/checklistApi.js`
- `src/ui-preact/api/atlassianApi.js`
- `src/ui-preact/api/promptImprovementApi.js`
- `src/ui-preact/api/watchlistPriceUpdater.js`
- `src/ui-preact/settings/APIKeysSection.jsx`
- `src/ui-preact/settings/DataImportSection.jsx`
- `src/ui-preact/settings/LLMProviderSection.jsx`
- `src/ui-preact/settings/LLMApiKeysSection.jsx`
- `src/ui-preact/settings/SettingsPage.jsx`
- `src/ui-preact/settings/StockResearchSection.jsx`
- `src/ui-preact/pages/AssetsPage.jsx`
- `src/ui-preact/pages/DashboardPage.jsx`
- `src/ui-preact/components/AssetHistoryChart.jsx`
- `src/ui-preact/components/NetWorthSummary.jsx`

## Explicit Direct-Send Allowlist

The architecture fitness test keeps this allowlist explicit. New direct sends in
UI code must either migrate to `runtimeGateway` or be added here with a reason.

- `src/ui-preact/api/runtimeGateway.js`: single gateway boundary.
- `src/ui-preact/context/ThemeContext.jsx`: theme sync/broadcast path.
- `src/ui-preact/pages/JobsPage.jsx`: legacy jobs settings surface.
- `src/ui-preact/pages/AlertsPage.jsx`: legacy price alert surface.
- `src/ui-preact/pages/PortfolioPage.jsx`: callback-style portfolio evaluation flow.
- `src/ui-preact/pages/ErrorsPage.jsx`: callback-style error log admin flow.
- `src/ui-preact/components/TeaStockModal.jsx`: callback-style prompt flow.
- `src/ui-preact/components/EvaluatePortfolioModal.jsx`: callback-style prompt flow.
- `src/ui-preact/components/PortfolioEvalModal.jsx`: callback-style prompt flow.
- `src/ui-preact/components/PromptQueueSection.jsx`: queue admin commands.
- `src/ui-preact/components/PortfolioSelector.jsx`: multi-portfolio legacy selector.
- `src/ui-preact/components/ConsentDialog.jsx`: consent bootstrap path.

## Next Migration Order

1. Move `JobsPage`, `AlertsPage`, and `PortfolioSelector` to small API modules.
2. Convert callback-style prompt/evaluation modals to promise-based
   `sendRuntimeMessage` calls.
3. Move `ThemeContext` and `ConsentDialog` to dedicated settings/privacy API
   wrappers once their bootstrap behavior is covered by tests.
