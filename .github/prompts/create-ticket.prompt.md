---
name: create-ticket
description: Write a Jira ticket that is enterprise-ready (GOAL/SCOPE/NON-GOALS/CONSTRAINTS/CONTEXT/AC/DoD) from SPEC + codebase evidence, using Atlassian MCP for Confluence/Jira. No guessing.
argument-hint: "specSource='auto|confluence|inline' confluenceRef='url|pageId|spaceKey+title' confluenceAttachment='optional' jiraProjectKey='ABC' issueTypeHint='auto|Story|Task|Bug|Perf' jiraContextMode='read|create' "
agent: "agent"
---

You are assisting with disciplined Jira ticket creation from SPEC + repository evidence.
You MUST use Atlassian MCP tools to read Confluence and interact with Jira (search/metadata/create/update) whenever MCP is available.

## Inputs (ask only if missing AND blocking)
- specSource: ${input:specSource:auto|confluence|inline (default: auto)}
- confluenceRef: ${input:confluenceRef:Confluence URL or pageId or "spaceKey+title" (optional unless specSource=confluence)}
- confluenceAttachment: ${input:confluenceAttachment:Optional attachment name/id if spec is an attachment (optional)}
- jiraProjectKey: ${input:jiraProjectKey:Jira project key (optional but recommended)}
- issueTypeHint: ${input:issueTypeHint:auto|Story|Task|Bug|Perf (default: auto)}
- jiraContextMode: ${input:jiraContextMode:read|create (default: read)}

## Non-negotiable rules
- MCP-first: Always attempt to use Atlassian MCP to fetch Confluence spec and Jira context (issue types/components/labels/duplicates/epics).
- No fabricated facts: any statement labeled FACT must cite repo evidence (file path + symbol; line numbers if visible) OR MCP evidence (Confluence page title/id; Jira key).
- If something cannot be verified from SPEC/repo/MCP, label it ASSUMPTION (minimal) or QUESTION (blocking).
- DoD / Acceptance must be specific pass/fail. “Works” is invalid. Use “passes these tests/cases” + observable outcomes.
- Constraints must be explicit (no new deps, no public API breaking, backward compatible, perf/SLA, security/privacy). If not in SPEC, mark ASSUMPTION.
- If issueTypeHint=Bug, include Steps to Reproduce + Expected vs Actual + Environment.

## Procedure (execute in order)

### Step 0 — Repo sanity
Run:
1) git rev-parse --show-toplevel
2) git status --porcelain
3) git branch --show-current

If not a git repo: STOP.

### Step 0.5 — Atlassian MCP readiness (MANDATORY)
1) Check MCP tool availability in your environment.
2) If MCP is available:
   - Use MCP to authenticate/authorize if needed (OAuth flow handled by client).
   - Proceed with MCP calls for Confluence + Jira.
3) If MCP is NOT available:
   - Ask me to provide SPEC inline (paste) and (optional) Jira project constraints.
   - Continue with repo-only evidence.

### Step 1 — Get SPEC (Confluence or inline)
If specSource=auto:
- If confluenceRef is provided => treat as Confluence spec (MCP).
- Else => treat as inline spec (ask me to paste).

If specSource=confluence:
- Use Atlassian MCP Confluence tools to fetch the page by confluenceRef.
- If confluenceAttachment is provided, use MCP to fetch/preview the attachment contents.
- Extract: GOAL, SCOPE, NON-GOALS, CONSTRAINTS, acceptance criteria hints, dependencies, and any DoD language.

If specSource=inline:
- Ask me to paste SPEC text (only if missing and blocking).

### Step 2 — Gather codebase evidence (FACT)
Discover relevant code areas:
- Use ripgrep/search on key nouns/verbs from SPEC:
  - rg -n "<keywords>" .
- Collect: impacted modules/services, entrypoints, APIs, configs, data models.
- Extract conventions/tooling (FACT when found):
  - language/runtime versions, build tool, test framework, lint/format rules
  - Where tests live + how to run (scripts/commands if visible)

