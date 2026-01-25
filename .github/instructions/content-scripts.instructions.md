---
applyTo: "src/content.{js,ts}"
---

# Content scripts rules
- Giữ content script tối giản: chỉ DOM automation; business logic để ở background/shared.
- Không đọc nội dung nhạy cảm từ trang nếu không cần thiết.
- Giao tiếp phải qua messaging API + message types rõ ràng (xem `src/shared/messageSchema.js`).
- Selector ChatGPT dễ vỡ: luôn có nhiều fallback + kiểm tra tồn tại trước khi thao tác.

Output requirement:
- For any content script change, include:
  - Which pages match and why
  - What DOM elements/events are read/modified
  - Security/privacy considerations
  - Verification steps on at least 2 representative pages
