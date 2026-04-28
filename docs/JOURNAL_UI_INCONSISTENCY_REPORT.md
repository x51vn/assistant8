# Journal UI Inconsistency Report

> Generated: 2026-04-28  
> Scope: `src/ui-preact/pages/JournalPage.jsx` + `src/ui-preact/pages/journal/*.jsx`  
> Symptom: Giao diện Journal/Checklist không có style (ảnh chụp màn hình: modal hiện raw HTML không styled)

---

## TL;DR

Journal UI dùng **~34 CSS class không tồn tại** trong `styles-preact.css`. Phần lớn là do journal dùng tên class khác với design system hiện có (ví dụ `modal-card` thay vì `modal-content`, `form-input` thay vì `input-field`, `modal-actions` thay vì `modal-footer`).

---

## 1. Bản đồ sai lệch class (CSS class mismatch map)

```
JOURNAL COMPONENT          DÙNG CLASS           CSS THỰC TẾ
─────────────────────────────────────────────────────────────
Modal container
  All 4 modals + JPage  → modal-card          ← modal-content  ✗ UNDEFINED
  NewEntryModal         → modal-card modal-large ← modal-content modal-large ✗

Input fields
  All forms             → form-input          ← input-field    ✗ UNDEFINED

Modal footer
  All modals            → modal-actions       ← modal-footer   ✗ UNDEFINED

Close button
  All modals            → btn-ghost btn-close ← modal-close    ✗ UNDEFINED

Page header sub-area
  JournalPage           → header-content      ← (no equivalent) ✗ UNDEFINED
  JournalPage           → page-subtitle       ← (no equivalent) ✗ UNDEFINED
```

---

## 2. Classes hoàn toàn chưa có trong CSS

### 2a. Buttons

| Class | Dùng ở | Ghi chú |
|-------|--------|---------|
| `btn-small` | JournalPage hàng action, ChecklistSettingsModal | Không có variant nhỏ cho btn-primary/warning/info |
| `btn-warning` | JournalPage "Đóng lệnh" button | Bootstrap-style, chưa define |
| `btn-info` | JournalPage "Review" button | Bootstrap-style, chưa define |
| `btn-success` | ChecklistSettingsModal "Bật" button | Bootstrap-style, chưa define |
| `btn-ghost` | Tất cả close buttons | Chỉ có `.btn-icon` (square) |

### 2b. Status badges

| Class | Dùng ở |
|-------|--------|
| `status-badge` (base) | JournalPage `statusBadge()` helper |
| `badge-planned` | Status = planned |
| `badge-open` | Status = open |
| `badge-closed` | Status = closed |
| `badge-reviewed` | Status = reviewed |

So sánh: `.jira-status-badge` có trong CSS (line 3071) nhưng journal không tái sử dụng.

### 2c. Metrics bar

| Class | Dùng ở |
|-------|--------|
| `journal-metrics-bar` | `<MetricsBar>` container |
| `metric-item` | Mỗi metric item |
| `metric-label` | Label text |
| `metric-value` | Value text |

### 2d. Table

| Class | Dùng ở | Class hiện có |
|-------|--------|---------------|
| `table-container` | JournalPage table wrapper | `.portfolio-table-container`, `.watchlist-table-container` (riêng biệt) |
| `data-table` | `<table class="data-table">` | Không có generic `.data-table` |
| `action-buttons` | Action cell wrapper | Không có |

### 2e. Color/text utilities

| Class | Dùng ở |
|-------|--------|
| `text-positive` | P&L %, R-multiple màu xanh |
| `text-negative` | P&L %, R-multiple màu đỏ |

Note: CSS có `stat-positive`/`stat-negative` (Dashboard), `text-muted` (line 3863). Journal dùng tên khác.

### 2f. Form layout

