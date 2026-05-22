## 1. Naming Contract And Audit Baseline

- [x] 1.1 Create a canonical naming matrix (Assistant8 display name + assistant8 slug) for implementation references.
- [x] 1.2 Run a scoped audit to identify all ChatGPT Assistant/chatgpt-assistant occurrences in manifest, UI labels, package metadata, and docs.
- [x] 1.3 Classify matches into rename-now vs defer lists to avoid accidental protocol/schema key edits.

## 2. Extension Metadata Rename

- [x] 2.1 Update extension manifest name/short-name and related metadata fields to Assistant8.
- [x] 2.2 Update release/build metadata that exposes product identity in packaged artifacts.
- [x] 2.3 Verify extension loads with unchanged permissions, routing, and message flow after metadata updates.

## 3. UI Branding Rename

- [x] 3.1 Update side panel and settings/about user-facing product labels to Assistant8.
- [x] 3.2 Update shared UI text/constants where product identity is surfaced.
- [x] 3.3 Validate visual consistency across main user flows (portfolio, journal, stock research, settings).

## 4. Documentation And Distribution References

- [x] 4.1 Update primary docs and release-facing references from ChatGPT Assistant to Assistant8.
- [x] 4.2 Add transitional note where required (Assistant8, formerly ChatGPT Assistant) for rollout clarity.
- [x] 4.3 Ensure OpenSpec and project-level docs use the new canonical branding for future work.

## 5. Verification And Release Readiness

- [x] 5.1 Run grep-based regression audit to confirm no unintended legacy branding remains in targeted surfaces.
- [x] 5.2 Run focused unit tests and full build to validate rename safety.
- [x] 5.3 Perform final QA checklist and record residual references as follow-up items if intentionally deferred.
