# Bugfix Note: `autoRun is not defined` when loading settings (Settings Preact)

**Date**: 2026-03-04  
**Component**: Sidepanel Settings (Preact)  
**Symptom**: `[AuthContext] Failed to load settings: ReferenceError: autoRun is not defined`  
**Seen in**: `sidepanel-preact.html` → bundled `dist/settings-preact.js` (runtime)

---

## 1) What happens

Khi sidepanel khởi động (AuthContext) hoặc mở Settings page, app gọi `loadSettings()`.

Trong runtime console xuất hiện:

```
[AuthContext] Failed to load settings: ReferenceError: autoRun is not defined
```

Hệ quả thường gặp:

- Settings không load được (nhiều trang phụ thuộc settings cũng có thể fail theo).
- Sidepanel có thể bị kẹt ở trạng thái loading hoặc hiển thị error.

---

## 2) Root cause

Trong `loadSettings()` ở source:

- File: `src/ui-preact/api/settingsApi.js`
- Code có dòng: `autoRun.value = config.autoRun ?? false;` (và các biến tương tự)

Nhưng các signal `autoRun`, `evaluatePrevious`, `reviewPrompt`, `realtimeEnabled` **không còn được khai báo/export** ở:

- `src/ui-preact/state/settingsState.js`

Vì vậy khi `loadSettings()` chạy, JS sẽ ném `ReferenceError` do identifier `autoRun` không tồn tại trong scope.

Ghi chú:

- Đây là lỗi runtime, bundler vẫn build được vì JS không bắt lỗi “undeclared identifier” ở compile-time (nếu không có lint/typecheck).

---

## 3) Recommended fix (minimal, correct with current UI state)

Vì các boolean settings trên hiện **không còn dùng trong UI**, fix tối thiểu là **xoá các dòng gán vào signal không tồn tại** trong `loadSettings()`.

### Patch location

- File cần sửa: `src/ui-preact/api/settingsApi.js`
- Remove các dòng:
  - `autoRun.value = ...`
  - `evaluatePrevious.value = ...`
  - `reviewPrompt.value = ...`
  - `realtimeEnabled.value = ...`

Sau khi sửa source, cần build lại để cập nhật bundle trong `dist/`.

---

## 4) Alternative fix (nếu autoRun/realtime... vẫn là feature cần giữ)

Nếu các field `autoRun/evaluatePrevious/reviewPrompt/realtimeEnabled` là requirement sản phẩm:

1. Re-introduce signals trong `src/ui-preact/state/settingsState.js`
2. Add UI controls trong SettingsForm/SettingsPage
3. Update `saveSettings()` để persist các field đó vào `settings.config`
4. Add migration/compat nếu cần

Chỉ chọn hướng này khi chắc chắn feature còn được dùng, vì sẽ tăng scope.

---

## 5) How to verify

1. Build extension:
   - `npm run build`
2. Reload extension trong `chrome://extensions` (Developer mode).
3. Mở sidepanel:
   - Không còn log `ReferenceError: autoRun is not defined`.
4. Mở Settings page:
   - `interval` và Atlassian fields load bình thường (nếu có data).

---

## 6) Prevent recurrence

- Add lint/typecheck để bắt “undefined variable” trước khi runtime:
  - ESLint rule `no-undef` (recommended)
  - hoặc migrate các file settings sang TypeScript.

