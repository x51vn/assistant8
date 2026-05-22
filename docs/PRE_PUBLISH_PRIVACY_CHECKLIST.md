# Pre-Publish Privacy Checklist

Use this checklist before publishing the repository or opening it to public access.

## 1. Secrets And Credentials

- [ ] Confirm `.env` and local secret files are not tracked (`git ls-files .env`).
- [ ] Confirm no hardcoded tokens/keys in source and docs.
- [ ] Rotate any credential that was exposed in local screenshots, logs, or shared terminal history.

## 2. Generated And Runtime Data

- [ ] Remove generated test artifacts from git (especially `tests/e2e/reports/**`).
- [ ] Confirm browser-profile test folders are ignored and not tracked (`test-user-data-*`).
- [ ] Confirm build output is ignored and not tracked (`dist/`, `build/`, `out/`).

## 3. Personal Data And Internal Metadata

- [ ] Remove internal audit files not meant for public release (local paths, branch strategy, internal notes).
- [ ] Verify legal contact details are intentionally public and current.
- [ ] Review screenshots/docs for accidental exposure of email, account IDs, or session details.

## 4. Privacy Documentation Consistency

- [ ] Ensure privacy policy matches actual data flows in code.
- [ ] Ensure permission justifications match real extension behavior.
- [ ] Ensure retention and deletion behavior in docs matches implementation.

## 5. Final Validation

- [ ] Run `git status` and confirm only intended files remain.
- [ ] Run `git ls-files | Select-String 'tests/e2e/reports|test-user-data'` and verify no sensitive tracked artifacts.
- [ ] Run a final manual review of changed files before pushing.