| Class | Dùng ở |
|-------|--------|
| `form-section-title` | Section headers trong NewEntryModal (`<h4>`) |
| `checklist-section` | Checklist area trong NewEntryModal |
| `checklist-item` | Mỗi checkbox row |

### 2g. Journal-specific components

| Class | Dùng ở | Mô tả |
|-------|--------|-------|
| `prefill-banner` | NewEntryModal | Market snapshot banner |
| `entry-summary` | CloseTradeModal | Planned entry/target/stoploss display |
| `pnl-preview` | CloseTradeModal | Live P&L preview box |
| `review-summary` | ReviewModal | P&L + R display above form |
| `review-pnl` | ReviewModal | P&L colored text |
| `review-r` | ReviewModal | R-multiple colored text |
| `star-rating` | ReviewModal | Star rating container |
| `star` | ReviewModal | Individual star button |
| `star-filled` | ReviewModal | Active star |
| `modal-form` | CloseTradeModal, ReviewModal | Form padding inside modal |

### 2h. ChecklistSettingsModal

| Class | Dùng ở |
|-------|--------|
| `checklist-settings-list` | `<ul>` list của rules |
| `checklist-rule-item` | `<li>` mỗi rule |
| `rule-order` | Số thứ tự |
| `rule-label` | Label text |
| `rule-key` | Key display `[key_name]` |
| `rule-actions` | Toggle/Delete buttons container |
| `add-rule-form` | Form thêm rule mới |

---

## 3. Bức tranh tổng thể