### Step 3 — Jira context via MCP (MANDATORY when MCP available)
If MCP available:
- Use Atlassian MCP Jira tools to:
  - Confirm project exists (jiraProjectKey if provided)
  - List issue types / components / labels conventions if accessible
  - Search for potential duplicates by keywords
  - (Optional) Find related epic/linking conventions
If jiraProjectKey is missing and spec doesn’t state it, mark QUESTION (blocking) OR proceed without project metadata.

### Step 4 — Derive ticket skeleton (no guessing)
Derive from SPEC + repo evidence (+ Jira context if available):
- GOAL: what must be achieved (feature/bug/perf) + measurable target if applicable
- SCOPE: what will be done (3–7 bullets)
- NON-GOALS: what will NOT be done (2–6 bullets)
- CONSTRAINTS: explicit constraints (list; mark ASSUMPTION if not in SPEC)
- CONTEXT: repo/module/file paths + versions/tooling/conventions (FACT)

Issue type selection:
- If issueTypeHint != auto, follow it.
- If auto:
  - Bug if fixing incorrect behavior/regression (prefer if spec includes repro/actual vs expected)
  - Perf if target is latency/throughput/memory/CPU improvement
  - Story/Task otherwise

### Step 5 — Acceptance Criteria + DoD (pass/fail only)
Acceptance Criteria rules:
- 3–7 items, outcome-oriented, testable.
- Prefer Given/When/Then when behavior clarity matters.
- Each AC must map to an observable result or a test case.

DoD rules:
- Checklist, pass/fail, concrete.
- Must include verification:
  - Specific tests/suites/commands if known (FACT). If unknown: specify exact test location + required additions.
  - Review complete per repo rules (FACT if found; else ASSUMPTION).
  - Security/quality checks if relevant (FACT if tooling exists; else ASSUMPTION).
  - Docs/ADR updates if behavior/API changes.
  - Backward compatibility confirmation if applicable.

### Step 6 — Output (strict format)
Return EXACTLY in this structure:

A) PLAN (8–12 bullets)
- What will change (high level)
- What will NOT change
- Key risks + mitigations
- Tests to run/add (name + location if found)
- Jira context actions taken (MCP) + findings (duplicates/issue type/components)
- Rollout/rollback if relevant

B) FINAL JIRA TICKET (paste-ready)
[ISSUE TYPE]: Story / Task / Bug / Perf
[SUMMARY]: verb-first, concise, include module name if obvious

GOAL:
- ...

SCOPE (In-scope):
- ...

NON-GOALS (Out-of-scope):
- ...

CONSTRAINTS:
- ...

CONTEXT (Evidence)
- Confluence SPEC (MCP):
  - FACT: <page title> (<pageId or URL>)
  - FACT: key sections extracted
- Jira context (MCP):
  - FACT: project <key>, issue types/components conventions (if retrieved)
  - FACT: duplicate search results (if any)
- Repo evidence (FACT):
  - FACT: <path> — <why relevant> (<symbol>)
  - FACT: <tooling/versions/conventions> — <path>

(if Bug) REPRODUCTION:
- Steps to reproduce:
  1) ...
- Expected result:
- Actual result:
- Environment:
  - OS/Browser/App version (if known; else QUESTION)

ACCEPTANCE CRITERIA (Pass/Fail):
- ...

DoD (Definition of Done) — Checklist (Pass/Fail):
- [ ] ...

TEST PLAN:
- What to test + where (FACT)
- Commands (FACT if known; else generic)
- Edge cases:

RISKS / ROLLBACK:
- Risks:
- Mitigations:
- Rollback:

REFERENCES:
- Confluence page link/title (from MCP)
- Jira references (project/epic/related issues if any)
- Repo evidence list (key files)

C) QUALITY GATE (5–8 bullets)
- Confirm each FACT has file-path or MCP evidence
- Confirm each AC is testable + pass/fail
- Confirm DoD is concrete (tests/cases), no “works”
- Confirm constraints addressed (API/backward/perf/security)
- List remaining ASSUMPTION / QUESTION (minimal)

## If you need more info
Ask ONLY for the minimum missing input (max 3 items):
- confluenceRef (URL/pageId) or pasted SPEC text
- jiraProjectKey (if needed for Jira metadata)
- perf/SLA target if Perf ticket
