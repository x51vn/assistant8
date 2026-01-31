# Portfolio Page Enhancements - Preact Version

**Date**: January 31, 2026  
**Status**: ✅ Complete  
**Build**: Successful (1.44s, 123 modules)

## Summary

The Preact portfolio page has been fully enhanced with all missing functions from the old version. The component now supports:

1. ✅ Portfolio Evaluation with ChatGPT
2. ✅ Individual Stock Evaluation
3. ✅ Tea Stock Search
4. ✅ Complete P&L Calculations
5. ✅ History Tracking
6. ✅ Settings Integration
7. ✅ Prompt Building with Portfolio Context

---

## New Functions Added

### 1. **Helper: `calculateStockPL(stock)`**
- Calculates Profit/Loss for a single stock
- Returns: `{ entryValue, currentValue, pl, plPercent, priceChange, priceChangePercent }`
- Used in: Portfolio summary, P&L display

### 2. **Helper: `calculatePortfolioTotalPL(portfolio)`**
- Calculates total portfolio Profit/Loss
- Returns: `{ totalEntryValue, totalCurrentValue, totalPL, totalPLPercent }`
- Used in: Portfolio summary display

### 3. **Helper: `formatCurrency(value)`**
- Formats numbers as Vietnamese currency (VND)
- Example: `1000000` → `1.000.000 ₫`

### 4. **Helper: `extractChatIdFromUrl(chatUrl)`**
- Extracts chat ID from ChatGPT URL
- Pattern: `/c/[chat-id]`
- Used in: Extracting chat reference for history tracking

### 5. **Helper: `sendPromptWithHistory(prompt, title, createNewChat)`**
- Sends prompt to ChatGPT with message routing
- Integrates with MESSAGE_TYPES.SEND_PROMPT
- Returns: `{ success, chatId, chatUrl, error }`
- Used by: Evaluate Portfolio, Evaluate Stock, Tea Stock Search

### 6. **Helper: `getSettings()`**
- Retrieves user settings from background handler
- Gets: portfolio evaluation prompts, tea stock prompts, etc.
- Returns: settings object from Supabase

### 7. **Handler: `handleEvaluatePortfolio(prompt)`**
- Sends entire portfolio for evaluation to ChatGPT
- Builds portfolio table with all stocks + P&L
- Combines with user prompt
- Shows success/error toast

### 8. **Handler: `handleEvaluateStock(stockId)`**
- Sends individual stock evaluation to ChatGPT
- Includes stock current data (entry, price, quantity, P&L)
- Reads evaluation template from settings
- Shows success/error toast

### 9. **Handler: `handleTeaStockSearch(prompt)`**
- Sends tea stock search request to ChatGPT
- Allows user to find stocks matching criteria
- Shows success/error toast

### 10. **Component: `EvaluatePortfolioModal`**
- Modal for entering portfolio evaluation prompt
- Features:
  - Textarea for prompt input
  - Help text about portfolio inclusion
  - Cancel/Evaluate buttons
  - Loading state during submission

### 11. **Component: `TeaStockModal`**
- Modal for entering tea stock search criteria
- Features:
  - Textarea for search prompt input
  - Help text with example criteria
  - Cancel/Search buttons
  - Loading state during submission

---

## API Integration

### Message Types Used
```javascript
MESSAGE_TYPES.SEND_PROMPT        // Send prompt to ChatGPT
MESSAGE_TYPES.SETTINGS_GET       // Get user settings
```

### Response Handling
- Checks for `chrome.runtime.lastError`
- Validates response type
- Extracts error messages
- Handles null/undefined responses gracefully

---

## Component Structure

### State Signals
```javascript
isEvaluateModalOpen      // Show/hide evaluate portfolio modal
isTeaStockModalOpen      // Show/hide tea stock search modal
showSuccessToast         // Show success message
showErrorToast          // Show error message
```

### Modal Handlers
```javascript
openEvaluateModal()      // Opens evaluate portfolio modal
openTeaStockModal()      // Opens tea stock search modal
handleEvaluatePortfolio()  // Evaluates portfolio via ChatGPT
handleTeaStockSearch()   // Searches for tea stocks via ChatGPT
```

