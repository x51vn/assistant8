---
applyTo: "src/background/**/*.{js,ts}"
---

# Service worker (MV3 background) rules
- Service worker là event-driven và có thể bị terminate → không dựa vào state in-memory.
- Tất cả listeners phải đăng ký **đồng bộ tại top-level** (xem `src/background/index.js`).
- Tránh `import()` (dynamic import) trong background (rủi ro Vite inject code không tương thích SW).
- Persist state quan trọng vào `chrome.storage.local` (dữ liệu lớn) / `chrome.storage.sync` (config nhỏ, nếu thật sự cần).
- Messaging bất đồng bộ:
  - Payload phải JSON-serializable.
  - Luôn handle timeout/error và trả response rõ ràng.

Output requirement:
- For any SW change, include:
  - Events listened to and why
  - Storage keys added/changed
  - Message contract (request/response schema)
  - Verification steps
