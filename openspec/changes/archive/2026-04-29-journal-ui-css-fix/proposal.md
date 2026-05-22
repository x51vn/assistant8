## Why

Journal UI (JournalPage + 4 modals) được implement trong `trading-journal-mvp` nhưng dùng ~34 CSS class không tồn tại hoặc sai tên so với design system trong `styles-preact.css`. Kết quả là các modal hiện raw HTML không styled, forms không có border/padding, buttons hiện full-size unstyled, và P&L/status không có màu. Cần fix để feature có thể sử dụng được.

## What Changes

- **Rename class sai tên** trong 5 JSX files để dùng đúng design system class names (`modal-card` → `modal-content`, `form-input` → `input-field`, `modal-actions` → `modal-footer`, `btn-close` → `modal-close`, `alert-danger` → `alert-error`)
- **Thêm CSS journal section** vào `styles-preact.css` cho các class journal-specific thực sự mới: status badges, btn-small variants, btn-warning/info/success/ghost, text-positive/negative utilities, table-container/data-table, metrics bar, pnl-preview, star-rating, checklist UI, prefill-banner
- **Thêm shared utilities** thiếu: `page-subtitle`, `header-content`, `form-section-title`

## Capabilities

### New Capabilities

- `journal-ui-styles`: CSS styles cho Trading Journal UI — status badges, metrics bar, table, action buttons, P&L colors, star rating, checklist settings, prefill banner

### Modified Capabilities

<!-- No existing spec-level behavior changes — this is pure UI/CSS fix, no API or data model changes -->

## Impact

- **CSS**: `src/extension/styles-preact.css` — thêm ~200 dòng section Journal UI
- **JSX (5 files)**:
  - `src/ui-preact/pages/JournalPage.jsx`
  - `src/ui-preact/pages/journal/NewEntryModal.jsx`
  - `src/ui-preact/pages/journal/CloseTradeModal.jsx`
  - `src/ui-preact/pages/journal/ReviewModal.jsx`
  - `src/ui-preact/pages/journal/ChecklistSettingsModal.jsx`
- **No API changes**: Không thay đổi message schema, handlers, hay Supabase queries
- **No test changes**: Unit tests kiểm tra logic backend — không ảnh hưởng
- **Build**: Vite bundle sẽ pick up CSS changes tự động
