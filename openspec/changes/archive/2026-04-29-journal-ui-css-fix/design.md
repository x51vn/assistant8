## Context

Trading Journal MVP (`trading-journal-mvp`) implement 5 UI files mới (JournalPage + 4 modals). Các file này được viết với convention CSS class khác với design system đang dùng trong toàn bộ extension (`styles-preact.css`). Nguyên nhân: implementation dùng tên class "intuitive" (bootstrap-style: `modal-card`, `form-input`, `btn-warning`) thay vì đọc CSS hiện có trước khi code.

**Current state:**
```
styles-preact.css      Journal JSX uses      Gap
─────────────────      ─────────────────      ───
.modal-content    ←→   .modal-card           MISMATCH
.input-field      ←→   .form-input           MISMATCH  
.modal-footer     ←→   .modal-actions        MISMATCH
.modal-close      ←→   .btn-ghost .btn-close MISMATCH
.alert-error      ←→   .alert-danger         MISMATCH
(undefined)       ←←   .status-badge/*       MISSING
(undefined)       ←←   .btn-small/*variants  MISSING
(undefined)       ←←   .text-positive/neg    MISSING
(undefined)       ←←   .data-table           MISSING
(undefined)       ←←   .journal-metrics-bar  MISSING
(undefined)       ←←   .pnl-preview          MISSING
(undefined)       ←←   .star-rating/.star    MISSING
(undefined)       ←←   (+ 20 more classes)   MISSING
```

## Goals / Non-Goals

**Goals:**
- Fix P0: modals có khung/styling đúng (rename `modal-card` → `modal-content` etc.)
- Fix P1: buttons, badges, table có style đúng
- Fix P2: metrics bar, pnl-preview, star-rating có layout rõ ràng
- Thêm CSS journal-specific section vào `styles-preact.css`
- Consistent với design system hiện tại (Watchlist, Assets, Portfolio pages)

**Non-Goals:**
- Không redesign UX/layout — chỉ fix missing styles
- Không thay đổi logic, handlers, hay data model
- Không responsive design (extension side panel có width cố định ~400px)
- Không thêm animation hay dark-mode riêng cho journal (dùng chung CSS variables)

## Decisions

### D1: Hướng A — Rename JSX class + thêm CSS mới (không alias)

**Decision**: Sửa class names sai trong JSX để match design system, rồi thêm CSS mới chỉ cho journal-specific classes thực sự.

**Rationale**: 
- Alias classes (B) tạo tech debt: 2 tên cho cùng 1 concept, confusing cho developer tiếp theo
- JSX changes đơn giản (find-replace per file), low risk
- Reusing `.modal-content`, `.input-field`, `.modal-footer` đảm bảo journal trông giống hệt Watchlist modals — ít visual inconsistency hơn

**Alternatives considered**:
- B: Thêm CSS alias (`.modal-card { ... }` là copy của `.modal-content`) — Rejected: bloat, confusing
- C: CSS Modules / scoped styles — Overkill, toàn extension dùng global CSS, không nên introduce pattern mới chỉ cho journal

### D2: CSS section placement

**Decision**: Thêm journal CSS section ở cuối `styles-preact.css` với comment block rõ ràng.

**Rationale**: CSS cascade — journal classes có specificity thấp (single class), đặt cuối đảm bảo không bị override bởi shared rules. Dễ tìm và dễ xóa sau nếu refactor.

### D3: Tên CSS variables — dùng chung design tokens

**Decision**: Tất cả màu trong journal CSS dùng `var(--primary-color)`, `var(--surface-border)`, `var(--heading-text)` v.v. — không hardcode hex.

**Rationale**: Extension hỗ trợ light/dark theme qua CSS variables trong `themes.css`. Hardcode màu sẽ break dark mode.

### D4: `btn-small` là modifier, không phải standalone

**Decision**: `.btn-small` chỉ định override padding/font-size, dùng kết hợp với `.btn-primary`, `.btn-warning` etc.

```css
.btn-small {
  padding: 4px 10px;
  font-size: 12px;
  gap: 4px;
}
```

**Rationale**: Consistent với `.btn-danger-small` pattern đã có trong CSS (line 394). Button semantic (color, hover) thuộc về variant class, size là orthogonal.

### D5: `text-positive` / `text-negative` là global utilities

**Decision**: Đặt vào shared section (không phải journal section) vì hữu ích ở nhiều nơi (Portfolio, Dashboard đang dùng `stat-positive`/`stat-negative` — sẽ không rename, chỉ thêm aliases).

**Rationale**: Dashboard dùng `stat-positive` cho statistic cards. Journal dùng `text-positive` cho inline text. Có thể cần cả 2. Thêm `text-positive`/`text-negative` là safer.

### D6: `alert-danger` → không rename, add alias

**Decision**: Thêm `.alert-danger` là alias cho `.alert-error` (copy styles). Không rename JSX.

**Rationale**: Bootstrap users (và AI-generated code) đều viết `alert-danger`. Có cả alias sẽ tránh lỗi tương lai. Cost thấp (~3 dòng CSS).

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| JSX rename có thể miss một occurrence | Dùng grep để verify sau khi thay đổi |
| CSS section dài làm file styles-preact.css lớn hơn | Chấp nhận: file đã >4500 dòng, thêm ~200 dòng không significant |
| `btn-warning`/`btn-info`/`btn-success` introduce Bootstrap color convention | Chỉ dùng trong journal context, document rõ trong comment |
| Vite bundle — CSS changes không pick up | Chạy `npm run build` verify sau khi thay đổi |

## Migration Plan

1. Thêm CSS journal section vào `styles-preact.css` (không break gì)
2. Rename JSX classes file by file, verify build sau mỗi file
3. Build lần cuối, visual check trong Chrome extension
4. Không cần rollback strategy — pure additive CSS + non-breaking JSX rename

## Open Questions

*(none — report đã phân tích đủ để implement)*
