# Testing Checklist - ChatGPT Extension v2.0

## Pre-Testing Setup

- [ ] Build completed successfully (`npm run build`)
- [ ] `dist/` folder contains all files
- [ ] Chrome Extensions page open (`chrome://extensions/`)
- [ ] Developer mode enabled
- [ ] Extension loaded from `dist/` folder
- [ ] Extension icon visible in toolbar

## 1. Basic Functionality (Existing Features)

### Settings Tab
- [ ] Open side panel
- [ ] Navigate to Settings tab
- [ ] Enter a test prompt (e.g., "Hello, how are you?")
- [ ] Check "Chạy tự động" checkbox
- [ ] Set interval to 5 minutes
- [ ] Click "Lưu cấu hình"
- [ ] Verify success message appears
- [ ] Click "Reset"
- [ ] Verify prompt cleared and auto-run disabled

### Results Tab
- [ ] Navigate to Results tab
- [ ] Click "Chạy ngay" button
- [ ] Verify loading spinner appears
- [ ] Wait for result to appear
- [ ] Verify result text is displayed
- [ ] Click "Làm mới" button
- [ ] Verify result updates (or shows cached result)
- [ ] Close side panel and reopen
- [ ] Verify cached result loads instantly

### ChatGPT Integration
- [ ] Extension opens ChatGPT tab automatically
- [ ] Prompt is sent to ChatGPT
- [ ] Response is captured correctly
- [ ] Chat ID is extracted from URL
- [ ] Extension doesn't interfere with normal ChatGPT usage

## 2. New Features - Chat History

### Basic Display
- [ ] Navigate to History tab
- [ ] Verify history list displays (or "Chưa có lịch sử" message)
- [ ] Run a prompt from Settings tab
- [ ] Return to History tab
- [ ] Click refresh button (🔄)
- [ ] Verify new chat appears in list

### History Items
- [ ] Verify each item shows:
  - [ ] Timestamp (e.g., "5 phút trước")
  - [ ] Chat ID (truncated)
  - [ ] Prompt (truncated to ~150 chars)
  - [ ] Response (truncated to ~200 chars)
- [ ] Click on a history item
- [ ] Verify it navigates to Results tab
- [ ] Verify full details are displayed

### History Limits
- [ ] Run prompts 10 times
- [ ] Verify all 10 appear in history
- [ ] Verify newest is at top
- [ ] (Optional) Run 100+ prompts to test limit

### Edge Cases
- [ ] Long prompt (500+ chars) displays correctly
- [ ] Long response (5000+ chars) displays correctly
- [ ] Special characters in prompt/response
- [ ] Empty response handling
- [ ] Rapid successive runs

## 3. New Features - Error Management

### Add Error
- [ ] Navigate to Errors tab
- [ ] Click "+ Thêm lỗi" button
- [ ] Verify modal opens
- [ ] Verify modal title is "Thêm Lỗi"
- [ ] Try to save without title
- [ ] Verify validation (should show alert)
- [ ] Enter title: "Test Error"
- [ ] Enter description: "This is a test error description"
- [ ] Select type: "Timeout"
- [ ] Select severity: "High"
- [ ] Click "Lưu"
- [ ] Verify modal closes
- [ ] Verify new error appears in list
- [ ] Verify error has orange left border (high severity)

### View Errors
- [ ] Verify error item shows:
  - [ ] Title
  - [ ] Type badge
  - [ ] Severity badge
  - [ ] Description
  - [ ] Timestamp
  - [ ] Edit button (✏️)
  - [ ] Delete button (🗑️)
- [ ] Add errors with different severities
- [ ] Verify colors:
  - [ ] Low = Green border
  - [ ] Medium = Yellow border
  - [ ] High = Orange border
  - [ ] Critical = Red border

### Edit Error
- [ ] Click edit button (✏️) on an error
- [ ] Verify modal opens
- [ ] Verify modal title is "Sửa Lỗi"
- [ ] Verify fields are pre-filled
- [ ] Change title to "Updated Error"
- [ ] Change severity to "Critical"
- [ ] Click "Lưu"
- [ ] Verify modal closes
- [ ] Verify error updated in list
- [ ] Verify border color changed to red

### Delete Error
- [ ] Click delete button (🗑️) on an error
- [ ] Verify confirmation dialog appears
- [ ] Click "Cancel" first
- [ ] Verify error NOT deleted
- [ ] Click delete button again
- [ ] Click "OK" in confirmation
- [ ] Verify error removed from list

### Error Types
Add and verify display for each type:
- [ ] Chung (General)
- [ ] Prompt
- [ ] Response
- [ ] Kết nối (Connection)
- [ ] Timeout

### Modal Behavior
- [ ] Click outside modal
- [ ] Verify modal closes
- [ ] Open modal and click X button
- [ ] Verify modal closes
- [ ] Open modal and click "Hủy"
- [ ] Verify modal closes
- [ ] Open modal and press ESC key
- [ ] (Should close - may need implementation)

## 4. Navigation & UI

