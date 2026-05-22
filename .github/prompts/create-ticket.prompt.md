---
name: create-ticket
description: Create enterprise-ready Jira ticket from spec + codebase evidence via Atlassian MCP.
argument-hint: "jiraProjectKey='XST' issueType='Story|Task|Bug'"
agent: "agent"
---

# Create Jira Ticket Workflow

**Goal**: Write a complete Jira ticket with GOAL/SCOPE/AC/DoD from spec + repo evidence.

## Inputs
- jiraProjectKey: ${input:jiraProjectKey:Jira project key (required)}
- issueType: ${input:issueType:Story|Task|Bug (default: auto)}
- confluenceRef: ${input:confluenceRef:Confluence page URL/ID (optional)}

## Core Rules
1. **MCP-first**: Use Atlassian MCP for Confluence/Jira operations
2. **Evidence-based**: Cite file:line or Jira/Confluence for every FACT
3. **Testable AC**: Pass/fail only, prefer Given/When/Then
4. **Explicit constraints**: No new deps, backward compat, security

---

## Process

### Step 1 — Get Spec
- If confluenceRef: fetch via `mcp_atlassian_confluence_get_page`
- Else: ask user to paste spec

### Step 2 — Codebase Analysis
Search for relevant code:
```bash
rg -n "<keywords>" src/
```
Identify: modules, APIs, configs, test locations

### Step 3 — Write Ticket

```markdown
## {TICKET_TITLE}
**Type**: Story | Task | Bug
**Priority**: High | Medium | Low

### GOAL
{One sentence describing the outcome}

### SCOPE
- {What will be done}
- {2-5 bullets}

### NON-GOALS
- {What will NOT be done}
- {1-3 bullets}

### CONSTRAINTS
- No new dependencies
- Backward compatible
- {Other constraints from spec}

### CONTEXT
- Files: `src/path/to/file.js`
- Pattern: Follow existing `portfolio.js` handler

### Acceptance Criteria
- [ ] Given X, When Y, Then Z
- [ ] {Testable, pass/fail}

### Definition of Done
- [ ] Code reviewed
- [ ] Tests pass (`npm test`)
- [ ] No lint errors
- [ ] Documentation updated (if API changed)

### How to Verify
1. Build: `npm run build`
2. Test: `npm test`
3. Manual: {steps}
```

### Step 4 — Create in Jira
Use `mcp_atlassian_jira_create_issue`:
- Set project, type, priority
- Include full description
- Link to epic if applicable

---

## Bug Template (issueType=Bug)

```markdown
### Steps to Reproduce
1. {Step 1}
2. {Step 2}

### Expected Behavior
{What should happen}

### Actual Behavior
{What actually happens}

### Environment
- Browser: Chrome 120
- Extension: v1.2.3
```
