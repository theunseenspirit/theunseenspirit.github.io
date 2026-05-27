# Health Dashboard

This is a static GitHub Pages health dashboard with client-side decryption.

The raw Apple Health export stays local. The build script reads `export.xml`,
keeps daily aggregates and workout summaries, then writes an encrypted payload
to `health-dashboard/data/health-data.enc.json`. Step counts are source-deduped
per day so iPhone and Apple Watch records do not stack into inflated totals;
Apple Watch is used first, with iPhone as the backup source.

## Build encrypted data

From the repo root in PowerShell:

```powershell
node scripts/generate-health-password.mjs
```

Then use the generated password here:

```powershell
$secure = Read-Host "Dashboard password" -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
$env:HEALTH_DASHBOARD_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
node scripts/build-health-data.mjs --input "C:\Users\zacha\Downloads\export\apple_health_export"
Remove-Item Env:\HEALTH_DASHBOARD_PASSWORD
```

Use a long passphrase. The encrypted file is public on GitHub Pages, so a weak
password can be attacked offline. Do not pass the password with a command-line
argument, because command arguments can be exposed through process lists and
shell history.

## Preview

```powershell
python -m http.server 8080
```

Then open `http://localhost:8080/health-dashboard/`.

## Deployment

This dashboard deploys from the root `theunseenspirit.github.io` repository on
the `gh-pages` branch:

```text
https://theunseenspirit.github.io/health-dashboard/
```

The encrypted payload is intentionally public. Security depends on using a
high-entropy private password, keeping raw exports out of Git, and rebuilding the
payload with a new password if the old one was weak or exposed.
