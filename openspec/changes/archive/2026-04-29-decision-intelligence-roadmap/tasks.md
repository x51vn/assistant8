## 1. Contract and Data Foundation

- [x] 1.1 Add new message types for decision scoring, guardrail evaluation, playbook insights, explainable research payload, and automation workflows in shared message schema.
- [x] 1.2 Extend message contracts and validator schemas for all new request/response envelopes.
- [x] 1.3 Add Supabase migrations for score snapshots, guardrail evaluations, playbook insights, automation rules, and execution logs.
- [x] 1.4 Add/verify RLS policies for all new tables and indexes for user-scoped query paths.
- [x] 1.5 Add mappers/DTOs for new entities with snake_case <-> camelCase conversion coverage.

## 2. Decision Intelligence Scoring v1

- [x] 2.1 Implement weighted rule engine with versioned policy config.
- [x] 2.2 Implement input aggregation pipeline (checklist + market regime + historical mistakes).
- [x] 2.3 Implement score response payload with decisionScore, grade, ruleBreakdown, blockingReasons, advice.
- [x] 2.4 Persist decision score snapshots for audit/review traceability.
- [x] 2.5 Add unit tests for scoring calibration, penalties, and deterministic output.

## 3. Pre-Trade Guardrails (Phase A)

- [x] 3.1 Implement guardrail evaluator with hard-block and soft-warn levels.
- [x] 3.2 Add risk/stoploss/regime/checklist threshold checks and policy toggles.
- [x] 3.3 Integrate guardrail evaluation into journal entry confirmation flow.
- [x] 3.4 Persist guardrail evaluation records with policy version and check-level outcomes.
- [x] 3.5 Add UI state and API wiring for block reasons and warning explanations.

## 4. Journal-to-Playbook Insights (Phase A)

- [x] 4.1 Implement batch insight generator for winning setups, repeated errors, and context patterns.
- [x] 4.2 Add insight confidence scoring and top-3 ranking strategy.
- [x] 4.3 Implement feedback endpoint and storage for helpful/not-helpful signals.
- [x] 4.4 Extend dashboard/journal widgets to show actionable playbook suggestions.
- [x] 4.5 Add tests for sparse-history behavior and ranking stability.

## 5. Explainable Research Card 2.0 (Phase B)

- [x] 5.1 Define strict output schema for thesis, confidence, evidence for/against, invalid conditions, and sources.
- [x] 5.2 Update stock research pipeline to generate structured explainable payload.
- [x] 5.3 Add schema validation and fallback error handling for malformed model output.
- [x] 5.4 Update UI card rendering for explainability sections and confidence display.
- [x] 5.5 Add tests for output completeness and safe degradation paths.

## 6. Automation Hub v1 (Phase C)

- [ ] 6.1 Implement workflow model (trigger-condition-action) with safe action sandbox.
- [ ] 6.2 Implement trigger evaluators for regime changes and exit-readiness conditions.
- [ ] 6.3 Add dedup/rate-limit/quiet-hours enforcement for workflow actions.
- [ ] 6.4 Implement execution logging and history retrieval APIs.
- [ ] 6.5 Add UI management for workflow CRUD and execution history views.

## 7. Metrics, Rollout, and Reliability

- [x] 7.1 Extend journal metrics/summary endpoints with repeatedErrorRate, disciplineScore, and insightAdoptionRate.
- [ ] 7.2 Add feature flags and cohort rollout controls for Phase A/B/C.
- [ ] 7.3 Run shadow mode for guardrails/scoring and collect false-positive telemetry.
- [ ] 7.4 Add integration tests across scoring -> guardrail -> journal -> insights path.
- [ ] 7.5 Validate build, test suites, and openspec strict validation before apply handoff.
