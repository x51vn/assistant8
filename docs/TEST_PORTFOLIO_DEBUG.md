# Portfolio UI Debug - Test Instructions

## Vấn đề
Portfolio không hiển thị dữ liệu trong UI sau khi click tab Portfolio.

## Các fix đã áp dụng
1. ✅ Migrate to Supabase handlers
2. ✅ Field name transformation (symbol→code, avg_price→entry)
3. ✅ Element type fix (table→tbody)
4. ✅ Navigation reload (added refreshPortfolioUI call)
5. ✅ Extensive debug logging added
6. ✅ HTML colspan fixed (5→6)

## Test Steps

### Build mới nhất
```bash
npm run build
```

### Load extension
1. Chrome → `chrome://extensions`
2. Enable Developer mode
3. Reload extension or "Load unpacked" `dist/` folder

### Open Side Panel & Console
1. Click extension icon → Open Side Panel
2. Press F12 → Open DevTools Console
3. Đảm bảo console filter = "All levels"

### Test 1: Login và check data trong Supabase
```javascript
// Paste vào console:
const response = await chrome.runtime.sendMessage({
  v: 1,
  type: 'PORTFOLIO_GET',
  correlationId: 'test-' + Date.now(),
  timestamp: Date.now()
});
console.log('Supabase response:', response);
console.log('Items count:', response.data?.items?.length || 0);
console.log('Items:', response.data?.items);
```

**Expected output:**
```javascript
{
  v: 1,
  type: 'PORTFOLIO_DATA',
  data: {
    success: true,
    items: [
      { id: 'uuid', symbol: 'VNM', quantity: 100, avg_price: 85000, current_price: 90000, ... },
      ...
    ]
  }
}
```

**Nếu items = []**: 
- User chưa có data trong Supabase
- Cần add stock manually qua UI form

**Nếu errorCode**:
- Copy error message
- Check auth status

### Test 2: Click Portfolio tab và check console logs

1. Click vào tab "Portfolio"
2. Check console output

**Expected logs (sequence):**
```
[Navigation] Portfolio button clicked!
[Navigation] Calling refreshPortfolioUI...
[Portfolio] Refreshing portfolio data...
[Portfolio] loadPortfolioUI called, table: exists
[Portfolio] getPortfolioFromSupabase called
[Portfolio] Response received: {...}
[Portfolio] Items from Supabase: 2 items
[Portfolio] Transformed items: [{...}, {...}]
[Portfolio] Portfolio data loaded: 2 items
[Portfolio] Rendering 2 rows to table
[Portfolio] Rendering stock: VNM {...}
[Portfolio] Appending row to table: <tr>...</tr>
[Portfolio] Rendering stock: VIC {...}
[Portfolio] Appending row to table: <tr>...</tr>
[Portfolio] ✓ All rows appended. Table HTML: <tr>...
[Portfolio] ✓ Portfolio data refreshed successfully
```

### Test 3: Check DOM elements
```javascript
// Paste vào console:
const table = document.getElementById('portfolioTable');
console.log('Table element:', table);

const tbody = table?.querySelector('tbody');
console.log('Tbody element:', tbody);
console.log('Tbody HTML:', tbody?.innerHTML.substring(0, 500));
console.log('Tbody rows count:', tbody?.rows?.length);
```

**Expected:**
- `table`: HTMLTableElement
- `tbody`: HTMLTableSectionElement  
- `tbody.rows.length`: > 0 nếu có data

### Test 4: Check CSS visibility
```javascript
// Paste vào console:
const portfolioPage = document.getElementById('portfolioPage');
console.log('Portfolio page:', portfolioPage);
console.log('Has active class:', portfolioPage?.classList.contains('active'));
console.log('Display style:', window.getComputedStyle(portfolioPage).display);
console.log('Visibility:', window.getComputedStyle(portfolioPage).visibility);
```

**Expected:**
- `active` class = true
- `display` = block (not 'none')
- `visibility` = visible

## Trường hợp phổ biến

### Case 1: Console shows "Items from Supabase: 0 items"
**Problem**: User chưa có data trong Supabase  
**Solution**: 
1. Click "+ Thêm/Sửa mã" button
2. Add stock manually (e.g., VNM, 100, 85000)
3. Save
4. Click Portfolio tab again

### Case 2: Console error "User not authenticated"
**Problem**: Chưa login  
**Solution**: 
1. Check Auth status
2. Login nếu chưa
3. Retry

### Case 3: Console shows logs nhưng UI empty
**Possible issues:**
- CSS hiding elements
- DOM không update (React/Vue conflict?)
- Table element bị replace sau appendChild
- Check Test 3 và Test 4 results

### Case 4: No console logs when clicking Portfolio
**Possible issues:**
- Event listener không attached
- Navigation module không load
- Check: `typeof refreshPortfolioUI` → should be 'function'

## Báo cáo kết quả

Vui lòng cung cấp:

1. **Screenshot** của Portfolio page
2. **Console output** (copy text hoặc screenshot)
3. **Test 1 result** - Supabase data
4. **Test 2 result** - Console logs sequence
5. **Test 3 result** - DOM elements
6. **Test 4 result** - CSS visibility

Nếu có lỗi, paste full error stack trace.

## Debug nâng cao

### Check background logs
1. `chrome://extensions`
2. Find ChatGPT Assistant
3. Click "Inspect views: Service worker"
4. Check console for handler logs

### Force refresh manually
```javascript
// Paste vào console:
const { refreshPortfolioUI } = await import('./portfolio.js');
await refreshPortfolioUI();
```

### Check message router
```javascript
// In background service worker console:
chrome.runtime.onMessage.addListener((msg) => {
  console.log('[DEBUG] Message received:', msg.type, msg);
});
```

---

**Lưu ý**: Tất cả debug logs sẽ bị remove sau khi fix xong. Chúng chỉ để diagnostic.
