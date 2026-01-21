---
name: commit-branch-push
description: Create a new branch based on current changes, commit ALL changes with a message derived from the diff, then push to origin.
argument-hint: "baseBranchHint='main|master|develop' remote='origin' includeTicketKey='auto|off' commitTypeMode='conventional' "
agent: "agent"
---

You are assisting with a disciplined Git commit flow: branch → commit all → push.
You must derive branch name and commit message from actual changes (git diff). No guessing.

## Inputs (ask only if missing AND blocking)
- baseBranchHint: ${input:baseBranchHint:Expected main branch name (main/master/develop) (optional)}
- remote: ${input:remote:Remote name (default: origin)}
- includeTicketKey: ${input:includeTicketKey:auto|off (default: auto)}
- commitTypeMode: ${input:commitTypeMode:conventional (default)}

## Non-negotiable rules
- Create a NEW branch (never commit directly on main/master unless explicitly requested).
- Commit ALL changes (tracked + untracked) unless a secret-risk is detected.
- No fabricated facts: branch name + commit message must be supported by git status/diff evidence.
- Prefer Conventional Commits format: <type>(<scope>): <summary> (optional body). (types: feat|fix|refactor|perf|test|docs|chore|build|ci)
- Branch naming: use prefixes (feature/bugfix/hotfix/refactor/docs/chore/test), lowercase, hyphen-separated words, no spaces. 
- STOP if you detect likely secrets in diffs (private keys, api_key, password=, tokens). Ask to fix/undo before proceeding.

## Procedure (execute in order)

### Step 0 — Repo sanity
Run:
1) git rev-parse --show-toplevel
2) git status --porcelain
3) git branch --show-current
4) git remote -v

If not a git repo: STOP.

### Step 1 — Inspect changes (evidence)
Run:
1) git diff --name-status
2) git diff
3) If there are untracked files: git status --porcelain and include them in planning.

Derive:
- Primary change intent (feature/bugfix/refactor/docs/test/build/ci/chore)
- Scope: closest common directory or subsystem (e.g., "auth", "popup", "content-script", "service-worker", "api", "ui", "build")
- Short summary: 3–7 words describing the change outcome
- If includeTicketKey=auto: detect a ticket key pattern like ABC-123 from:
  - branch name (if any), commit templates, PR text files, or changed content
  - If none found: omit ticket key.

### Step 2 — Secret scan (stop if risky)
Scan git diff content for high-risk patterns (case-insensitive):
- "BEGIN PRIVATE KEY", "PRIVATE KEY-----"
- "password=", "passwd", "api_key", "apikey", "secret", "token="
If suspected secret exists: STOP and report exact file/line context (no copying full secret).

### Step 3 — Create branch name from changes
Branch format:
- <prefix>/<scope>-<summary> OR <prefix>/<ticket>-<scope>-<summary> if ticket exists
Rules:
- prefix mapping:
  - feat -> feature
  - fix -> bugfix (or hotfix if urgent production patch is evident)
  - refactor -> refactor
  - test -> test
  - docs -> docs
  - build|ci -> ci
  - chore -> chore
- scope: lowercase, hyphenate
- summary: lowercase, hyphenate, max ~40 chars

Example:
- feature/popup-add-search
- bugfix/ABC-123-content-script-null-guard

Commands:
1) current_branch=$(git branch --show-current)
2) If current_branch is main/master (or equals baseBranchHint): you MUST create a new branch.
3) Create branch from current HEAD:
   - git checkout -b <new-branch>

### Step 4 — Stage ALL changes
Run:
1) git add -A
2) git diff --cached --stat
3) git diff --cached

If staged diff is empty: STOP.

### Step 5 — Generate commit message from diff (Conventional Commits)
Commit message rules:
- Subject: <type>(<scope>): <summary>
  - type derived from primary intent (feat/fix/refactor/test/docs/build/ci/chore)
  - scope = derived scope
  - summary = outcome-focused, imperative mood, <= ~50 characters if possible
- Body (optional, recommended if non-trivial):
  - What changed (bullet)
  - Why (bullet)
  - Risks/compatibility notes (bullet)
  - Verification steps (commands)

If a ticket key exists, include it as:
- Either prefix in subject: "ABC-123 feat(scope): ..." OR
- Footer line: "Refs: ABC-123"
Pick one style and be consistent.

Command:
- git commit -m "<subject>" -m "<body>"

### Step 6 — Push
Run:
1) git push -u <remote> HEAD
2) git log -1 --oneline

### Step 7 — Final report (concise)
Return:
- new branch name
- commit hash + subject
- pushed status (remote/branch)
- any risks/limitations + verification reminders
