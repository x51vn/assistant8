---
applyTo: "**/manifest.json"
---

# Manifest.json rules (MV3)
- `manifest_version` must be 3.
- Keep permissions minimal and justified:
  - Prefer narrow `host_permissions` patterns over broad wildcards.
  - Use optional permissions when feasible.
- If adding permissions, also add a short justification in docs (under docs/) describing why it is needed and what data is accessed.
- Versioning:
  - `version` MUST be 1–4 dot-separated integers (Chrome requirement).
  - If you need a human-friendly build label (e.g., yyyymmdd.HHMM), put it in `version_name`, not `version`.
- CSP: do not weaken extension page CSP; do not add remote script sources.

Output requirement:
- When proposing manifest changes, list exactly which keys change and why.
