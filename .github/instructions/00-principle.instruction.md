---
applyTo: "**/*"
---

# Core Principles (All Files)

## 1. Reuse First
- Search existing code before creating new
- Prefer: (1) reuse → (2) extend → (3) minimal refactor
- If creating new: justify and cite nearest existing pattern

## 2. Code Quality
- SOLID / DRY / KISS
- Clarity > cleverness
- Easy to read, test, maintain

## 3. Minimal Safe Change
- Smallest diff that solves the problem
- Backward compatible by default
- Easy rollback

## 4. Evidence-Based
- No fabricated facts
- Cite file:line for claims about codebase
- Ask only if truly blocked

## 5. Documentation
- New markdown files → `docs/` folder only
- Update tests when changing behavior
