## Context

Extension hiện có ba nguồn dữ liệu giàu liên quan đến quyết định đầu tư:
- **Watchlist**: entry, target, stoploss, investment_thesis, pprofit, ediff — kế hoạch trước lệnh
- **Market Assessment**: regime state/score, sector score/trend, symbol action (BUY/HOLD/SELL/WATCH) — context thị trường
- **Portfolio**: avg_price, quantity, current_price — vị thế thực tế đang nắm

Ba nguồn này hoàn toàn **độc lập**, không có FK chéo. Không có layer nào ghi lại "quyết định" — thời điểm trader chuyển từ "đang theo dõi" sang "đã vào lệnh", bao gồm lý do, checklist tuân thủ, và kết quả. Toàn bộ vòng lặp phản hồi (plan → act → review) bị thiếu.

**Constraints:**
- MV3 Service Worker: stateless, không dùng in-memory state, tất cả data qua Supabase
- Message pattern: UI → background handler → Supabase; response fields spread trực tiếp (không nested trong `.data`)
- Preact UI với signals state management
- Tất cả dữ liệu user có `user_id` + RLS policy

## Goals / Non-Goals

**Goals:**
- Lưu journal entry với snapshot dữ liệu tại thời điểm quyết định (không bị overwrite khi watchlist thay đổi)
- Pre-fill journal từ watchlist + market assessment mới nhất trong một flow liền mạch
- Rule checklist configurable per user, embedded trong journal entry dưới dạng JSONB
- Status machine rõ ràng: `planned → open → closed → reviewed`
- Metrics cơ bản: win rate, avg R-multiple, rule adherence %
- Toàn bộ data trong Supabase, tuân thủ RLS

**Non-Goals:**
- Import CSV giao dịch từ broker (deferred)
- Đồng bộ tự động với portfolio khi mua (manual link only trong MVP)
- AI Weekly Review (Phase 3 — sau MVP)
- Position sizing calculator (Phase 2 — sau MVP)
- Decision Card mở rộng trong Watchlist (Phase 2)
- Không thay đổi schema watchlist, portfolio, market_assessment

## Decisions

### D1: Snapshot fields thay vì FK-only references

**Quyết định:** Journal entry sẽ lưu snapshot của thesis, regime, score tại thời điểm tạo entry (các trường `thesis_snapshot`, `market_regime_snapshot`, `market_score_snapshot`) thay vì chỉ lưu FK đến watchlist và market_assessment.

**Lý do:** Watchlist và market assessment thay đổi liên tục — nếu chỉ link qua FK, nhìn lại sau 3 tháng sẽ không biết context lúc đó là gì. Snapshot đảm bảo tính bất biến của "quyết định lịch sử".

**Alternatives considered:** FK only → data không đủ khi review sau; JSONB lưu toàn bộ snapshot → quá heavy, khó query metrics.

---

### D2: Checklist dưới dạng JSONB trong journal entry, template riêng

**Quyết định:** `checklist` field trong `trade_journal` là JSONB `{ rule_key: boolean }`. `checklist_templates` table lưu danh sách rule definitions. Khi tạo entry mới, UI load template → render checklist → user tick → lưu JSONB snapshot vào entry.

**Lý do:** JSONB cho phép flexible (user có thể thêm rule tương lai, old entries vẫn valid). Template riêng cho phép user quản lý rule mà không ảnh hưởng entries đã lưu.

**Alternatives considered:** Hardcode checklist trong code → không flexible; Separate `journal_checklist_items` table per entry → quá phức tạp cho MVP.

---

### D3: watchlist_id là nullable FK

**Quyết định:** `trade_journal.watchlist_id UUID NULLABLE REFERENCES watchlist(id) ON DELETE SET NULL`.

**Lý do:** Không phải trade nào cũng đến từ watchlist (user có thể vào lệnh mà không plan trước). Khi watchlist item bị xoá, journal entry không bị mất — `ON DELETE SET NULL` giữ entry nhưng mất link.

---

### D4: Tính R-multiple và pnl_pct trong handler, không dùng DB trigger

**Quyết định:** Khi `status` chuyển sang `closed` và `exit_price` được cập nhật, handler tính `realized_pnl`, `pnl_pct`, `r_multiple` và lưu vào DB.

**Lý do:** Logic tính toán đơn giản, không cần trigger phức tạp. Handler dễ test hơn DB function.

**Formula:**
```
realized_pnl = (exit_price - actual_entry) × actual_qty
pnl_pct      = (exit_price - actual_entry) / actual_entry
r_multiple   = (exit_price - actual_entry) / (actual_entry - planned_stoploss)
```

---

### D5: Metrics tính từ application layer (handler), không dùng DB views

**Quyết định:** `JOURNAL_GET_METRICS` handler query tất cả `closed`/`reviewed` entries của user, tính aggregates trong JavaScript.

**Lý do:** Số lượng entries per user không đủ lớn để cần DB aggregation. Linh hoạt hơn khi thêm metric mới.

---

### D6: Pre-fill lấy market_assessment mới nhất theo symbol

**Quyết định:** Khi user nhấn "Create Journal Entry" từ Watchlist item, UI gọi `JOURNAL_GET_PREFILL` handler, truyền `symbol`. Handler query `market_assessment` WHERE `symbol = ?` ORDER BY `created_at DESC` LIMIT 1.

**Lý do:** Không có FK từ watchlist → market_assessment. Lấy "latest by symbol" là heuristic đúng nhất.

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| market_assessment không có record cho symbol → prefill thiếu regime data | Handler trả về `regimePrefill: null`; UI hiển thị "Không có data thị trường gần đây" và cho phép nhập manual |
| `ON DELETE SET NULL` trên watchlist_id → khi xem lại entry không biết origin từ watchlist nào | Snapshot thesis/entry/target/stoploss đủ để tái hiện context; symbol text là fallback identifier |
| R-multiple chia cho 0 khi `actual_entry === planned_stoploss` | Handler kiểm tra và trả về `null` thay vì Infinity |
| Metrics query trên tập entries lớn | MVP không cần optimize; nếu > 1000 entries trong tương lai có thể add DB index trên `(user_id, status)` |
| Legal: hiển thị BUY/SELL signal trong Decision Card (Phase 2) | Journal MVP không render signal — chỉ hiển thị `market_regime_snapshot` và `market_score_snapshot` đã được lưu sẵn. Disclaimer được thêm ở Phase 2. |

## Migration Plan

1. **Deploy DB migration**: Chạy `023_create_trade_journal_tables.sql` trên Supabase (additive only, không breaking)
2. **Deploy extension update**: Build + load unpacked extension
3. **Rollback**: Không cần — migration chỉ thêm bảng mới; nếu revert extension, bảng không ảnh hưởng user

## Open Questions

1. **Multi-portfolio**: `portfolios` table (migration 017) đã có. Journal entry có cần `portfolio_id` FK để chỉ rõ thuộc portfolio nào không? Để đơn giản, MVP bỏ qua — journal là per-user, không per-portfolio.

2. **Account size cho R-calculation**: R-multiple cần planned_stoploss, nhưng metrics như "risk % tài khoản" cần account size. MVP: user nhập `account_size_snapshot` khi tạo entry (optional field). Không auto-link từ assets.
