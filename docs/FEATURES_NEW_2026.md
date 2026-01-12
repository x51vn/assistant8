# New Features Implementation (Jan 2026)

## Overview
Implemented 3 major features for ChatGPT Assistant Extension:
1. **Prompt Templates Library** ✅
2. **Portfolio P&L Calculation** ✅  
3. **Cloud Sync with Google Drive** ✅

---

## 1. Prompt Templates Library

### Description
A collection of pre-built and custom prompt templates to speed up prompt creation.

### Features
- **Pre-built Templates**: 5 default templates (Stock Analysis, Portfolio Evaluation, Risk Assessment, Daily Summary, Code Review)
- **CRUD Operations**: Create, Read, Update, Delete custom templates
- **Categories**: Organize templates by category (analysis, portfolio, risk, market, coding, other)
- **Quick Use**: Click "Use" button to load template into prompt field
- **Search by Category**: Filter templates by category
- **Variable Support**: Use placeholders like {SYMBOL}, {PORTFOLIO}, {CODE} in templates

### UI Location
- **Tab**: "Templates" (new navigation tab)
- **Buttons**:
  - "+ New Template" - Create new template
  - "📌 Use" - Load template into prompt field
  - "✏️ Edit" - Modify template
  - "🗑️ Delete" - Remove template

### Files Modified/Created
- Created: `src/ui/templates.js` - Template management logic
- Created: `src/extension/sidepanel.html` (template section)
- Modified: `src/ui/index.js`, `src/ui/navigation.js`, `src/ui/pages.js`
- Modified: `src/extension/styles.css` - Template styling

### Storage
- Key: `promptTemplates` (Chrome Storage Local)
- Format: Array of template objects with id, name, description, category, content

### Default Templates
```json
[
  {
    "id": "template_1",
    "name": "Stock Analysis",
    "description": "Analyze a stock with technical and fundamental analysis",
    "category": "analysis",
    "content": "..."
  },
  // ... more templates
]
```

---

## 2. Portfolio P&L Calculation

### Description
Automatically calculate Profit/Loss for stock portfolio based on entry and current prices.

### Features
- **Entry Value Tracking**: Calculate portfolio value based on entry price × quantity
- **Current Price Updates**: Manual update of current prices via modal
- **P&L Calculation**: Auto-calculate P&L and P&L % for each stock
- **Portfolio Summary**: Display total portfolio metrics:
  - Total Entry Value
  - Current Value
  - Total P&L
  - Total P&L %
- **Color Coding**:
  - 🟢 Green: Positive P&L
  - 🔴 Red: Negative P&L
  - 🔘 Gray: Neutral (0 or no current price)
- **Enhanced Table Columns**: Added "Current Price" and "P&L" columns to portfolio table

### UI Location
- **Portfolio Tab**:
  - Portfolio Summary (top) - Shows aggregated metrics
  - Enhanced Portfolio Table - Shows P&L for each stock
  - "💰 Update Prices" - Button to update current prices

### Price Update Modal
- Display all stocks (except CASH)
- Input field for current price
- Display entry price for reference
- Save all at once

### Files Modified/Created
- Created: `src/ui/portfolioPL.js` - P&L calculation logic
- Modified: `src/ui/portfolio.js` - P&L display and price update
- Modified: `src/extension/sidepanel.html` - Added summary section
- Modified: `src/extension/styles.css` - P&L styling

### Functions
```javascript
calculateStockPL(stock)           // Single stock P&L
calculatePortfolioTotalPL(portfolio) // Total portfolio P&L
updateStockCurrentPrice(code, price) // Update single price
bulkUpdatePrices(priceMap)       // Update multiple prices
formatCurrency(value)             // VND formatting
formatPercent(value)              // Percentage formatting
getPLClass(value)                 // CSS class for color coding
```

### Storage
- Stored in portfolio object's `currentPrice` field
- `priceUpdatedAt` timestamp for tracking

---

## 3. Cloud Sync with Google Drive

### Description
Automatic backup and restore of all extension data to Google Drive.

### Features
- **Google Drive OAuth Integration**: Secure authentication with Google Drive
- **Auto-Backup**: Optional scheduled backups every hour
- **Manual Sync**: One-click sync button
- **Restore from Backup**: List recent backups and restore with one click
- **Folder Management**: Auto-create "ChatGPT-Assistant-Backups" folder
- **File Versioning**: Keep multiple backup versions with timestamps
- **Encrypted Transport**: Uses Google Drive's HTTPS + Google OAuth

### UI Location
- **Settings Tab** → "☁️ Cloud Sync (Google Drive)" section
- **Buttons**:
  - "🔐 Connect Google Drive" - Authenticate with Google
  - "⬆️ Sync Now" - Immediate backup
  - "🔓 Disconnect" - Revoke Google Drive access
  - "↓ Restore" - Restore specific backup
- **Checkbox**: Enable/Disable auto-sync
- **Backups List**: Shows recent backups with timestamps and sizes

