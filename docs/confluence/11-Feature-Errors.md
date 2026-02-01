# Feature: Error Tracking (Retrospective)

## 1) Mục tiêu

- Lưu lại lỗi/sai lầm/retrospective notes theo thời gian.
- CRUD đầy đủ: add/edit/delete, filter resolved.
- Phục vụ phân tích retrospective (placeholder/future).

## 2) Data model

Supabase table: `public.errors` (migration 001 + 007)

- `title`, `description`
- `type`: `general|prompt|response|connection|timeout`
- `severity`: `low|medium|high|critical`
- `timestamp` (ms)
- `resolved`, `resolved_at`, `resolution_notes`
- `details` (JSONB, optional)

## 3) Background handler

File: `src/background/handlers/errorTracking.js`

- `ERROR_GET_ALL` → `ERROR_LIST`
  - filter theo `resolved` nếu có

- `ERROR_ADD` → `ERROR_ADDED`
  - validate title
  - default severity/type nếu không truyền

- `ERROR_UPDATE` → `ERROR_UPDATED`
  - update fields (title/description/type/severity/resolved/details)
  - nếu `resolved=true` set `resolved_at`

- `ERROR_DELETE` → `ERROR_DELETED`

## 4) UI

File: `src/ui-preact/pages/ErrorsPage.jsx`

- Modal Add/Edit với dropdown type/severity.
- Severity labels: low/medium/high/critical.
- List hiển thị severity class để CSS style.

## 5) Retrospective prompts

Project có template prompt retrospective tại:
- `src/prompts/retrospective.md`

Template “evaluation wrapper” tại:
- `src/prompts/evaluation.md`

Các templates này dùng để:
- Tổng hợp “điều cần phát huy” và “sai lầm cần tránh” dựa trên history/errors.
