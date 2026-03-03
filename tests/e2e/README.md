# E2E Test Suite

X51LABS-90: Playwright-based E2E test suite for ChatGPT Assistant Chrome Extension.

## Test Coverage

### 1. Extension Load Tests (`extension-load.spec.js`)
- ✅ Extension loads successfully with valid extension ID
- ✅ Background service worker is running
- ✅ Manifest.json is accessible
- ✅ Sidepanel.html loads with tabs
- ✅ Popup.html loads with interactive elements

### 2. Settings Tests (`settings.spec.js`)
- ✅ Navigate to Settings tab
- ✅ Settings controls display
- ✅ Toggle setting on/off
- ✅ Backup/restore buttons available
- ✅ Version information display

### 3. English Tab Tests (`english-tab.spec.js`)
- ✅ Navigate to English tab
- ✅ Topic selector with options
- ✅ Level selector with options
- ✅ Type selector with options
- ✅ Generate button visible
- ✅ Select configuration options
- ✅ Saved sentences area display
- ✅ Result area for responses

### 4. Portfolio Tab Tests (`portfolio.spec.js`)
- ✅ Navigate to Portfolio tab
- ✅ Add Stock button display
- ✅ Portfolio table display
- ✅ Open Add Stock modal
- ✅ Modal input fields (code, entry, quantity)
- ✅ Save button in modal
- ✅ Input stock data validation
- ✅ P/L calculation section
- ✅ Refresh/update button

### 5. History Tab Tests (`history.spec.js`)
- ✅ Navigate to History tab
- ✅ Conversation list display
- ✅ Search/filter functionality
- ✅ Timestamp display for conversations
- ✅ Clear/delete functionality
- ✅ Click conversation item
- ✅ Conversation detail view
- ✅ Sync status indicator

## Running Tests

```bash
# Install dependencies
npm install

# Run all tests
npm run test:e2e

# Run tests with UI mode (recommended for development)
npm run test:e2e:ui

# Run tests in headed mode (see browser)
npm run test:e2e:headed

# Run tests in debug mode
npm run test:e2e:debug

# Run specific test file
npx playwright test tests/e2e/extension-load.spec.js

# Run tests matching pattern
npx playwright test --grep "Portfolio"
```

## Test Structure

```
tests/
└── e2e/
    ├── extension-load.spec.js    # Basic extension functionality
    ├── settings.spec.js          # Settings page tests
    ├── english-tab.spec.js       # English learning feature
    ├── portfolio.spec.js         # Portfolio management
    └── history.spec.js           # Conversation history
```

## Configuration

The test suite uses `playwright.config.js` for configuration:
- Test directory: `./tests/e2e`
- Browser: Chromium (Desktop Chrome)
- Timeout: 60 seconds per test
- Screenshots: On failure
- Videos: Retain on failure
- HTML Report: `tests/e2e/reports`

## Test Data

Each test suite uses its own isolated user data directory:
- Extension Load: `test-user-data-e2e`
- Settings: `test-user-data-settings`
- English: `test-user-data-english`
- Portfolio: `test-user-data-portfolio`
- History: `test-user-data-history`

This isolation ensures tests don't interfere with each other.

## CI/CD Integration

Tests can be run in CI with:
```bash
npx playwright test --reporter=html
```

Test reports are generated in `tests/e2e/reports/` directory.

## Debugging

1. **UI Mode** (recommended):
   ```bash
   npm run test:e2e:ui
   ```
   Opens interactive UI to run and debug tests.

2. **Debug Mode**:
   ```bash
   npm run test:e2e:debug
   ```
   Opens Playwright Inspector for step-by-step debugging.

3. **Headed Mode**:
   ```bash
   npm run test:e2e:headed
   ```
   Run tests with visible browser.

## Notes

- Tests run in **non-headless mode** by default to properly load Chrome extensions
- Each test suite has `beforeAll` and `afterAll` hooks for setup/cleanup
- Extension ID is dynamically extracted from background pages
- All tests verify UI elements exist and are interactive
- Tests don't require ChatGPT login (only test extension UI)

## Future Enhancements

Potential additions for more comprehensive testing:
- Context menu integration tests
- Prompt template loading tests
- Supabase sync integration tests (requires auth)
- ChatGPT API interaction tests (requires login)
- Market data provider tests
- Portfolio P/L calculation accuracy tests