```
styles-preact.css
┌─────────────────────────────────────────────────────────────┐
│ DEFINED & REUSED CORRECTLY                                  │
│  ✅ .modal-overlay      ✅ .page-container                  │
│  ✅ .modal-content      ✅ .page-header                     │
│  ✅ .modal-header       ✅ .header-actions                  │
│  ✅ .modal-body         ✅ .btn-primary / .btn-secondary     │
│  ✅ .modal-footer       ✅ .btn-danger / .btn-icon           │
│  ✅ .input-field        ✅ .form-group / .form-row           │
│  ✅ .empty-state        ✅ .loading-state                    │
│  ✅ .alert / .alert-info ✅ .text-muted                     │
│  ✅ .required                                               │
└─────────────────────────────────────────────────────────────┘

Journal components
┌─────────────────────────────────────────────────────────────┐
│ ❌ WRONG CLASS NAME (design system có nhưng dùng sai tên)   │
│  .modal-card        → nên là .modal-content                 │
│  .form-input        → nên là .input-field                   │
│  .modal-actions     → nên là .modal-footer                  │
│  .btn-close         → nên là .modal-close                   │
│                                                             │
│ ❌ MISSING - chưa có trong CSS, cần thêm mới                │
│  Status: .status-badge, .badge-planned/open/closed/reviewed │
│  Buttons: .btn-small, .btn-warning, .btn-info,              │
│           .btn-success, .btn-ghost                          │
│  Colors: .text-positive, .text-negative                     │
│  Table: .table-container, .data-table, .action-buttons      │
│  Metrics: .journal-metrics-bar, .metric-item/label/value    │
│  Form: .form-section-title, .checklist-section,             │
│        .checklist-item, .modal-form                         │
│  Page: .page-subtitle, .header-content                      │
│  Journal UX: .prefill-banner, .entry-summary,               │
│              .pnl-preview, .review-summary,                 │
│              .review-pnl, .review-r                         │
│  Stars: .star-rating, .star, .star-filled                   │
│  Checklist: .checklist-settings-list,                       │
│             .checklist-rule-item, .rule-order/label/key,    │
│             .rule-actions, .add-rule-form                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 4. Impact & prioritization

### P0 — Render hoàn toàn không đúng (modal không có khung)
- `modal-card` → không styling → modal hiện raw HTML (đây là bug trong ảnh chụp)
- `form-input` → inputs không có border/padding
- `modal-actions` → nút Lưu/Hủy không aligned

### P1 — Functional nhưng ugly
- `btn-small`, `btn-warning`, `btn-info`, `btn-ghost` → buttons hiện full-size hoặc unstyled
- `status-badge` + variants → trạng thái hiện raw text
- `text-positive` / `text-negative` → P&L không màu xanh/đỏ
- `data-table` → table không có border, spacing

### P2 — Missing context/polish
- `journal-metrics-bar` → metrics bar không có layout
- `prefill-banner` → market snapshot không nổi bật
- `pnl-preview` → live P&L không có visual container
- `star-rating` → star input không clickable style

### P3 — Page structure
- `page-subtitle` → subtitle không styled
- `header-content` → không gây lỗi nhưng không wrap đúng

---

## 5. Hai hướng fix

### Hướng A — Rename class trong JSX (smaller diff, reuse CSS)
Sửa journal components để dùng class names đã có trong design system:

```
JSX hiện tại          →  Đổi thành
──────────────────────────────────────────
modal-card            →  modal-content
modal-card modal-large →  modal-content modal-large
form-input            →  input-field
modal-actions         →  modal-footer
btn-close             →  modal-close
```

Còn lại (journal-specific) vẫn cần thêm CSS mới: status badges, btn-small variants, metrics bar, colors, table, star rating.

**Pro**: Ít CSS mới hơn, consistent với Watchlist/Assets  
**Con**: JSX changes across 4+ files

### Hướng B — Thêm CSS journal section vào styles-preact.css
Giữ nguyên JSX, thêm ~150 dòng CSS riêng cho journal:

```css
/* JOURNAL UI */
.modal-card { /* alias cho modal-content */ }
.form-input { /* alias cho input-field */ }
.modal-actions { /* alias cho modal-footer */ }
.btn-small { padding: 4px 10px; font-size: 12px; ... }
.btn-warning { background: #f59e0b; ... }
/* ... etc */
```

**Pro**: Không đụng JSX  
**Con**: CSS bloat, 2 class names cho cùng 1 thing

### Khuyến nghị
**Hướng A + extend** — Fix class names sai trước (modal-card, form-input, modal-actions, btn-close), sau đó thêm CSS mới cho các class thực sự journal-specific (badges, metrics, star rating, pnl-preview). Ít nhất là P0 bugs được fix mà không cần thêm CSS alias.

---

## 6. Files cần thay đổi

### Nếu theo Hướng A
```
src/ui-preact/pages/JournalPage.jsx              — modal-card → modal-content, alert-danger
src/ui-preact/pages/journal/NewEntryModal.jsx     — modal-card, form-input, modal-actions, btn-close
src/ui-preact/pages/journal/CloseTradeModal.jsx   — modal-card, form-input, modal-actions, btn-close
src/ui-preact/pages/journal/ReviewModal.jsx       — modal-card, form-input, modal-actions, btn-close, star-rating
src/ui-preact/pages/journal/ChecklistSettingsModal.jsx — modal-card, form-input, modal-actions, btn-close
src/extension/styles-preact.css                   — thêm journal-specific section (~150 lines)
```

---

## 7. Open questions

1. **Có muốn journal dùng chung styling 100% với Watchlist/Assets không?** Hay journal có UX riêng (dark metrics bar, compact table) nên cần CSS riêng?
2. **`alert-danger` vs `alert-error`**: CSS có `.alert-error` (line 3476), journal dùng `.alert-danger`. Fix hay alias?
3. **`btn-ghost`**: Hiện chỉ có `.btn-icon` (32px square). Journal cần ghost button dạng text với hover — thêm mới hay dùng `btn-secondary`?
4. **Table**: Portfolio dùng `.portfolio-table-container`, Watchlist dùng `.watchlist-table-container`. Journal nên có riêng `.journal-table-container` hay cần generic `.table-container`?
5. **`page-subtitle`**: Chỉ Journal có subtitle. Thêm vào shared hay xóa?
