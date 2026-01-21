---
applyTo: "**/*content-script*.{js,ts}"
---

# Content scripts rules
- Keep content scripts minimal: DOM interaction only; do not embed business logic that belongs in SW or shared modules.
- Do not access sensitive page content unless explicitly required by the feature.
- Communication must go through messaging APIs and clearly defined message types.
- If host permissions are broad, propose narrowing them or switching to more specific match patterns.

Output requirement:
- For any content script change, include:
  - Which pages match and why
  - What DOM elements/events are read/modified
  - Security/privacy considerations
  - Verification steps on at least 2 representative pages
