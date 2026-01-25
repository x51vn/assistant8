---
applyTo: "**/*"
---

# GitHub Copilot — Nguyên tắc kỹ thuật (toàn repo)

## 1) Vị trí đặt docs (Markdown)
- Khi tạo file Markdown MỚI, luôn đặt trong `docs/`.
- Không tạo Markdown mới ở repo root.
- Nếu user không chỉ rõ path, mặc định `docs/<topic>/<name>.md`.

## 2) Ưu tiên tái sử dụng
- Không tạo file/function/class mới nếu đã có cái tương tự.
- Trước khi thêm mới: search codebase và ưu tiên: (1) reuse, (2) extend, (3) refactor tối thiểu.
- Nếu vẫn cần tạo mới, phải nêu lý do và chỉ ra artifact gần nhất.

## 3) Nguyên tắc code
- SOLID / DRY / KISS.
- Tránh abstraction không cần thiết; ưu tiên rõ ràng, dễ test.

## 4) Trình bày có cấu trúc (khi task không trivial)
- Nêu rõ goal/constraints.
- Đề xuất 2–3 option + trade-offs.
- Chọn 1 option best-fit cho repo + lý do.
- Plan thay đổi (smallest safe diff) + plan kiểm chứng (build/test).

## 5) Ưu tiên maintainability
- Ưu tiên dễ đọc, dễ bảo trì, dễ mở rộng.
- Thay đổi nhỏ, dễ rollback; tránh refactor lớn nếu không được yêu cầu.
- Nếu đổi hành vi, cập nhật/thêm test khi hợp lý.

## Data integrity
- Không bịa nội dung file/API/metrics/dependencies.
- Chỉ hỏi khi thật sự bị block.
