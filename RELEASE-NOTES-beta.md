# Kelda Finance — Beta Release Notes

**Build date:** 23 September 2026
**Version:** 2.2.0
**Covers changes from:** 23 July – 23 September 2026
**Platform:** iOS Safari (Add to Home Screen) + desktop Chrome/Safari

This round is smaller than the last one but focuses on two areas testers flagged: Bills, and a first look at the Borrowing Power calculator. Everything still runs entirely on your own device; no data leaves your phone or laptop.

Here's what's new since the last build (v1.0.0 / 23 July).

---

## ✨ Bills, rebuilt

The Bills page has been restructured around four tabs — **Overview · All Bills · Calendar · Subscriptions** — with a lot more underneath:

- **Edit and delete bills** — confirmed bills can now be corrected or removed. If you delete a detected bill, Kelda remembers and won't re-add it; your edits are treated as the source of truth going forward.
- **Per-bill detail drawer** — tap a bill to see its amount-history sparkline, the detected charges behind it, upcoming occurrences, and one-off overrides for a bill that's different this month.
- **Calendar view** — a full month grid with per-day totals, keyboard navigation, and **Export .ics** so bills can go into your phone's calendar.
- **Subscriptions audit** — flags price creep and dormant subscriptions you're still paying for.
- **Household "paid by" split** — mark who pays each bill, shown as avatar badges with a legend.
- **Annual-buffer → Savings Goal link**, a new "$/month commitment" KPI, and a Cash Demand chart now scaled to real dollars.
- **Due-soon reminders** — a banner for bills coming up, with opt-in browser notifications (all local, nothing leaves the device).
- **Manage dismissed billers** — restore anything you'd previously told Kelda to ignore.
- Trends (Cash Demand, Bill Category Flow, Year on Year) now share one period control — rolling 30/90/365 days, or jump to a specific month/year, same as the Transactions filter.
- Mobile: the recurring-payments table now collapses into stacked cards instead of a cramped horizontal scroll.
- Accessibility: 44px touch targets throughout, better contrast in both themes, chart aria-labels, arrow-key tab navigation, and whole-row click to open bill details.

---

## 🧮 Borrowing Power calculator — now Beta

The Borrowing Power calculator has moved out from under "Calculators" into its own **Beta Features** nav section, labelled **Borrowing Power (Beta)** — same tool, clearer expectations while it's still being tuned.

- **HEM living-expense benchmark now scales with income.** Previously every household got the same minimum-expense floor regardless of income, which understated the benchmark for higher earners. It's now banded (flat below ~$50k, graduated above it, capped at +90%), matching how the real Household Expenditure Measure works.
- Fixed the sync silently wiping your imported income, expenses, cash, super, shares and HECS figures after import (a bug — the success message was showing even though the data underneath had been blanked).
- Fixed transfers (savings top-ups, offset, credit-card/loan payments) being double-counted as both income and expense.
- Fixed several categories being mapped to the wrong HEM bucket (e.g. council rates landing in utilities, children's clothing landing in adult clothing).
- The page now re-syncs from your live app data every time you open it, so it reflects recent changes — without overwriting the loan scenario you've already entered.

---

## 📝 Notes for Testers

- **Your data is local only** — it lives in your browser's storage and never leaves your device. Clearing your browser data will erase it, so use the **Export/Backup** option to keep a copy.
- **Borrowing Power is explicitly Beta** — treat its output as a rough estimate, not financial advice, and let us know if the numbers look off.
- If you already have Kelda installed as a home-screen app, you may need to **fully close and reopen it** (or wait for the "a new version is ready" prompt) to pick up this update.
- Please report anything that looks wrong with **Bills detection/editing**, the **calendar/.ics export**, or **Borrowing Power figures**, as these had the most changes this cycle.

---

*Questions or bugs? Please send them through to the app maintainer.*
