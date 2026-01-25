---
applyTo: "src/extension/manifest.json"
---

# Manifest.json rules (MV3)
- `manifest_version` phải là 3.
- Giữ permissions tối thiểu và có lý do:
  - Ưu tiên `host_permissions` hẹp thay vì wildcard rộng.
  - Dùng optional permissions nếu phù hợp.
- Nếu thêm permissions/host_permissions, phải ghi chú ngắn trong `docs/` (tại sao cần, dữ liệu nào được truy cập).
- Versioning:
  - `version` phải là 1–4 số, ngăn cách bằng dấu chấm (yêu cầu Chrome).
  - Nếu cần nhãn build thân thiện (vd `yyyymmdd.HHMM`) thì dùng `version_name`.
- CSP: không nới lỏng CSP của extension pages; không thêm remote script sources.

Output requirement:
- When proposing manifest changes, list exactly which keys change and why.
