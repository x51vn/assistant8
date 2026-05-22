## Why

Người dùng hiện có đầy đủ dữ liệu để ra quyết định đầu tư (watchlist với entry/target/stoploss/thesis, market assessment với regime/score/action, price alerts) nhưng không có nơi để **ghi lại quyết định đó, kiểm tra rule tuân thủ, và nhìn lại kết quả**. App đang dừng ở "data viewer" — chưa đóng được vòng lặp phản hồi từ signal đến hành động đến bài học.

## What Changes

- **Thêm** bảng `trade_journal` để lưu journal entries với snapshot dữ liệu tại thời điểm quyết định
- **Thêm** bảng `checklist_templates` để user tuỳ chỉnh danh sách rule kiểm tra trước khi vào lệnh
- **Thêm** background handler CRUD cho journal entries
- **Thêm** JournalPage trong side panel navigation
- **Thêm** "Create Journal Entry" action trên Watchlist item — pre-fill tự động từ watchlist + market assessment mới nhất
- **Thêm** Journal metrics summary (win rate, avg R-multiple, rule adherence %)
- **Thêm** Status machine cho entries: `planned → open → closed → reviewed`

## Capabilities

### New Capabilities

- `trade-journal-crud`: Tạo, đọc, cập nhật, xoá journal entries; lưu snapshot thesis/regime/score tại thời điểm entry; trạng thái từ planned đến reviewed
- `checklist-templates`: Quản lý danh sách rule per user (default + tuỳ chỉnh); checklist được nhúng vào journal entry dưới dạng JSONB
- `journal-metrics`: Tổng hợp thống kê từ closed/reviewed entries — win rate, avg R-multiple, rule adherence %, top repeated errors
- `watchlist-to-journal`: Pre-fill journal entry từ watchlist item (entry/target/stoploss/thesis) và market_assessment mới nhất (regime/score/action)

### Modified Capabilities

<!-- Không có spec hiện tại nào bị thay đổi yêu cầu — các tính năng hiện tại (watchlist, market assessment, portfolio) chỉ được đọc/link, không thay đổi hành vi. -->

## Impact

- **Database**: 2 migration files mới (`trade_journal`, `checklist_templates`); RLS policy per user_id
- **Background handlers**: File mới `src/background/handlers/journal.js` với handlers CRUD và metrics
- **Message schema**: `src/shared/messageSchema.js` — thêm `JOURNAL_*` message types
- **UI**: Trang mới `src/ui-preact/pages/JournalPage.jsx`; navigation config thêm `journal` entry; Watchlist item thêm "Journal Entry" button
- **API layer**: File mới `src/ui-preact/api/journalApi.js`
- **State**: File mới `src/ui-preact/state/journalState.js`
- **Không breaking**: Không thay đổi schema watchlist, portfolio, market_assessment
