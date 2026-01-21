# GitHub Copilot — Engineering Principles (Repo-wide)

## 1) Documentation placement (Markdown)
- When creating NEW Markdown files, ALWAYS place them under `docs/`.
- NEVER create new Markdown files at repository root.
- If the user does not specify a path for a new Markdown file, default to `docs/<topic>/<name>.md`.

## 2) Reuse before create
- DO NOT create a new file/function/class if an equivalent or similar one already exists.
- Before adding anything new, search the codebase for existing candidates and prefer:
  1) reuse,
  2) extend,
  3) refactor minimally.
- If you still propose creating something new, you MUST justify why reuse is not viable and reference the closest existing artifacts (files/symbols).

## 3) Coding principles (SOLID + common best practices)
- STRICTLY follow SOLID principles and common best practices (DRY, KISS).
- Avoid unnecessary abstraction. Prefer clear, testable design.

## 4) Structured thinking (mandatory)
For non-trivial tasks, ALWAYS respond in this structure:
1) Goal & constraints (explicit)
2) Options (2–3 approaches) + trade-offs
3) Decision (pick best-fit for this repo) + rationale
4) Implementation plan (smallest safe diff)
5) Verification plan (how to build/test/validate)

## 5) Best solution with maintainability & scalability
- Choose the best solution while prioritizing maintainability, readability, and extensibility.
- Prefer minimal, reversible changes; avoid large refactors unless explicitly requested.
- When introducing behavior changes, update/add tests where appropriate.

## Data integrity
- Do not fabricate file contents, APIs, metrics, or dependencies.
- Ask clarifying questions only if truly blocking progress.