### Tab Navigation
- [ ] Click each tab in order: Kết quả → Lịch sử → Lỗi → Cấu hình
- [ ] Verify each tab displays correctly
- [ ] Verify active tab has white background
- [ ] Verify inactive tabs have transparent background
- [ ] Navigate back to Kết quả
- [ ] Verify state is preserved

### Responsive Design
- [ ] Resize side panel width
- [ ] Verify content adjusts
- [ ] Verify no horizontal scrollbar (unless needed)
- [ ] Verify buttons don't overflow

### Visual Elements
- [ ] Verify all colors match design
- [ ] Verify gradient backgrounds
- [ ] Verify hover effects on buttons
- [ ] Verify smooth transitions
- [ ] Verify no layout shift on load

## 5. Performance & Stability

### Response Time
- [ ] Open side panel
- [ ] Measure time to load UI (should be < 500ms)
- [ ] Click Results tab with cached result
- [ ] Measure time to display (should be < 100ms)
- [ ] Click History tab
- [ ] Measure time to load list (should be < 200ms)

### Memory Usage
- [ ] Open Chrome Task Manager (Shift+Esc)
- [ ] Find extension process
- [ ] Note memory usage
- [ ] Perform various operations
- [ ] Check memory doesn't grow excessively

### Stability
- [ ] Run prompt 10 times in quick succession
- [ ] Verify no errors in console
- [ ] Add 20 errors quickly
- [ ] Verify no errors in console
- [ ] Close and reopen side panel multiple times
- [ ] Verify no issues

### Storage
- [ ] Open DevTools → Application → Storage → Extension
- [ ] Verify `chatHistory` key exists
- [ ] Verify `errorList` key exists
- [ ] Check data structure is correct
- [ ] Verify limits are enforced (100, 50)

## 6. Error Handling

### Network Issues
- [ ] Disconnect internet
- [ ] Try to run prompt
- [ ] Verify appropriate error message
- [ ] Reconnect internet
- [ ] Verify recovery

### ChatGPT Unavailable
- [ ] Close ChatGPT tab
- [ ] Try to run prompt
- [ ] Verify extension opens new ChatGPT tab
- [ ] Verify prompt still sent

### Invalid Data
- [ ] Manually corrupt storage data (if possible)
- [ ] Reload extension
- [ ] Verify graceful handling

### Edge Cases
- [ ] Empty prompt
- [ ] Very long prompt (10000+ chars)
- [ ] Special characters: `<script>alert('xss')</script>`
- [ ] Unicode: 你好, مرحبا, 🎉
- [ ] Null/undefined handling

## 7. Browser Integration

### Extension Lifecycle
- [ ] Disable extension
- [ ] Re-enable extension
- [ ] Verify it works
- [ ] Reload extension
- [ ] Verify data persists

### Permissions
- [ ] Verify only required permissions requested
- [ ] Check manifest.json permissions match usage

### Background Worker
- [ ] Check if background worker stays alive
- [ ] Verify alarms are set correctly
- [ ] Verify auto-run works after interval

## 8. Documentation

### README
- [ ] README.md is up to date
- [ ] Quick start instructions work
- [ ] Links to docs are correct

### User Guide
- [ ] Follow USER_GUIDE_vi.md step by step
- [ ] Verify all instructions accurate
- [ ] Check for typos

### Technical Docs
- [ ] Review UPDATE_v2.0.md
- [ ] Review ARCHITECTURE.md
- [ ] Verify code examples work

## 9. Cross-Browser Testing (if applicable)

### Chrome Variants
- [ ] Google Chrome (latest)
- [ ] Microsoft Edge (latest)
- [ ] Brave Browser (latest)
- [ ] Opera (latest)

### Different Versions
- [ ] Chrome 114 (minimum)
- [ ] Chrome 120+ (latest)

## 10. Regression Testing

### Existing Features Still Work
- [ ] Auto-run still triggers at interval
- [ ] Prompt template still applies
- [ ] Alarm system still works
- [ ] Storage still persists across sessions
- [ ] Content script injection still works

### No Breaking Changes
- [ ] Old storage keys still accessible
- [ ] Backward compatibility maintained
- [ ] No errors in existing workflows

## Final Checks

- [ ] No console errors
- [ ] No console warnings (acceptable ones documented)
- [ ] All assets load correctly
- [ ] No 404s in network tab
- [ ] Extension icon displays correctly
- [ ] Side panel opens/closes smoothly

## Bug Report Template

When you find a bug, document it:

```markdown
**Bug Title**: [Brief description]

**Severity**: Critical / High / Medium / Low

**Steps to Reproduce**:
1. Step 1
2. Step 2
3. Step 3

**Expected Behavior**: [What should happen]

**Actual Behavior**: [What actually happens]

**Console Errors**: [Any errors from console]

**Screenshots**: [If applicable]

**Browser**: Chrome [version]

**Extension Version**: 2.0
```

## Sign-Off

Testing completed by: _______________
Date: _______________
All critical bugs resolved: [ ] Yes [ ] No
Ready for production: [ ] Yes [ ] No

---

**Notes**:
- Mark each item as you test
- Document any issues found
- Retest after fixes
- Get second opinion on UI/UX
