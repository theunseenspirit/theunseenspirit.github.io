# Security Review

## Summary
- Overall risk level: Medium before fixes; Low-to-Medium after fixes.
- Main risks found: vulnerable local dev dependencies; health dashboard encrypted payload could be rebuilt with too-short passwords, and generated password instructions encouraged putting the secret in shell history.
- Main fixes applied: replaced `live-server` with a small Node static server that blocks path traversal; removed vulnerable dependency chain; updated dependency lockfile through `npm audit fix`; raised health payload password minimum to 32 characters; changed password handling instructions to use secure PowerShell input.
- Tests added: static server traversal/security tests; health data password and KDF validation tests.

## Confirmed Findings

### SEC-001
- Severity: P2
- File(s): `projects/human-evolution-skull-comparison/package.json`, `projects/human-evolution-skull-comparison/package-lock.json`, `projects/human-evolution-skull-comparison/scripts/serve-public.mjs`, `projects/human-evolution-skull-comparison/scripts/serve-public.test.mjs`
- Issue: `npm audit` reported high and moderate vulnerabilities through local dev tooling, mainly `live-server` and transitive packages (`braces`, `chokidar`, `http-auth`, `uuid`) plus `tmp` through build tooling.
- Exploit scenario: A malicious or malformed local file/path processed by vulnerable dev tooling could cause resource exhaustion or unsafe temporary path behavior during local development/build workflows. This is not remotely reachable from the deployed static site, but it is real developer-environment risk.
- Fix: Removed `live-server`, replaced it with a minimal Node static server, added path traversal rejection and `nosniff` responses, and ran `npm audit fix` to update the remaining vulnerable transitive `tmp` package.
- Test coverage: `npm test` verifies path traversal requests are rejected and normal static files are served with `X-Content-Type-Options: nosniff`.
- Residual risk: The custom server is intentionally minimal and does not provide live reload. It is for local preview only.

### SEC-002
- Severity: P2
- File(s): `scripts/build-health-data.mjs`, `scripts/generate-health-password.mjs`, `scripts/health-data-security.test.mjs`
- Issue: The encrypted health payload is public by design, so password strength is the primary control. The build script accepted 16-character passwords, and the generator suggested assigning the password directly in a shell command, which can persist in shell history.
- Exploit scenario: If a short or reused password were used, an attacker could download `health-dashboard/data/health-data.enc.json` and attempt offline cracking. If the generated password were pasted directly into shell history, local history or logs could expose it.
- Fix: Required at least 32 characters for `HEALTH_DASHBOARD_PASSWORD`, reject any `--password` CLI argument even if empty, refactored validation for testability, and changed generator instructions to use `Read-Host -AsSecureString`.
- Test coverage: `node scripts/health-data-security.test.mjs` verifies password length enforcement, invalid PBKDF2 iteration rejection, and CLI password rejection.
- Residual risk: Client-side encryption on a public static site still allows offline password guessing. Keep using high-entropy generated passwords and rotate/rebuild the encrypted payload if the old password may have been weak or exposed.

## Dependency / Tool Findings
- Tool run: `npm audit --audit-level=moderate` in `projects/human-evolution-skull-comparison`.
- Result: Initially found 9 vulnerabilities (5 high, 4 moderate). After removing `live-server` and running `npm audit fix`, result is 0 vulnerabilities.
- Action taken: Removed vulnerable dev server dependency; lockfile updated; added local static server and regression tests.
- Tool run: regex secret scan with `rg` for common API keys, private keys, GitHub tokens, OpenAI-style keys, Slack tokens, and JWT-like tokens.
- Result: No matches.
- Action taken: No secret rotation required based on repository scan.
- Tool run: targeted dangerous-pattern grep for `innerHTML`, URL state, storage, fetch, crypto, password, token, and related browser sinks.
- Result: Reviewed first-party static JS paths. Existing dynamic HTML in the health dashboard escapes untrusted labels/values; calculator dynamic tables are numeric/static derived; skull viewer URL params are normalized to known species IDs.
- Action taken: No XSS/open redirect fixes required.
- Tool run: `Get-Command gitleaks`, `Get-Command semgrep`, `Get-Command trivy`.
- Result: These tools were not installed locally.
- Action taken: Used npm audit plus targeted grep/manual review. No container/IaC scan was applicable because no Docker/Kubernetes/Terraform/workflow files were present in this working tree.

## Secrets
- Were secrets found? no.
- The repository contains `health-dashboard/data/health-data.enc.json`, an encrypted public payload. I did not print or inspect decrypted health data.
- Rotation recommendation: rebuild the encrypted payload with a new generated password if the previous password was shorter than 32 characters, reused elsewhere, or pasted into shell history/logs.

## Deferred Recommendations
- Add strict Content Security Policy coverage to the non-health static pages where practical. The health dashboard already has a CSP meta tag; the other static pages rely mostly on same-origin assets and browser defaults.
- Consider documenting the public-encrypted-data threat model near the health dashboard link so future edits do not accidentally treat client-side password gating as server-side authentication.
- If GitHub Pages deployment headers become configurable through a different hosting layer, add site-wide `X-Content-Type-Options`, `Referrer-Policy`, and a CSP header rather than only meta tags.
- If the health dashboard ever accepts uploads or remote data, move parsing/validation into a dedicated schema layer before rendering.

## Commands Run
- `rg --files`: inventoried repository files.
- `git status --short`: checked existing dirty/untracked state.
- `rg` secret-pattern scan: no secrets found.
- `rg` dangerous-pattern scans: reviewed browser sinks and sensitive paths.
- `node -e ... health-dashboard/data/health-data.enc.json`: inspected encrypted payload metadata only; did not decrypt or print data.
- `npm audit --audit-level=moderate`: found dependency vulnerabilities before fixes; passed with 0 vulnerabilities after fixes.
- `npm uninstall live-server --save-dev`: removed vulnerable dev server chain.
- `npm audit fix`: updated remaining vulnerable transitive dependency.
- `npm ls --depth=0`: inventoried npm dependencies.
- `npm explain braces`, `npm explain tmp`, `npm explain uuid`: traced audit findings.
- `node --check scripts/build-health-data.mjs`: passed.
- `node --check scripts/generate-health-password.mjs`: passed.
- `node --check health-dashboard/app.js`: passed.
- `node --check human-evolution-skull-comparison/app.js`: passed.
- `node --check projects/human-evolution-skull-comparison/public/app.js`: passed.
- `node scripts/health-data-security.test.mjs`: passed.
- `npm test` in `projects/human-evolution-skull-comparison`: passed.
- `npm run build` in `projects/human-evolution-skull-comparison`: passed; optional source asset directories were absent, so build scripts skipped regeneration.
