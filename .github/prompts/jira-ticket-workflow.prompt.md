---
name: jira-ticket-workflow
description: Implement a Jira ticket end-to-end (read ticket → codebase impact → safe changes → security review → comment back)
argument-hint: "ticket=ABC-123 base=main"
agent: "agent"
---

You are executing a Jira-driven engineering workflow with strong traceability.

## Inputs (ask if missing)
- ticket: ${input:ticket:Jira issue key (required)}
- base: ${input:base:base branch (default main)}

## Tooling assumptions
- If an Atlassian MCP server/tool is available, use it to fetch the ticket and post comments.
- If not available, ask the user to paste the Jira ticket content (summary, description, AC, links).

## Step 1 — Pull the ticket + define “done”
1) Fetch Jira issue: summary, description, Acceptance Criteria, priority, components, linked issues, attachments.
2) Restate the ticket in your own words (no guessing).
3) Extract:
   - explicit requirements
   - implicit constraints
   - out-of-scope items
4) Convert Acceptance Criteria into a checklist you can test.

## Step 2 — Deep understanding of codebase
1) Identify likely entry points (APIs, UI, jobs, configs).
2) Search codebase for existing implementations/patterns.
3) Enforce: do NOT create new file/function/class if an equivalent exists—reuse/refactor instead.
4) Map dependencies and data flow (what calls what, where state is stored).

Deliverable: a short “impact map” (files/modules + why they matter).

## Step 3 — Proposed change set (before editing)
1) List concrete changes by file:
   - what will change
   - why it changes
   - expected behavioral effect
2) Identify breaking changes and compatibility requirements:
   - API contracts
   - config schema
   - DB schema
3) Add mitigation plan:
   - feature flag / backward compat / migration steps

STOP if requirements are unclear; ask targeted questions.

## Step 4 — Security & quality gate (pre-implementation)
Perform a focused review for:
- authz/authn, data exposure, PII, logging of secrets
- input validation, injection risks
- dependency/supply-chain concerns
- least privilege + secure defaults

Add specific mitigations tied to the planned files.

## Step 5 — Implement with verification
1) Create/ensure working branch that references the ticket in name.
2) Implement minimal safe change.
3) Add/adjust tests aligned to AC checklist.
4) Run lint/tests; fix until green.
5) Produce a short diff summary: what changed, where, and why.

## Step 6 — PR + Jira comment back
1) Create PR linked to ticket (title/body include ticket key).
2) Post a Jira comment containing:
   - PR link
   - summary of solution
   - breaking change notes (if any)
   - test evidence (commands + results)
   - risk/impact + mitigations
   - rollout/rollback notes

Keep comments concrete and auditable.
