DONE

# GPT-011 UI Categories management page

## Project Context (MUST READ)
UI side panel chỉ gọi background middleware. Categories UI không dùng chrome.storage.local cho data.

## Timebox
2–4 giờ.

## Goal
Tạo trang UI quản lý categories (list/add/edit/delete).

## Inputs
- UI framework hiện có: src/ui/* (navigation/pages/dom helpers)
- MESSAGE_TYPES categories

## Requirements
1. Thêm tab/page “Categories” hoặc integrate vào section prompts.
2. UI operations:
   - load list on open
   - add new category (name + optional color/icon)
   - edit category
   - delete category (confirm)
3. Error display VN; disable buttons during request.

## SOLID Notes
- SRP: module UI categories riêng.
- DIP: UI dùng wrapper sendMessage function, không gọi DB.

## Acceptance Criteria
- CRUD thao tác được và UI refresh đúng.

## DoD
- Không còn local storage business data keys cho categories.

## Test Plan
- Playwright: add/edit/delete category.

## Dependencies
- GPT-010

## Risks
- UI hiện có navigation phức; cần minimal changes.
