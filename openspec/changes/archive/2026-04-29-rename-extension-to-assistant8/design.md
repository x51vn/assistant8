## Context

The repository currently uses mixed branding references such as ChatGPT Assistant, chatgpt-assistant, and product labels tied to legacy naming. These references exist across extension metadata, UI strings, docs, and package/workspace identifiers. The rename must be consistent for user-facing trust, release packaging, and internal maintenance while preserving existing runtime behavior.

Constraints:
- Chrome MV3 extension metadata and side panel UI must continue to load without permission or routing changes.
- Existing message contracts and Supabase schemas are not being renamed in this change unless directly tied to display identity.
- The migration should minimize risk to build/test/deploy automation by applying controlled renames in phases.

## Goals / Non-Goals

**Goals:**
- Define Assistant8 as the canonical product identity for the extension.
- Ensure all user-facing identity strings display Assistant8 consistently.
- Align package/distribution metadata and core docs with the new name.
- Provide a low-risk migration path with validation checks.

**Non-Goals:**
- Refactor unrelated architecture or feature logic.
- Rename persisted database tables/columns that are not branding-facing.
- Change business behavior of portfolio, journal, or research modules.

## Decisions

1. Canonical naming matrix
- Decision: Use Assistant8 as the canonical display/product name and assistant8 as the canonical slug for new labels.
- Rationale: A single source of naming truth prevents reintroduction of mixed branding.
- Alternative considered: Preserve legacy slug in all internals. Rejected because it prolongs inconsistency and increases future cleanup cost.

2. Scope by surface type
- Decision: Prioritize identity surfaces in this order: manifest + side panel UI + settings/about UI + package/release metadata + docs.
- Rationale: User-facing correctness has highest impact; infra/docs can follow once runtime safety is confirmed.
- Alternative considered: Big-bang rename across entire repo. Rejected due to elevated regression risk.

3. Compatibility boundary
- Decision: Keep runtime message types, DB table names, and internal IDs unchanged unless explicitly required for branding display.
- Rationale: Limits breakage in integrations and migrations while achieving visible rename outcomes.
- Alternative considered: Full internal rename. Rejected because it is unnecessary for this objective and too risky in one change.

4. Verification strategy
- Decision: Validate with focused grep checks for legacy brand strings, targeted unit tests, and full extension build.
- Rationale: Provides confidence that key surfaces changed while runtime remains stable.
- Alternative considered: Manual-only QA. Rejected for lack of repeatability.

## Risks / Trade-offs

- [Partial rename leaves inconsistent branding] -> Mitigation: apply a defined surface checklist and grep-based audit before completion.
- [Accidental rename of protocol/schema keys] -> Mitigation: restrict replacements to display/metadata/doc scopes first and review message/schema files carefully.
- [Build or packaging regressions from package metadata changes] -> Mitigation: run full build and smoke checks after metadata edits.
- [Third-party references to old branding remain] -> Mitigation: keep transitional notes in docs/changelog and track residual references as follow-up tasks.

## Migration Plan

1. Introduce naming contract and checklist under the capability spec.
2. Apply rename to manifest/UI metadata and visible labels.
3. Apply rename to package/workspace metadata where safe.
4. Update key documentation and release-facing references.
5. Run validation: grep audit + unit tests + build.
6. Rollback strategy: restore previous labels/metadata in changed files only if runtime/build regression is detected.

## Open Questions

- Should extension IDs/chrome store listing names be changed in the same release or as a separate release-management change?
- Should repository folder name be renamed now or deferred to avoid CI path and external script impacts?
- Is a short-lived compatibility alias needed in docs (Assistant8, formerly ChatGPT Assistant) for one release cycle?
