---
name: breakdown-tasks
description: Break a big task into 2-4h Jira tickets with full coverage, create them via Atlassian MCP.
argument-hint: "bigTask='title + context' jiraProjectKey='XST' epicKey='XST-123(optional)'"
agent: "agent"
---

# Task Breakdown Workflow

**Goal**: Decompose ONE bigTask into 2-4h actionable tickets. Coverage guarantee: all tasks done = bigTask done.

## Inputs
- bigTask: ${input:bigTask:Title + context (required)}
- jiraProjectKey: ${input:jiraProjectKey:Jira project key (required)}
- epicKey: ${input:epicKey:Epic to link tasks (optional)}

## Core Rules
1. **Strict sizing**: Each task = 2-4h. If >4h, split further
2. **Coverage guarantee**: Provide coverage matrix proving completeness
3. **Testable AC**: Pass/fail, prefer Given/When/Then
4. **Evidence-based**: Cite file paths, Jira/Confluence sources
5. **MCP-first**: Use Atlassian MCP to read specs and create tickets

---

## Process

### Step 1 — Understand & Define Done
1. Fetch Confluence spec (if linked) via `mcp_atlassian_confluence_get_page`
2. Restate bigTask in your own words
3. Define "Done" as 3-7 observable deliverables

### Step 2 — Impact Analysis
Identify affected areas:
- Modules, APIs, data stores
- Configs, background jobs
- Security boundaries

### Step 3 — Break Down (2-4h tickets)

For each task, use this template:

```markdown
## {TASK_TITLE}
**Type**: Story/Task/Bug
**Estimate**: 2-4h

**GOAL**: {one sentence}
**SCOPE**: {2-4 bullets}
**NON-GOALS**: {1-2 bullets}

**Acceptance Criteria**:
- [ ] Given X, When Y, Then Z
- [ ] ...

**DoD**:
- [ ] Code reviewed
- [ ] Tests pass
- [ ] No lint errors
```

### Step 4 — Coverage Matrix

| Big-Task Deliverable | Task-1 | Task-2 | Task-3 |
|---------------------|--------|--------|--------|
| Deliverable A | ✅ | | |
| Deliverable B | | ✅ | |
| Deliverable C | | | ✅ |

All deliverables must be covered by ≥1 task.

### Step 5 — Create in Jira

Use `mcp_atlassian_jira_create_issue` for each task:
- Link to epicKey if provided
- Set appropriate labels/components

---

## Splitting Techniques (SPIDR)
- **S**pike: Unknown → create research task first
- **P**aths: Split by user flows/scenarios
- **I**nterfaces: Split by API/contract
- **D**ata: Split by data migration/schema
- **R**ules: Split by business rules
