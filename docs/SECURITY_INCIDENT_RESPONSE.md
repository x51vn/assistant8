# Security Incident Response

## Extension Signing Key Exposure

`dist.pem` is a Chrome extension private signing key. If a `*.pem` signing key is ever committed, pushed, shared, or included in an archive outside the local machine, treat it as exposed.

### Required Response

1. Remove the key from Git tracking with `git rm --cached <key-file>`.
2. Keep `*.pem` ignored so regenerated local keys are not staged again.
3. Rotate the extension signing key before the next release if the key was pushed or shared.
4. Document the new extension ID impact, because changing the signing key can change the unpacked extension ID.
5. Consider Git history purge only after coordinating with anyone who has cloned the repository.

### Important Limitation

Updating `.gitignore` prevents future accidental staging, but it does not remove files already tracked by Git and it does not revoke a key that has already been exposed.

### Current Baseline

The `repo-hygiene-quality-baseline` change removes `dist.pem` and generated package/profile artifacts from Git tracking and adds a repository hygiene check to prevent recurrence.
