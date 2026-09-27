# Kelda Finance — Beta Release Notes

**Build date:** 27 September 2026
**Version:** 2.2.0
**Covers changes from:** 23 July – 27 September 2026
**Platform:** iOS Safari (Add to Home Screen) + desktop Chrome/Safari

This round is smaller than the last one but focuses on two areas testers flagged: Bills, and a first look at the Borrowing Power calculator. It also includes an early preview of a new **Investment Property** tool, and **Full Backup now backs up everything**. Everything still runs entirely on your own device; no data leaves your phone or laptop.

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
- Rent tagged with the new **Investment Property** category counts as rental income (shaded to 80%, as lenders do) rather than salary, and the property's costs are left out of your living expenses.

---

## 🏘️ Investment Property — new in Beta

A new **Investment Property** tool sits under **Beta Features → Investment Property (Beta)**. It tracks your rental properties through the year and turns them into a tax-time summary. It's an early preview, so expect some rough edges.

- **Guided property setup** — property details, ownership split, investment loan, rental income, expense schedule, depreciation and capital improvements.
- **Works from your Kelda data** — link a property to a loan from your **Mortgage** or **Liabilities** page and its balance, rate, offset and value stay in sync. Owner names come from your Kelda profiles.
- **Rent and costs from your transactions** — a new **Investment Property** category in Kelda has subcategories that match the ATO worksheet (rent, council rates, water, strata, landlord insurance, repairs, agent fees, land tax, loan interest…). Transactions tagged with it land on the right tax line and replace your estimates for the months already passed; the estimates cover the rest of the year. Your existing categories aren't changed.
- **Dashboard** totalling rental income, deductible expenses and the net result across all your properties.
- **Income & Expenses** — a ledger that fills itself from each property's rent and expense schedule and your tagged Kelda transactions, plus one-off transactions, an annualised rental statement, and a vacancy log for periods the property wasn't available to rent. With more than one property, you choose which one each Kelda transaction belongs to.
- **Tax Report for each financial year** (1 July – 30 June), set out like the ATO rental property worksheet: gross rent, expenses in the ATO's categories (including Div 40 and Div 43 depreciation) and net rental income or loss, per property and combined.
- **Negative gearing estimate** — the estimated refund (or extra tax payable) for each owner, based on their ownership share and that year's tax rates (Stage 3 from 2024–25, and the lower 15% bracket from 2026–27), plus a rough capital gains tax estimate.
- Income-vs-expense and expense-breakdown charts that follow your light/dark theme, and a **print-friendly** report.

---

## 💾 Full Backup now backs up everything

**Export → Full Backup** used to save only part of your data: transactions, budgets, goals, bills, mortgage, cash tracker, insurance and super. It now includes everything — liabilities, investments, categories, Smart Rules, accounts, profile names, net-worth history, your Borrowing Power scenario and Investment Property. Restoring replaces all your data with the backup, then reloads the app.

Backups made before this version still restore, but they only hold that older, partial set.

- **Moving to a new device?** On the welcome screen, tap **Already set up? Restore from backup** and pick your backup file — no need to set up first.
- **Settings → Erase all data** now removes everything Kelda stores on the device, including Investment Property and Borrowing Power data (it previously left some of it behind).

---

## 📝 Notes for Testers

- **Your data is local only** — it lives in your browser's storage and never leaves your device. Clearing your browser data will erase it, so use the **Export/Backup** option to keep a copy.
- **Borrowing Power and Investment Property are explicitly Beta** — treat their output (including the tax figures) as a rough guide, not financial or tax advice, and let us know if the numbers look off.
- **Take a fresh Full Backup after updating** — older backup files only hold part of your data.
- **To try Investment Property with your own figures**, tag a few rent and property-cost transactions with the new **Investment Property** category (a Smart Rule can do it automatically), then pick the property's loan in its **Investment loan** step.
- If you already have Kelda installed as a home-screen app, you may need to **fully close and reopen it** (or wait for the "a new version is ready" prompt) to pick up this update.
- Please report anything that looks wrong with **Bills detection/editing**, the **calendar/.ics export**, **Borrowing Power figures**, **Investment Property tax figures**, or **Full Backup and restore**, as these had the most changes this cycle.

---

*Questions or bugs? Please send them through to the app maintainer.*
