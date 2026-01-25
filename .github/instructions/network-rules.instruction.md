---
applyTo: "**/*.{js,ts,json}"
---

# Network modification rules (public extensions)
# Network modification rules (public extensions)
- Nếu cần chặn/sửa request:
  - Ưu tiên `declarativeNetRequest`.
  - Tránh `webRequest` blocking listeners (trừ khi có lý do đặc biệt cho enterprise-only).
- Rules phải rõ ràng, tối thiểu, và có docs trong `docs/`.

Output requirement:
- Provide:
  - DNR rule intent (block/redirect/modifyHeaders)
  - URL filters/resourceTypes
  - Safety constraints and test plan
