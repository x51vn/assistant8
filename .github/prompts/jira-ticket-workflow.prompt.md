---
name: jira-ticket-workflow
description: Implement Jira ticket end-to-end with traceability. Adapts complexity based on ticket size.
argument-hint: "ticket=XST-123 base=main"
agent: "agent"
---

# Jira Ticket Workflow (Adaptive)

**Objective**: Deliver ticket outcome with verifiable evidence, minimal risk, auditable links.

## Inputs
- ticket: ${input:ticket:Jira issue key (required)}
- base: ${input:base:base branch (default main)}

## Core Rules (Non-negotiable)
1. **Evidence-first**: Cite file:line or Jira/Confluence source for every FACT
2. **Reuse over create**: Search existing patterns before creating new code
3. **Minimal change**: Backward compatible unless ticket explicitly allows breaking
4. **Security-by-design**: Least privilege, no secrets in code, safe failure

## MCP Usage
- **MUST use** Atlassian MCP tools when available for Jira/Confluence operations
- Fallback: Ask user to paste ticket content only if MCP unavailable

---

# Phase 0 — Triage & Size (30 seconds)

Fetch ticket via \`mcp_atlassian_jira_get_issue\`, then classify:

| Size | Criteria | Workflow |
|------|----------|----------|
| **S** (Small) | Bug fix, typo, config change, <50 LOC | Skip to Phase 2 → 4 → 5 |
| **M** (Medium) | Single feature, clear scope, <200 LOC | Full workflow, light gates |
| **L** (Large) | Multi-file feature, new module, >200 LOC | Full workflow, strict gates |

Output: \`[SIZE: S/M/L] [TYPE: bug/feature/refactor/chore]\`

---

# Phase 1 — Ticket Brief (Size M/L only)

Extract from Jira + Confluence (if linked):

\`\`\`markdown
## Ticket Brief: {TICKET_KEY}
**GOAL**: {one sentence, measurable if possible}
**SCOPE**: {3-5 bullets of what WILL be done}
**NON-GOALS**: {what will NOT be done}
**CONSTRAINTS**: {API compat, deps, perf targets, security requirements}
\`\`\`

**AC Checklist** (convert each AC to pass/fail):
- [ ] AC-1: Given X, When Y, Then Z
- [ ] AC-2: ...

⚠️ **STOP only if**: Missing AC entirely OR ambiguous scope (ask max 2 questions)

---

# Phase 2 — Impact Analysis (Focused)

Search codebase for relevant files ONLY. Output:

\`\`\`markdown
## Impact Map
| File | Role | Change Type |
|------|------|-------------|
| path/to/file.js | handler | MODIFY |
| path/to/new.js | component | CREATE |

**Patterns to follow**: {cite existing similar code}
**Test location**: {where tests should go}
\`\`\`

For Size S: Just list 1-3 files affected.

---

# Phase 3 — Propose Changes (before coding)

\`\`\`markdown
## Proposed Changes
| File | What | Why |
|------|------|-----|
| ... | ... | ... |

## AC → Verification Map
| AC | How to Verify |
|----|---------------|
| AC-1 | \`npm test -- path/to/test\` |
| AC-2 | Manual: click X, expect Y |
\`\`\`

For Size L only - add:
- Breaking changes analysis
- Migration/rollback plan

---

# Phase 4 — Implement & Verify

1. **Branch**: \`feature/{ticket}-{short-desc}\` or \`fix/{ticket}-{short-desc}\`

2. **Implement** minimal safe change per Phase 3

3. **Test**: Run relevant tests, collect evidence

4. **Commit format** (Conventional Commits):
   \`\`\`
   feat(module): short description [TICKET-123]
   fix(module): short description [TICKET-123]
   \`\`\`

5. **Output**:
   \`\`\`markdown
   ## Implementation Summary
   - Files changed: X
   - Lines: +Y/-Z
   - Tests: ✅ passed / ❌ failed
   
   ## AC Verification
   - [x] AC-1: {evidence}
   - [x] AC-2: {evidence}
   \`\`\`

---

# Phase 5 — Security & Ops Gate (Size M/L only)

Quick checklist (skip N/A items):

| Check | Status | Notes |
|-------|--------|-------|
| Auth/authz correct? | ✅/❌/N/A | |
| Input validated? | ✅/❌/N/A | |
| No secrets in code? | ✅/❌/N/A | |
| Error handling safe? | ✅/❌/N/A | |
| Logging appropriate? | ✅/❌/N/A | |

⚠️ **STOP if**: Security issue found without mitigation

---

# Phase 6 — PR & Jira Update

1. **Create PR** with:
   - Title: \`[TICKET-123] Short description\`
   - Body: Goal, changes, test evidence, risks

2. **Comment on Jira** via \`mcp_atlassian_jira_add_comment\`:
   \`\`\`markdown
   ## Implementation Complete
   **PR**: {link}
   **Changes**: {summary}
   **Test Evidence**: {commands + results}
   **Risks**: {none | list}
   \`\`\`

3. (Optional) Transition ticket status if workflow allows

---

# Phase 7 — PR Feedback Loop (if requested)

When user shares PR review feedback:
1. Address each comment
2. Push fixes
3. Update Jira comment with revision note
4. Re-verify affected ACs

---

# Quick Reference

\`\`\`
Size S: Phase 0 → 2 → 4 → 6
Size M: Phase 0 → 1 → 2 → 3 → 4 → 5(light) → 6
Size L: Phase 0 → 1 → 2 → 3 → 4 → 5(strict) → 6 → 7(if needed)
\`\`\`

**Key MCP Tools**:
- \`mcp_atlassian_jira_get_issue\` - Fetch ticket
- \`mcp_atlassian_jira_add_comment\` - Post update
- \`mcp_atlassian_confluence_get_page\` - Read spec
- \`mcp_atlassian_jira_transition_issue\` - Move status
