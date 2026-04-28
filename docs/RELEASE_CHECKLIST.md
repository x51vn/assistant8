# Release Checklist

Run this checklist before packaging or submitting a Chrome Web Store build.

## Repository Hygiene

- [ ] Confirm no generated browser profiles, reports, CRX packages, or PEM files are tracked:
  `npm run check:repo-hygiene`
- [ ] If `dist.pem` or any credential-like artifact was ever pushed, follow
  `docs/SECURITY_INCIDENT_RESPONSE.md` before release.

## Verification

- [ ] Build: `npm run build`
- [ ] Unit tests: `npm run test:unit:run`
- [ ] OpenSpec validation: `npm run check:openspec`
- [ ] Extension smoke: `npm run smoke:extension`

CI runs the same quality gate in `.github/workflows/quality.yml`:

- `npm run check:repo-hygiene`
- `npm run build`
- `npm run test:unit:run`
- `npm run check:openspec`
- `npm run smoke:extension`

## Chrome Web Store Readiness

- [ ] Review permissions and host permissions against `src/extension/manifest.json`.
- [ ] Confirm `privacy-policy.html` and `terms-of-service.html` are copied into `dist`.
- [ ] Capture screenshots from the current side panel UI.
- [ ] Confirm the public privacy policy URL is live.
- [ ] Confirm data export and account deletion flows still work.

## Packaging

- [ ] Create a fresh build after all checks pass.
- [ ] Package only `dist` output and required store assets.
- [ ] Do not commit generated `.crx`, `.pem`, browser profiles, or E2E report output.
