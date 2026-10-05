# Kelda Finance

Australian family personal finance tracking web app. Import your bank CSVs, and Kelda turns them into budgets, bills, goals, net worth and tax-time views, entirely on your own device.

> **Status:** Beta · **Version:** 2.2.0 (27 September 2026) · **Licence:** [MIT](LICENSE)

---

## Why Kelda

- **Private by design.** All data lives in your browser's local storage. No sign-in, no server-side storage, no error logging. Nothing leaves your phone or laptop.
- **Australian-specific.** Built around Australian household finance: HEM living-expense benchmarks, ATO rental property worksheet categories, Australian financial year (1 July – 30 June), Stage 3 tax rates.
- **Family-oriented.** Multiple household profiles, with "paid by" splits on bills.
- **No bank connection required.** Data comes from CSV uploads. Kelda does not use CDR / Open Banking data feeds.
- **Installable.** Runs as a PWA (Add to Home Screen on iOS Safari; desktop Chrome/Safari).

## Features

| Area | What it does |
|---|---|
| **Transactions** | CSV import, categories, Smart Rules for auto-categorisation, rolling 30/90/365-day or month/year filters |
| **Bills** | Four tabs (Overview, All Bills, Calendar, Subscriptions); detected recurring bills with edit/delete; per-bill detail drawer; month calendar with `.ics` export; subscription audit (price creep, dormant subscriptions); due-soon reminders (local only) |
| **Budgets & Goals** | Budgets, savings goals, annual-buffer link to savings goals |
| **Net worth** | Mortgage, liabilities, investments, cash tracker, insurance, super, net-worth history |
| **Borrowing Power (Beta)** | Borrowing calculator with income-banded HEM benchmark, re-synced from live app data on every open |
| **Investment Property (Beta)** | Per-property setup (ownership split, loan, rent, expenses, depreciation); income and expense ledger; ATO-style tax report per financial year; negative gearing and rough CGT estimates; print-friendly output |
| **Backup & restore** | Full Backup covers all data; restore from the welcome screen on a new device |

Full change history: [RELEASE-NOTES-beta.md](RELEASE-NOTES-beta.md).

## Important disclaimers

- Borrowing Power and Investment Property are **Beta**. Their outputs, including tax figures, are rough guides only and are **not financial, credit or tax advice**.
- Your data exists **only in your browser's storage**. Clearing browser data erases it. Use **Export → Full Backup** regularly.
- Backups taken before v2.2.0 restore, but only contain the older, partial data set. Take a fresh Full Backup after updating.

## Tech stack

- Static site: HTML, CSS and vanilla JavaScript. **No build step.**
- PWA: `manifest.json` and a service worker (`sw.js`) for offline use and install.
- Hosting: Netlify (static publish from repo root).
- Licence: MIT.

## Repository layout

```
.
├── index.html                       # App shell
├── kelda-borrowing-calculator.html  # Borrowing Power (Beta)
├── kelda-investment-property.html   # Investment Property (Beta), embedded via same-origin iframe
├── css/                             # Styles
├── js/                              # Application logic
├── assets/                          # Icons and static assets
├── tests/                           # Tests
├── manifest.json                    # PWA manifest
├── sw.js                            # Service worker
├── netlify.toml                     # Netlify config and security headers
├── RELEASE-NOTES-beta.md            # Beta release notes
└── LICENSE
```

## Running locally

There is nothing to build. Serve the repo root with any static file server:

```bash
git clone https://github.com/brentonjc/kelda-finance.git
cd kelda-finance
python3 -m http.server 8080
# open http://localhost:8080
```

Use `localhost` or HTTPS; service workers will not register over plain HTTP on other hosts.

## Environments and deployment

| Branch | Environment | Purpose |
|---|---|---|
| `main` | Production: `keldafinance.netlify.app` | Live app, used by the maintainer and beta testers |
| `develop` | `keldabetatest` Netlify site | Development and testing |

Deploys are static (`publish = "."`). `netlify.toml` declares this explicitly so deploys do not depend on Netlify UI build settings.

Notable deployment settings:

- `sw.js` is served with `Cache-Control: no-cache` so updates are picked up promptly.
- Security headers on all routes: `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: SAMEORIGIN`. `SAMEORIGIN` (not `DENY`) is required because the app embeds the Investment Property page in a same-origin iframe.
- All paths rewrite to `/index.html` (status 200).

### Updating on a device

If Kelda is installed as a home-screen app, fully close and reopen it, or wait for the "a new version is ready" prompt, to pick up a new release.

## Feedback and bugs

Please use [GitHub Issues](https://github.com/brentonjc/kelda-finance/issues). Areas that changed most in the latest cycle and benefit most from testing: Bills detection/editing, calendar/`.ics` export, Borrowing Power figures, Investment Property tax figures, and Full Backup/restore.

## Licence

[MIT](LICENSE) © 2026 brentonjc
