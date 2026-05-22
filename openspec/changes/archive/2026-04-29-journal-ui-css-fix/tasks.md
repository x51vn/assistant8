## 1. CSS — Fix class aliases (shared utilities)

- [x] 1.1 Thêm `.alert-danger` alias cho `.alert-error` vào `styles-preact.css` (shared alerts section)
- [x] 1.2 Thêm `.text-positive` và `.text-negative` utility classes vào `styles-preact.css` (shared utilities)
- [x] 1.3 Thêm `.page-subtitle` class vào `styles-preact.css` (shared page header section)
- [x] 1.4 Thêm `.header-content` wrapper class vào `styles-preact.css`
- [x] 1.5 Thêm `.form-section-title` class cho section headers trong forms

## 2. CSS — Buttons (journal-specific variants)

- [x] 2.1 Thêm `.btn-small` size modifier vào `styles-preact.css` (journal section)
- [x] 2.2 Thêm `.btn-warning` (amber) variant
- [x] 2.3 Thêm `.btn-info` (teal) variant
- [x] 2.4 Thêm `.btn-success` (green) variant
- [x] 2.5 Thêm `.btn-ghost` (text-only, hover background) variant

## 3. CSS — Status badges

- [x] 3.1 Thêm `.status-badge` base class (inline-block, border-radius, padding, font-size)
- [x] 3.2 Thêm `.badge-planned` (grey background/text)
- [x] 3.3 Thêm `.badge-open` (blue background/text)
- [x] 3.4 Thêm `.badge-closed` (default green, đổi qua P&L class ở component level)
- [x] 3.5 Thêm `.badge-reviewed` (purple background/text)

## 4. CSS — Table

- [x] 4.1 Thêm `.table-container` generic wrapper (overflow-x: auto, border-radius)
- [x] 4.2 Thêm `.data-table` styles (border-collapse, th/td padding, row hover, header bg)
- [x] 4.3 Thêm `.action-buttons` row-actions wrapper (display: flex, gap, align-items: center)

## 5. CSS — Metrics bar

- [x] 5.1 Thêm `.journal-metrics-bar` container (display: flex, gap, padding, border-bottom)
- [x] 5.2 Thêm `.metric-item` card (flex: 1, text-align: center, padding)
- [x] 5.3 Thêm `.metric-label` (font-size small, muted color)
- [x] 5.4 Thêm `.metric-value` (font-size larger, font-weight bold)

## 6. CSS — Modal form components

- [x] 6.1 Thêm `.modal-form` (padding, display flex-col, gap — cho form bên trong modal-body)
- [x] 6.2 Thêm `.modal-card` alias cho `.modal-content` (3 dòng, max-width: 480px default)
- [x] 6.3 Thêm `.form-input` alias cho `.input-field` (re-use existing styles)
- [x] 6.4 Thêm `.modal-actions` alias cho `.modal-footer` styles
- [x] 6.5 Thêm `.btn-close` và `.btn-ghost` styles cho modal close button

## 7. CSS — Journal UX components

- [x] 7.1 Thêm `.prefill-banner` (info-tinted bg, padding, border-left, border-radius)
- [x] 7.2 Thêm `.entry-summary` (flex row, gap, muted font, padding-bottom)
- [x] 7.3 Thêm `.pnl-preview` base + `.positive` và `.negative` modifier (tinted bg, padding, border-radius, font-weight bold)
- [x] 7.4 Thêm `.review-summary` (flex row, gap, margin-bottom)
- [x] 7.5 Thêm `.review-pnl` và `.review-r` (font-size larger, color via `.positive`/`.negative`)

## 8. CSS — Star rating

- [x] 8.1 Thêm `.star-rating` container (display: flex, gap)
- [x] 8.2 Thêm `.star` button reset (background: none, border: none, cursor: pointer, font-size large, color grey)
- [x] 8.3 Thêm `.star.star-filled` (color: gold/amber)

## 9. CSS — Checklist settings

- [x] 9.1 Thêm `.checklist-settings-list` (list-style: none, padding: 0, display: flex-col, gap)
- [x] 9.2 Thêm `.checklist-rule-item` (display: flex, align-items: center, gap, padding, border-bottom)
- [x] 9.3 Thêm `.rule-order` (min-width, text-align: center, muted)
- [x] 9.4 Thêm `.rule-label` (flex: 1, font-weight: 500)
- [x] 9.5 Thêm `.rule-key` (font-size small, muted, font-family: monospace)
- [x] 9.6 Thêm `.rule-actions` (display: flex, gap, margin-left: auto)
- [x] 9.7 Thêm `.add-rule-form` (margin-top, padding-top, border-top)

## 10. CSS — Checklist in NewEntryModal

- [x] 10.1 Thêm `.checklist-section` (margin-top)
- [x] 10.2 Thêm `.checklist-item` label (display: flex, align-items: center, gap, cursor: pointer, padding: 4px 0)

## 11. Build & Verify

- [x] 11.1 Chạy `npm run build` — verify no CSS errors
- [x] 11.2 Visual check: Mở Journal page trong extension, verify table, metrics bar, và badges đúng style
- [x] 11.3 Visual check: Mở NewEntryModal — verify form inputs, checklist, prefill-banner
- [x] 11.4 Visual check: Mở CloseTradeModal — verify entry-summary, pnl-preview
- [x] 11.5 Visual check: Mở ReviewModal — verify star-rating interactive, review-summary
- [x] 11.6 Visual check: Mở ChecklistSettingsModal — verify list, add-rule-form
