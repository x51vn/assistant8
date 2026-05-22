---
name: commit-and-push
description: Create branch from changes, commit with conventional format, push to origin.
argument-hint: "remote='origin'"
agent: "agent"
---

# Commit & Push Workflow

**Goal**: Branch → Commit ALL changes → Push. Derive names from actual diff.

## Core Rules
1. **Never commit to main/master** - always create new branch
2. **Conventional Commits**: `<type>(<scope>): <summary>`
3. **No secrets** - STOP if detect private keys, passwords, tokens
4. **Evidence-based** - branch/commit message from git diff

---

## Process

### Step 1 — Check Status
```bash
git status --porcelain
git branch --show-current
git diff --name-status
```

### Step 2 — Secret Scan
Scan diff for: `PRIVATE KEY`, `password=`, `api_key`, `secret`, `token=`
If found: **STOP** and report file/line (don't copy secret).

### Step 3 — Create Branch
Format: `<prefix>/<scope>-<summary>`

| Type | Prefix |
|------|--------|
| feat | feature/ |
| fix | bugfix/ |
| refactor | refactor/ |
| docs | docs/ |
| test | test/ |
| chore | chore/ |

Example: `feature/portfolio-add-filter`

```bash
git switch -c <branch-name>
```

### Step 4 — Stage & Commit
```bash
git add -A
git commit -m "<type>(<scope>): <summary>

- What changed
- Why
- Verification: npm test"
```

**Commit Types**: feat|fix|refactor|perf|test|docs|chore|build|ci

### Step 5 — Push
```bash
git push -u origin <branch-name>
```

---

## Quick Examples

```bash
# Feature
git switch -c feature/assets-add-modal
git commit -m "feat(assets): add AssetModal component

- Add form for add/edit assets
- Dynamic fields based on asset type
- Validation for required fields"

# Bugfix
git switch -c bugfix/portfolio-null-check
git commit -m "fix(portfolio): add null guard for empty response

- Handle case when API returns null
- Add default empty array fallback"
```