### Files Modified/Created
- Created: `src/ui/googleDriveSync.js` - Google Drive API integration
- Created: `src/ui/sync.js` - Sync UI and logic
- Modified: `src/ui/index.js` - Include sync setup
- Modified: `src/extension/sidepanel.html` - Sync UI section
- Modified: `src/extension/styles.css` - Sync styling

### Functions
```javascript
authenticateGoogle()              // Interactive auth
getGoogleToken()                 // Get current token
revokeGoogleAuth()               // Disconnect
syncToGoogleDrive()              // Upload backup
restoreFromGoogleDrive(fileId)   // Download & restore
getOrCreateFolder(token)         // Manage Drive folder
listBackupsFromDrive(token, folderId) // List recent backups
schedulePeriodicSync()           // Schedule hourly sync
handleSyncAlarm()                // Handle scheduled sync
```

### Backup Data Format
```json
{
  "version": "1.0",
  "exportDate": "2026-01-12T10:30:00Z",
  "description": "ChatGPT Assistant Extension Backup",
  "data": {
    "portfolio": [...],
    "promptTemplates": [...],
    "chatHistory": [...],
    // ... all other storage keys
  }
}
```

### Data Synced
- portfolio
- portfolioPrompt
- prompt
- autoRun
- evaluatePrevious
- reviewPrompt
- interval
- chatHistory
- errorList
- runs
- settings
- promptTemplates

### Permissions Required
- `chrome.identity` - OAuth token management
- `chrome.storage.sync` - Store sync configuration
- `chrome.alarms` - Schedule periodic sync

### Google Drive API Used
- Files: create, list, download
- REST API v3
- Scopes: `https://www.googleapis.com/auth/drive.file`

---

## Setup Instructions

### For Users
1. Go to **Settings** tab
2. Scroll to **Cloud Sync** section
3. Click "🔐 Connect Google Drive"
4. Approve permissions in Google login popup
5. Click "⬆️ Sync Now" to backup
6. Enable checkbox for auto-sync (every hour)

### For Developers
To enable Google Drive sync, you need:

1. **Google Cloud Console Setup**:
   - Create Google Cloud project
   - Enable Google Drive API
   - Create OAuth 2.0 credentials (Chrome App)
   - Get Client ID

2. **Update manifest.json**:
```json
{
  "oauth2": {
    "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
    "scopes": ["https://www.googleapis.com/auth/drive.file"]
  },
  "permissions": [
    "storage",
    "identity",
    "alarms"
  ]
}
```

3. **Update googleDriveSync.js**:
```javascript
const GOOGLE_CLIENT_ID = 'YOUR_CLIENT_ID.apps.googleusercontent.com';
```

---

## Dark Theme Support

All new features include dark theme support:
- Templates list - Dark background with proper contrast
- P&L indicators - Colors maintain readability
- Sync UI - Dark styled buttons and status messages
- Price update modal - Dark themed inputs

---

## Testing Checklist

### Prompt Templates
- [ ] Create new template
- [ ] Load template into prompt field
- [ ] Edit existing template
- [ ] Delete template
- [ ] Filter by category
- [ ] Use default templates

### Portfolio P&L
- [ ] Add stock with entry price
- [ ] Update current price
- [ ] Check P&L calculation accuracy
- [ ] Verify portfolio summary
- [ ] Color coding working (green/red)
- [ ] Multiple price updates

### Cloud Sync
- [ ] Connect to Google Drive
- [ ] Sync to Drive
- [ ] View backups list
- [ ] Restore from backup
- [ ] Enable auto-sync
- [ ] Check periodic sync works
- [ ] Disconnect safely

---

## Future Enhancements

1. **Templates**:
   - Import/Export template library
   - Share templates with others
   - Template favorites
   - Advanced search

2. **Portfolio P&L**:
   - Historical P&L tracking
   - Charts and graphs
   - Target price alerts
   - Export portfolio reports

3. **Cloud Sync**:
   - Sync conflict resolution
   - Selective sync (choose which data)
   - Sync to multiple cloud providers (Dropbox, OneDrive)
   - Sync encryption with password

---

## File Size Impact

Build output size:
- Before: ~24 KB (ui.js)
- After: ~40 KB (ui.js)
- Additional modules: templates.js, portfolioPL.js, googleDriveSync.js, sync.js
- Gzip: ~12 KB

---

## Known Limitations

1. **Google Drive Sync**:
   - Requires user Google account
   - No encryption at rest (Google Drive handles this)
   - One-way sync only (no real-time sync)
   - Rate limited by Google API

2. **P&L Calculation**:
   - Manual price updates only (no price feed integration)
   - No dividend/split adjustment
   - CASH entry price not used in calculations

3. **Templates**:
   - No shared template library
   - Limited to local storage

---

## References

- Google Drive API: https://developers.google.com/drive/api/v3
- Chrome Identity API: https://developer.chrome.com/docs/extensions/reference/identity/
- Chrome Storage API: https://developer.chrome.com/docs/extensions/reference/storage/
- Manifest v3: https://developer.chrome.com/docs/extensions/mv3/
