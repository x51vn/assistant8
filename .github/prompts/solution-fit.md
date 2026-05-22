---
name: solution-fit
description: Propose best-fit solution with structured options, trade-offs, and smallest safe diff.
argument-hint: "goal='...' constraints='...'"
agent: "agent"
---

# Solution Fit Workflow

**Goal**: Propose the best-fit solution with evidence-based reasoning and minimal change.

## Inputs
- goal: ${input:goal:What outcome must be achieved?}
- constraints: ${input:constraints:Hard constraints (tech, deadline, compat)}
- context: ${input:context:Background, current behavior (optional)}

## Core Rules
1. **Reuse over create**: Extend existing code, don't duplicate
2. **Smallest safe diff**: Minimize blast radius, keep backward compat
3. **Evidence-based**: Cite file paths, existing patterns
4. **SOLID/DRY/KISS**: Maintainable > clever

---

## Output Structure

### 1. Goal & Constraints
```markdown
**Goal**: {restate in 1-2 sentences}
**Hard Constraints**: {list}
**Assumptions**: {if any, how to validate}
```

### 2. Options (2-3 max)

| Aspect | Option A | Option B |
|--------|----------|----------|
| Summary | {1 line} | {1 line} |
| Changes | {modules} | {modules} |
| Pros | {list} | {list} |
| Cons | {list} | {list} |
| Risk | Low/Med/High | Low/Med/High |
| Effort | S/M/L | S/M/L |

### 3. Recommendation
```markdown
**Best Fit**: Option {X}
**Reason**: 
- Aligns with existing pattern in `src/...`
- Smallest change footprint
- {other reasons}
```

### 4. Implementation Plan
```markdown
1. **{Step}**: {what to do}
   - Reuse: `src/existing/file.js`
   - Create: `src/new/file.js` (if needed)

2. **{Step}**: ...
```

### 5. Verification
```markdown
- Build: `npm run build`
- Test: `npm test`
- Regression: {what could break}
- Rollback: {how to revert}
```

---

## Quick Decision Matrix

| Factor | Weight | Option A | Option B |
|--------|--------|----------|----------|
| Reuse existing | High | ⭐⭐⭐ | ⭐ |
| Maintainability | High | ⭐⭐ | ⭐⭐⭐ |
| Risk | Med | ⭐⭐⭐ | ⭐⭐ |
| Effort | Med | ⭐⭐⭐ | ⭐ |
| **Total** | | **11** | **7** |