---

## Portfolio Context Building

When evaluating portfolio, the system creates a table:

```
## DANH MỤC HIỆN CÓ

| Mã | Entry | Current | Khối lượng | P&L |
|----|-------|---------|-----------|-----|
| VNM | 85000 | 90000 | 100 | 500000 (5.88%) |
| BID | 45000 | 42000 | 50 | -150000 (-6.67%) |

**Tổng P&L: 350000 (2.33%)**

## YÊU CẦU
[User's evaluation prompt]
```

---

## Feature: Stock Evaluation

When evaluating a single stock, includes:

```
Đánh giá mã cổ phiếu VNM: xu hướng, điểm mạnh/yếu, khuyến nghị.

**Thông tin hiện tại:**
- Mã: VNM
- Entry: 85000
- Giá hiện tại: 90000
- Khối lượng: 100
- P&L: 5.88%
```

Settings can override the evaluation template via `stockEvalPrompt` setting.

---

## Feature: Tea Stock Search

Allows searching for stocks matching user criteria:

```
Example prompt:
"Find Vietnamese stocks with dividend yield > 5% and 
market cap > 1 trillion VND"

The ChatGPT response will be saved to chat history 
for future reference.
```

---

## Error Handling

All operations have comprehensive error handling:

1. **Network Errors**: Shows error toast with message
2. **Validation Errors**: Alerts user (missing prompt, etc.)
3. **ChatGPT Errors**: Displays error from message response
4. **Timeout**: Graceful degradation with error message

---

## Success Indicators

### Toasts Show:
- ✅ "Portfolio evaluation sent to ChatGPT!"
- ✅ "Stock VNM evaluation sent!"
- ✅ "Tea stock search sent to ChatGPT!"

### Error Toasts Show:
- ❌ "Please enter evaluation prompt"
- ❌ "Failed to send: [error message]"
- ❌ "Error: [exception message]"

---

## Comparison with Old Version

| Feature | Old (src/ui/portfolio.js) | New (Preact) | Status |
|---------|--------------------------|--------------|--------|
| Portfolio Evaluation | ✅ Yes | ✅ Yes | ✅ Complete |
| Stock Evaluation | ✅ Yes | ✅ Yes | ✅ Complete |
| Tea Stock Search | ✅ Yes | ✅ Yes | ✅ Complete |
| P&L Calculation | ✅ Yes | ✅ Yes | ✅ Complete |
| History Tracking | ✅ Via SEND_PROMPT | ✅ Via SEND_PROMPT | ✅ Complete |
| Settings Integration | ✅ Via chrome.storage.local | ✅ Via MESSAGE_TYPES.SETTINGS_GET | ✅ Enhanced |
| Modal Management | ✅ DOM-based | ✅ Signal-based | ✅ Better |
| Error Handling | ✅ Alert-based | ✅ Toast-based | ✅ Improved |

---

## Testing Checklist

- [ ] Open Portfolio tab
- [ ] Click "Evaluate Portfolio" button
- [ ] Enter evaluation prompt (e.g., "Recommend allocation strategy")
- [ ] Click "Evaluate" → Modal closes, toast shows, ChatGPT opens
- [ ] Click table row "Evaluate" button on a stock
- [ ] Enter stock evaluation → Modal closes, toast shows
- [ ] Click "Tea Stock Search" button
- [ ] Enter search criteria (e.g., "dividend > 5%")
- [ ] Click "Search" → Modal closes, toast shows, ChatGPT opens
- [ ] Verify all prompts include portfolio context
- [ ] Check P&L calculations are correct

---

## Build Verification

```bash
✓ 123 modules transformed
✓ dist/ui.js 86.71 kB (gzip: 24.14 kB)
✓ built in 1.44s
```

All functions compiled successfully with no errors.

---

**Next Steps**:
1. ✅ Functions implemented
2. ✅ Build verified
3. 🔄 Ready for testing in extension
4. 🔄 Ready for end-to-end testing

