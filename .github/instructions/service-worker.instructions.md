---
applyTo: "**/*service-worker*.{js,ts}"
---

# Service worker (MV3 background) rules
- Service worker is event-driven and can be terminated; never assume long-lived memory state.
- Persist important state in `chrome.storage` (prefer local for larger data; sync only for small config).
- Handle async messaging carefully:
  - All messages must be JSON-serializable.
  - Always handle timeouts/errors and return explicit responses.
- Prefer minimal permissions and avoid privileged APIs unless required.

Output requirement:
- For any SW change, include:
  - Events listened to and why
  - Storage keys added/changed
  - Message contract (request/response schema)
  - Verification steps
