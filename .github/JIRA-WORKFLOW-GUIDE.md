# Jira-Driven Workflow for AI Coding Agents

This document explains how to execute the Jira-driven engineering workflow for this project.

## 📋 Quick Reference: 6-Step Workflow

Based on `.github/prompts/jira-ticket-workflow.prompt.md` - use this for every ticket.

### **Step 1: Pull Ticket + Define Done** (15 min)
```bash
# Input: Jira ticket key (e.g., X51LABS-59)
1. Fetch ticket via Jira API (fetch *all fields)
2. Restate ticket in your own words
3. Extract: requirements, constraints, scope
4. Convert Acceptance Criteria → checklist you can test
```

**Deliverable**: Clear "done" definition, no ambiguity

---

### **Step 2: Deep Understanding of Codebase** (20 min)
```bash
1. Identify entry points (APIs, handlers, UI, storage)
2. Search for existing implementations/patterns
3. Enforce: REUSE existing code (don't reinvent)
4. Map dependencies: files → modules → data flow
```

**Deliverable**: Short "impact map" (what files, why they matter)

---

### **Step 3: Proposed Change Set** (15 min)
```bash
1. List concrete changes BY FILE:
   - what will change
   - why it changes
   - expected behavioral effect
2. Identify breaking changes:
   - API contracts
   - Config schema
   - DB schema
3. Add mitigation plan (feature flag, compat layer, migration)
```

**Deliverable**: Concrete list of changes before editing

**STOP HERE if requirements unclear** → ask targeted questions

---

### **Step 4: Security & Quality Gate** (10 min)
```bash
Review for:
- Authz/authn, data exposure, PII
- Input validation, injection risks
- Dependency/supply-chain concerns
- Least privilege + secure defaults

Add mitigations tied to planned files
```

**Deliverable**: Security sign-off before implementation

---

### **Step 5: Implement with Verification** (30-60 min)
```bash
1. Create branch: git checkout -b fix/X51LABS-59-description
2. Implement minimal safe change
3. Add/adjust tests aligned to AC checklist
4. Run lint/tests; fix until green
5. Create diff summary: what changed, where, why
```

**Commands**:
```bash
npm run build           # Build the project
npm run test:unit      # Unit tests (if available)
npm run test:e2e       # E2E tests (if available)
node -c src/file.js    # Syntax check (no test env)
git diff src/file.js   # Show what changed
```

**Deliverable**: Working code, passing tests, clean git diff

---

### **Step 6: PR + Jira Comment Back** (10 min)
```bash
1. Create PR linked to ticket
2. Post Jira comment containing:
   - PR link
   - Solution summary
   - Breaking change notes (if any)
   - Test evidence (commands + results)
   - Risk/impact + mitigations
   - Rollout/rollback notes
```

**Jira Comment Must Include**:
- ✅ Implementation summary
- ✅ Files modified (with line ranges)
- ✅ Build output (success/size)
- ✅ Test results
- ✅ Before/after examples
- ✅ Next steps (if any)

**Deliverable**: Auditable, concrete, linked to code

---

## 🎯 How to Use With AI Agent (GitHub Copilot)

### Command Template
```markdown
Follow the Jira-driven workflow in `.github/prompts/jira-ticket-workflow.prompt.md` 
for ticket: https://x51labs.atlassian.net/browse/X51LABS-XX

Include all 6 steps and provide concrete outputs for each.
```

### What AI Agent Will Do
1. ✅ Fetch ticket automatically
2. ✅ Analyze codebase for impact
3. ✅ Propose specific changes
4. ✅ Check security & quality
5. ✅ Implement + verify
6. ✅ Post Jira comment with full details

### Your Job (Code Reviewer)
- Review proposed changes (Step 3)
- Verify security assessment (Step 4)
- Test in real environment (Step 5)
- Approve/merge PR (Step 6)

---

## 📊 Real Example: X51LABS-59

See `.github/X51LABS-59-WORKFLOW-SUMMARY.md` for actual workflow execution.

### Ticket
- **Key**: X51LABS-59
- **Summary**: Fix SSI realtime provider empty data for ETF symbols
- **Type**: Bug
- **Priority**: Medium
- **Effort**: 2h

### Workflow Output
- ✅ Step 1: Restated problem clearly
- ✅ Step 2: Impact map (1 file, 3 entry points)
- ✅ Step 3: Proposed 3 changes
- ✅ Step 4: Security approved
- ✅ Step 5: Implemented + built successfully
- ✅ Step 6: Posted detailed Jira comment

**Result**: Ticket completed in 2h, Jira comment has full traceability

---

## 🔧 Common Commands

### Build & Test
```bash
npm run build              # Build extension to dist/
npm run build -- --watch  # Rebuild on file change

npm run test:unit         # Unit tests
npm run test:e2e          # E2E tests
npm run test:e2e:ui       # E2E with UI
npm run test:e2e:headed   # E2E visible browser

node -c src/file.js       # Syntax check
```

### Git
```bash
git diff src/file.js           # Show changes
git diff --stat                # Show file count
git checkout -b fix/TICKET-ID  # Create feature branch
```

### Jira Comment Template
```markdown
## ✅ Implementation Complete - X51LABS-XX

### Summary
[One sentence what was fixed]

### Changes Made
**Files**: [list files changed]
**Lines Modified**: [ranges]

#### Key Improvements:
1. [Improvement 1] ✓
2. [Improvement 2] ✓
3. [Improvement 3] ✓

### Acceptance Criteria - VERIFIED
- [x] Criterion 1
- [x] Criterion 2
- [x] Criterion 3

### Build Status
[Build output]

### Testing Evidence
- ✅ [Test 1]
- ✅ [Test 2]

### Debug Output Example
[Before/After comparison]

### Next Steps
[If any additional work needed]

### Git Diff Summary
- [Change 1]
- [Change 2]
```

---

## ❌ Common Mistakes to Avoid

1. **Skip Step 3** (Propose before coding)
   - ❌ Start coding immediately
   - ✅ Define changes first, ask questions if unclear

2. **No acceptance criteria testing**
   - ❌ "Code looks good, ship it"
   - ✅ Verify each AC checklist item works

3. **Vague Jira comments**
   - ❌ "Fixed the bug"
   - ✅ Show exactly what changed, before/after, test evidence

4. **No security review**
   - ❌ Skip Step 4
   - ✅ Review authz, validation, logging for every ticket

5. **Scope creep**
   - ❌ "While fixing X, let's also refactor Y"
   - ✅ Fix only what the ticket asks, document scope

---

## ✅ Checklist Before Starting Ticket

- [ ] Read workflow steps above
- [ ] Fetch ticket details (all fields)
- [ ] Understand AC clearly
- [ ] Ask clarifying questions if needed
- [ ] Map impacted files/modules
- [ ] Propose changes (don't code yet)
- [ ] Get security sign-off
- [ ] Code implementation
- [ ] Test each AC item
- [ ] Post detailed Jira comment
- [ ] Ready for review

---

## 📞 Questions?

Refer to:
- **Workflow Prompt**: `.github/prompts/jira-ticket-workflow.prompt.md`
- **Task Breakdown**: `.github/task-breakdown-prompt.md`
- **Example**: `.github/X51LABS-59-WORKFLOW-SUMMARY.md`
- **AI Instructions**: `.github/copilot-instructions.md`

---

**Last Updated**: January 21, 2026  
**Status**: Production Ready
