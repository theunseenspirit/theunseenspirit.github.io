# @theunseenspirit GitHub Pages

This repository publishes the root project index for
`https://theunseenspirit.github.io/`.

## Live sites

| Site | Live URL | GitHub source | Pages source |
| --- | --- | --- | --- |
| Project index | https://theunseenspirit.github.io/ | `theunseenspirit/theunseenspirit.github.io` | `gh-pages` branch, repository root |
| Health Dashboard | https://theunseenspirit.github.io/health-dashboard/ | `theunseenspirit/theunseenspirit.github.io` | `gh-pages` branch, `health-dashboard/` |
| Hominin Skulls | https://theunseenspirit.github.io/human-evolution-skull-comparison/ | `theunseenspirit/human-evolution-skull-comparison` | `main` branch workflow, `public/` |
| Prop Firm Calculator | https://theunseenspirit.github.io/prop-firm-calculator/ | `theunseenspirit/prop-firm-calculator` | `main` branch, repository root |

## Local preview

From this repository root:

```powershell
python -m http.server 8080
```

Then open `http://127.0.0.1:8080/`.

## Health data

The Health Dashboard is static and public. It only ships an encrypted payload at
`health-dashboard/data/health-data.enc.json`; raw Apple Health exports stay out
of Git.

Useful commands:

```powershell
node scripts/generate-health-password.mjs
node scripts/build-health-data.mjs --input "C:\Users\zacha\Downloads\export\apple_health_export"
node scripts/health-data-security.test.mjs
```

Use a generated passphrase of at least 32 characters and set it through
`HEALTH_DASHBOARD_PASSWORD`. Do not pass the password as a command-line
argument.

## Release checks

Before pushing this root Pages repo:

```powershell
node --check scripts/build-health-data.mjs
node --check scripts/generate-health-password.mjs
node --check health-dashboard/app.js
node scripts/health-data-security.test.mjs
```

The standalone project repos under `projects/` are separate Git repositories and
should be committed, pushed, and verified independently.
