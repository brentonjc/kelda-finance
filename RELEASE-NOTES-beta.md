# Kelda Finance — Beta Release Notes

**Build date:** 23 July 2026
**Covers changes from:** 11 June – 23 July 2026
**Platform:** iOS Safari (Add to Home Screen) + desktop Chrome/Safari

Thanks for helping test Kelda Finance! This is a big update — the app has had a full visual refresh, a new onboarding flow, faster transaction handling, and several new tracking modules. Everything still runs entirely on your own device; no data leaves your phone or laptop.

Here's what's new since the last build.

---

## ✨ New & Redesigned

### Fresh look, top to bottom
- **New dashboard** — a clean tile-grid layout with a layout switcher so you can arrange it your way. Tiles now scroll instead of cutting off when there's a lot to show.
- **Time-period filter** — Last Month / Year to Date / Last Year pills that recompute the cashflow and budget tiles, not just the highlight.
- **Live forecast chart** — the dashboard forecast is now driven by your real projected income and expenses instead of a placeholder.
- **Bank-account manager** — show or hide accounts that don't have an active balance to keep the view clean.
- **New navigation** — a static top bar plus a collapsible side rail with fly-out menus. You can now **pin the pages you use most** for one-tap access.
- **Redesigned login / home screen** — a profile picker (per-person and Joint views), PIN entry, and an at-a-glance data-health check.
- **New icon set** — every emoji has been replaced with crisp, consistent Tabler icons across all pages.
- **Collapsible sidebar sections** — group and collapse the navigation how you like; your layout is remembered between sessions.
- **Personalised greeting** and friendlier in-app toast notifications.

### Themes
- **10 looks to choose from** — 5 colour palettes, each in light and dark mode.
- **Light/dark toggle** now always available in the top bar.
- The login screen stays in dark mode for a consistent first impression.

### Onboarding
- **Guided first-run setup** to get you up and running quickly.
- **Quick Start checklist** — a "Getting Started" guide that walks you through the key setup steps and tidies itself away once you're done.
- **Restore from backup** directly on the onboarding screen if you're moving devices.

---

## 🆕 New Tracking Features

- **Upload Transactions page** — import bank statements via CSV, with improved import handling. CSV import is now reachable from both the Transactions tab and the dashboard's "Add transaction" button.
- **Manual transaction entry** — add one-off transactions from a quick modal.
- **Smart transfer detection** — automatically spots internal transfers between your accounts so they don't distort your budgets (with an undo option if it gets one wrong).
- **Smarter auto-categorisation** — an upgraded engine for sorting transactions into the right categories.
- **Smarter recurring-bill detection** — bills are now identified with frequency and confidence scoring and merchant-name matching, you can dismiss ones you don't want tracked, and there's a new annual-buffer figure to help you set aside for them.
- **Notifications & recommended actions** — a new notifications panel surfacing insights and suggested next steps.
- **Income insights** — new income-category charts with clickable drill-down to see what's behind each number.
- **Investment Property module** (prototype) — early support for tracking an investment property.

---

## 📈 Net Worth & Assets Improvements

- **Net Assets is now "Net Worth"**, with a live snapshot that updates on every change.
- **Monthly Net Worth breakdown table**, with history back-filled from your Cash Tracker.
- **Per-component monthly history** and monthly closing-balance grids for Super, Liabilities, and Equities.
- **Mortgage ↔ Liability linking** — properties now link to their liability records and stay in sync automatically. Mortgage properties can record an acquired date and purchase price.
- **Redesigned Life Insurance page** with an Add Policy modal.

---

## ⚡ Performance

- **Transactions table is ~40% faster to render**, with "load more" windowing so long histories stay snappy.

---

## 🔒 Reliability & Security

- Security hardening, including XSS fixes and safety improvements to the Sankey (flow) chart.
- Fixes to **net worth accuracy**, including liabilities that were counting before their start date.
- Fixed liabilities disappearing after locking/unlocking the app.
- Offline/PWA improvements: proper caching, security headers, and updated app icons for Add to Home Screen.
- App updates now **ask before applying** instead of refreshing on you mid-session.

---

## 🗑️ Removed

- The **Financial Health** feature has been retired.

---

## 📝 Notes for Testers

- **Your data is local only** — it lives in your browser's storage and never leaves your device. Clearing your browser data will erase it, so use the **Export/Backup** option to keep a copy.
- The **Investment Property** module is an early prototype — expect rough edges.
- Please report anything that looks wrong with **net worth totals**, **CSV imports**, or **transfer detection**, as these had the most changes this cycle.

---

*Questions or bugs? Please send them through to the app maintainer.*
