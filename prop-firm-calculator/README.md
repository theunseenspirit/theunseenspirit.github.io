# Prop Firm Calculator

A single-page calculator for estimating prop-firm target odds, drawdown risk, expected value, and sequence risk from a small set of trading assumptions.

## What it models

- Monte Carlo equity paths from win rate, reward/risk, risk per trade, trades per day, fees, and slippage.
- Target-first, drawdown-first, and expired outcomes.
- Static max loss or EOD trailing drawdown.
- Expected value per trade and sensitivity by win rate/risk size.
- Sizing frontier comparisons across nearby risk amounts.

## What it does not model

- Intratrade price movement, MAE/MFE, tick-by-tick path, open P&L, or live order execution.
- Broker-specific rule details beyond the simplified target, max-loss, minimum-day, and drawdown settings.
- A guarantee of funding, payout, or trading performance.

## Local preview

Open `index.html` directly in a browser, or serve the folder with any static file server.

```powershell
python -m http.server 4179
```

Then open `http://127.0.0.1:4179/index.html`.

## Deployment

This repo is intended to publish as a static GitHub Pages site from `main`.
