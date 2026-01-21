---
applyTo: "**/*.{js,ts,json}"
---

# Network modification rules (public extensions)
- If blocking/modifying requests is required:
  - Prefer `declarativeNetRequest` rules.
  - Avoid blocking `webRequest` listeners unless this is an enterprise-only deployment with a justified exception.
- Rules must be explicit, minimal, and documented (docs/).

Output requirement:
- Provide:
  - DNR rule intent (block/redirect/modifyHeaders)
  - URL filters/resourceTypes
  - Safety constraints and test plan
