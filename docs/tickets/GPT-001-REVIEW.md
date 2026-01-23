# GPT-001 Sub-Tickets Review & Summary

**Parent**: GPT-001 Baseline audit & Architecture-Code mapping  
**Date**: January 23, 2026  
**Status**: ✅ REVIEWED & APPROVED

---

## Overview

Sau khi audit GPT-001 hoàn thành, phát hiện các "quick wins" và prerequisite tasks chưa được cover rõ ràng bởi GPT-002 đến GPT-038. Tạo 6 sub-tickets dạng GPT-001-xxx để xử lý các gaps này.

---

## Sub-Tickets Created

| Ticket | Title | Timebox | Priority | Dependency |
|--------|-------|---------|----------|------------|
| **GPT-001-001** | Register existing handlers in index.js | 30min-1h | HIGH | None (prerequisite) |
| **GPT-001-002** | Add .env.example with Supabase placeholders | 15-30min | HIGH | Prerequisite for GPT-002 |
| **GPT-001-003** | Create shared constants for decisions | 30min-1h | MEDIUM | None (prerequisite) |
| **GPT-001-004** | Update gitignore for Supabase local dev | 15min | LOW | None (housekeeping) |
| **GPT-001-005** | Document storage keys transition plan | 30min-1h | MEDIUM | Planning doc |
| **GPT-001-006** | Create error code constants (VN mapping) | 1h | MEDIUM | Prerequisite for GPT-004, GPT-032 |

---

## Rationale

### Why These Tickets Are Needed

1. **GPT-001-001** (Register handlers):
   - **Gap**: Audit found `alarms.js`, `contextMenu.js`, `telemetry.js` exist but NOT imported in `handlers/index.js`
   - **Not covered by**: GPT-022 (alarms) only implements logic, doesn't explicitly say "add import"
   - **Impact**: Handlers won't execute if not registered

2. **GPT-001-002** (.env.example):
   - **Gap**: GPT-002 says "add SDK" but doesn't explicitly create .env.example template
   - **Not covered by**: GPT-002 mentions env but doesn't specify file creation
   - **Impact**: Developers won't know what env vars to set

3. **GPT-001-003** (Constants):
   - **Gap**: Audit decisions (retry 3x, 100 history, 5min updates) are in docs, not in code constants
   - **Not covered by**: Individual tickets will implement but may hardcode differently
   - **Impact**: Magic numbers scattered, hard to maintain

4. **GPT-001-004** (.gitignore):
   - **Gap**: No explicit ticket for .gitignore update for Supabase
   - **Not covered by**: GPT-002 implies it but doesn't enforce
   - **Impact**: Risk of committing .env

5. **GPT-001-005** (Migration plan doc):
   - **Gap**: Audit section 2 has detailed key mapping but no standalone doc
   - **Not covered by**: GPT-026/027 implement but don't document the plan upfront
   - **Impact**: Migration developers need clear reference

6. **GPT-001-006** (Error codes):
   - **Gap**: GPT-032 says "standardize error UX" but doesn't specify constants file
   - **Not covered by**: GPT-004 implements retry but doesn't centralize error codes
   - **Impact**: Inconsistent error messages across codebase

---

## Validation Against Existing Tickets

### No Duplication Check

| Sub-Ticket | Overlaps With? | Resolution |
|-----------|----------------|------------|
| GPT-001-001 | GPT-022 (alarms) | ❌ NO - GPT-022 implements alarm logic, not registration |
| GPT-001-002 | GPT-002 (SDK) | ⚠️ PARTIAL - GPT-002 mentions env, but doesn't mandate .env.example file |
| GPT-001-003 | Multiple | ❌ NO - Individual tickets may use constants but don't create centralized file |
| GPT-001-004 | GPT-002 | ⚠️ IMPLIED - GPT-002 should do this, but not explicit |
| GPT-001-005 | GPT-026/027 | ❌ NO - Migration tickets implement, this documents plan |
| GPT-001-006 | GPT-004, GPT-032 | ⚠️ PARTIAL - They use errors, but don't centralize constants |

**Resolution**: All sub-tickets address **planning/infrastructure gaps** that are implied but not explicitly mandated by GPT-002 to GPT-038. They are **prerequisites** that make implementation cleaner.

---

## Execution Order

### Recommended Sequence

