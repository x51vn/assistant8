---
name: jira-ticket-workflow
description: Implement a Jira ticket end-to-end (read ticket/spec → codebase impact → safe changes → security+ops readiness gates → PR → comment back) with strong traceability.
argument-hint: "ticket=ABC-123 base=main confluenceRef='url|pageId|spaceKey+title' mcpRequired='auto|on|off' "
agent: "agent"
---

You are executing a Jira-driven engineering workflow with strong traceability and enterprise gates.
Primary objective: deliver the ticket outcome with verifiable evidence (AC + DoD pass/fail), minimal risk, and auditable links.

## Inputs (ask if missing AND blocking)
- ticket: ${input:ticket:Jira issue key (required)}
- base: ${input:base:base branch (default main)}
- confluenceRef: ${input:confluenceRef:Confluence URL/pageId/spec page ref (optional)}
- mcpRequired: ${input:mcpRequired:auto|on|off (default auto)}

## Tooling assumptions
- If an Atlassian MCP server/tool is available, you MUST use it to:
  - fetch Jira issue + metadata + linked issues/attachments
  - read Confluence spec (if linked or confluenceRef provided)
  - comment back on Jira (and optionally transition status)
- If MCP is not available (or mcpRequired=off), ask the user to paste:
  - Jira Summary + Description + Acceptance Criteria + DoD + links/attachments content.

## Non-negotiable rules (enterprise)
- Evidence-first: No fabricated facts. Any FACT must cite:
  - Repo evidence: file path + symbol (and line numbers if visible), OR
  - Atlassian evidence via MCP: Jira key / Confluence page title+id.
- DoD must be pass/fail and specific. “Works” is invalid.
- Reuse over create: Do NOT create new file/function/class if an equivalent exists—reuse/refactor instead.
- Keep changes minimal and backward compatible unless the ticket explicitly allows breaking changes.
- Security-by-design: apply least privilege, defense-in-depth, secure defaults; avoid leaking secrets/PII; prefer safe failure.

---

# Step 0 — Readiness & guardrails
1) Repo sanity:
   - git rev-parse --show-toplevel
   - git status --porcelain
   - git branch --show-current
   STOP if not a git repo.

2) Atlassian connectivity:
   - If MCP available (or mcpRequired=on): proceed with MCP calls.
   - Else: request pasted ticket content (minimal).

Deliverable:
- “Run context”: repo root, current branch, whether MCP is available.

---

# Step 1 — Pull ticket/spec + define “DONE” (Ticket Brief)
1) Fetch Jira issue via MCP:
   - summary, description, AC, priority, components, labels
   - linked issues/epic, attachments, comments history
2) Fetch Confluence spec via MCP (if linked or confluenceRef provided):
   - extract explicit requirements + constraints + non-goals
3) Restate ticket in your own words (no guessing).

4) Produce the **Ticket Brief** (single source of truth):
   - GOAL: what must be achieved (feature/bug/perf) + measurable target if given
   - SCOPE: what will be done (3–7 bullets)
   - NON-GOALS: what will NOT be done (2–6 bullets)
   - CONSTRAINTS: explicit constraints (API/backward, no deps, perf/SLA, security/privacy, logging/audit, rollout)
     - If not stated: mark ASSUMPTION
   - CONTEXT: evidence anchors
     - Jira: key fields + links
     - Confluence: page title/id + key sections
     - Repo: likely modules (FACT later after Step 2)

5) Convert AC into a **testable checklist**:
   - For each AC, rewrite as pass/fail (prefer Given/When/Then where useful).

STOP conditions (ask targeted questions, max 3):
- Missing AC/DoD or unclear success metrics (especially perf/SLA).
- Ambiguous scope/owner module or missing environment/repro steps for bugs.

Deliverables:
- Ticket Brief (GOAL/SCOPE/NON-GOALS/CONSTRAINTS/CONTEXT)
- AC checklist (pass/fail)

---

# Step 2 — Deep understanding of codebase (Impact Map)
1) Identify entry points:
   - APIs/routes/controllers, UI pages/components, jobs/workers, configs, schemas, feature flags
2) Search for existing implementations/patterns (reuse first):
   - locate similar features/handlers/tests
3) Map dependencies & data flow:
   - what calls what, where state is stored, boundaries (trust/data)

Deliverable: **Impact Map** (FACT only)
- File/module list with why it matters:
  - <path> — <role> — <symbol>
- Conventions/tooling detected:
  - runtime versions, build system, test framework, lint/format rules (cite paths)
- Existing test locations + how to run (if discoverable)

STOP if:
- No clear entry point found → ask for moduleHint or PR/branch pointer.

---

# Step 3 — Proposed change set (before editing) + MECE check
1) List concrete changes by file (MECE: no overlap, no gaps):
   - File: what will change / why / expected behavior change
2) Compatibility analysis:
   - public API contracts
   - config schema
   - DB schema / migrations
   - backward compatibility requirements
3) Mitigation plan (pick only what’s needed):
   - feature flag strategy
   - rollout phases
   - migration steps
   - rollback plan
4) Build **AC → Verification Map** (traceability matrix):
   - AC-1 → tests/commands/evidence
   - AC-2 → tests/commands/evidence
   If tests don’t exist yet: specify where you will add them.

STOP if:
- Proposed changes violate CONSTRAINTS (e.g., new deps, API break) without explicit approval.

Deliverables:
- Change list by file (MECE)
- AC → Verification Map

---

# Step 4 — Security & operational readiness gate (pre-implementation)
Perform a focused review (tie to files from Step 3):
Security gate (examples to consider):
- authn/authz correctness, least privilege boundaries
- data exposure/PII handling, logging of sensitive data
- input validation, injection risks
- secrets management (no credentials in code/config)
- dependency/supply-chain (no new deps unless approved)

Operational readiness gate (pass/fail checks relevant to service tier):
- observability: logs/metrics/traces for new behavior
- error handling: safe failure + no sensitive leakage
- performance guardrails: timeouts, pagination, rate limiting, caching
- runbook/rollback readiness if change is risky

Deliverable:
- Security+Ops checklist (Yes/No/N/A) + concrete mitigations mapped to planned files.

STOP if:
- High-risk security issue discovered without a mitigation path.

---

# Step 5 — Implement with verification (minimal safe change)
1) Branching:
   - Ensure working branch referencing ticket key (e.g., feature/ABC-123-<scope>-<summary>)
2) Implement minimal safe change per Step 3.
3) Add/adjust tests aligned to AC checklist.
4) Run verification:
   - lint + unit/integration/e2e as applicable
   - collect evidence (command outputs, artifacts)
5) Produce concise diff summary:
   - what changed, where, why (file list + intent)

Deliverables:
- Diff summary
- Test evidence summary (commands run + results)
- Updated AC → Verification Map (filled with actual evidence)

---

# Step 6 — PR + Jira comment back (auditable)
1) Create PR linked to ticket:
   - title includes ticket key
   - body includes: GOAL, scope, risk, test evidence, rollout/rollback
2) Post Jira comment via MCP containing:
   - PR link
   - summary of solution + key files
   - breaking changes notes (if any)
   - test evidence (commands + results)
   - risk/impact + mitigations
   - rollout/rollback notes
3) (Optional) Transition Jira status if workflow allows.

Deliverable:
- Jira comment text + confirmation of posting (key/time)

---

# Step 7 — Post-merge hygiene (only if required by ticket/tier)
- Release notes / changelog
- Monitoring dashboards / alerts updated
- Runbook updated
- Follow-up tickets for non-goals/deferred work

Deliverable:
- Post-merge checklist completion summary