```
Phase 0: Quick Wins (Can do immediately, parallel)
├── GPT-001-001: Register handlers (30min)
├── GPT-001-002: .env.example (15min)
├── GPT-001-003: Constants (1h)
├── GPT-001-004: .gitignore (15min)
├── GPT-001-005: Migration plan doc (1h)
└── GPT-001-006: Error codes (1h)

Total: ~4-5 hours max
Then proceed to GPT-002 → GPT-009 (Foundation)
```

### Integration with Main Tickets

- **GPT-001-001** → Blocks **GPT-022** (alarms handler needs to be registered)
- **GPT-001-002** → Prerequisite for **GPT-002** (dev knows what env vars needed)
- **GPT-001-003** → Used by **GPT-004, GPT-020, GPT-021, GPT-022** (retry/batch/interval constants)
- **GPT-001-004** → Housekeeping for **GPT-002** (prevent .env commit)
- **GPT-001-005** → Reference doc for **GPT-026, GPT-027** (migration implementers)
- **GPT-001-006** → Used by **GPT-004, GPT-032** (error handling/UX)

---

## Standards Compliance

### Ticket Template Check

All sub-tickets follow the standard template:

✅ **Project Context** - Repeated in every ticket  
✅ **Parent Ticket** - Explicitly reference GPT-001  
✅ **Timebox** - 15min to 1h (all under 2-4h threshold)  
✅ **Goal** - Clear, actionable  
✅ **Inputs** - Specified  
✅ **Requirements** - Numbered, with code examples where applicable  
✅ **SOLID Notes** - Included (or N/A for docs/config)  
✅ **Acceptance Criteria** - Testable  
✅ **DoD** - Clear completion state  
✅ **Test Plan** - Specified  
✅ **Dependencies** - Mapped to main tickets  
✅ **Risks** - Assessed  

### Naming Convention

✅ Format: `GPT-001-XXX <description>`  
✅ Indicates sub-ticket relationship to parent GPT-001  
✅ Consistent with project ticket naming (GPT-XXX)

---

## Dependency Graph Update

### Updated Foundation Phase

```
Phase 0: Audit + Quick Wins
├── GPT-001: Audit (DONE)
├── GPT-001-001: Register handlers
├── GPT-001-002: .env.example
├── GPT-001-003: Constants
├── GPT-001-004: .gitignore
├── GPT-001-005: Migration plan doc
└── GPT-001-006: Error codes

Phase 1: Foundation (Week 1)
├── GPT-002: Add Supabase SDK (depends: 001-002, 001-004)
├── GPT-003: chromeStorageAdapter (depends: 002)
├── GPT-004: supabaseWithRetry (depends: 002, 001-003, 001-006)
├── GPT-005: requireAuth (depends: 002, 001-006)
├── GPT-006: Message types alignment
└── GPT-009: SQL schema + RLS (depends: 002)
...
```

---

## Risk Assessment

### Potential Issues

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Sub-tickets delay main tickets** | LOW | MEDIUM | All sub-tickets < 1h each, ~4-5h total |
| **Duplication with main tickets** | LOW | LOW | Validated against all GPT-002 to GPT-038 |
| **Standards violation** | NONE | N/A | All tickets follow template strictly |
| **Scope creep** | LOW | LOW | All tickets are prerequisite/planning only |

---

## Final Validation Checklist

- [x] No duplication with GPT-002 to GPT-038
- [x] All tickets follow project template
- [x] Parent ticket (GPT-001) explicitly referenced
- [x] Naming convention GPT-001-XXX applied
- [x] Timebox < 2h each (quick wins)
- [x] Dependencies mapped to main tickets
- [x] All tickets address audit-identified gaps
- [x] Standards compliance verified

---

## Recommendation

✅ **APPROVED TO PROCEED**

**Next Steps**:
1. Execute GPT-001-001 to GPT-001-006 in parallel (team can split)
2. Validate completion (all 6 sub-tickets done in ~1 day max)
3. Proceed to GPT-002 (Foundation phase)

**Estimated Impact**:
- Time investment: 4-5 hours
- Value: Prevents technical debt, cleaner implementation
- Risk: Minimal (all prerequisites/planning)

---

**Reviewed by**: AI Coding Agent  
**Date**: January 23, 2026  
**Status**: ✅ COMPLETE & APPROVED
