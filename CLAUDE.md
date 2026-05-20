# Charnley Family Finance — App Build Guide

## Project Overview
A personal finance management (PFM) web app for the Charnley family (Brenton + Shelley).
All data lives in `localStorage` — no server, no accounts, fully private.
Target: iOS Safari (home-screen PWA) + desktop Chrome/Safari.

---

## Design System Reference
Source of truth: `charnley-design-system.pdf`

### Color Tokens
```css
/* Dark (default) */
--n950:#080C18  /* page bg */        --n900:#0D1225
--n800:#111830  /* card */           --n700:#18213E  /* card2 */
--n600:#1E2A4A  /* card3 */         --n300:#6278A0  /* muted text */

/* Brand */
--primary:#F0538A    /* pink — CTAs, active nav, highlights */
--purple:#818CF8

/* Semantic */
--success:#00C896    /* income, goals achieved, safe budget */
--warn:#F59E0B       /* budget 70-99%, upcoming bills */
--danger:#EF4444     /* exceeded budget, overdue, negative */
```

Additional themes: `light`, `mint`, `ocean` — all defined via `[data-theme]` on `<html>`.

### Typography
| Role | Font | Weight | Size |
|------|------|--------|------|
| Display / headings | Sora | 600–700 | 42px → 17px |
| Body | DM Sans | 400–600 | 15px |
| All currency & numbers | DM Mono | 500 | varies |

**Rule:** Every `$` amount must use `font-family: var(--font-mono)`. Tabular numbers = financial trust.

### Spacing (8pt grid)
`4 · 8 · 12 · 16 · 24 · 32 · 48 · 64px`

### Radii
`--radius:16px  --radius-sm:10px  --radius-lg:20px  --radius-pill:9999px`

### Touch Targets
Minimum **44×44px** on all interactive elements (Apple HIG).

---

## Existing App — Current State
**File:** `charnley-finance_29.html` (~9,500 lines, single-file)

### Pages Implemented
| ID | Page | Description |
|----|------|-------------|
| `dashboard` | Dashboard | Net worth, stat KPIs, income/expense chart |
| `transactions` | Income & Expenses | Full transaction log, add/edit/delete |
| `transfers` | Transfers & Reconciliation | Internal transfers, excluded from budgets |
| `bills` | Bills & Due Dates | Recurring bills, mark paid |
| `mortgage` | Mortgage & Home | Offset calculator, equity tracker |
| `cash` | Cash Balance Tracker | Monthly balances across 4 accounts |
| `insurance` | Insurance | Policies, premiums, renewal dates |
| `super` | Superannuation | Balances + projections (Brenton & Shelley) |
| `tax` | Tax Liability Tracker | Estimated tax, BAS payments |
| `assets` | Total Assets | Net worth: bank + super + property + equities |
| `forecast` | Cash Flow Forecast | Projected income/expenses from recurring patterns |
| `bva` | Budget vs Actuals | Compare budget to actual spend |
| `categories` | Categories | 16 cats / 83 subcats, fully editable |
| `export` | Export Data | CSV/JSON download |

### Data Architecture (localStorage)
```js
const K = {
  tx:        'cff_tx',          // transactions []
  budgets:   'cff_budgets',     // { catId: amount }
  goals:     'cff_goals',       // savings goals []
  bills:     'cff_bills',       // recurring bills []
  mortgage:  'cff_mortgage',    // mortgage config {}
  ct:        'cff_ct',          // cash tracker data {}
  ctcfg:     'cff_ctcfg',       // cash tracker config {}
  ins:       'cff_ins',         // insurance policies []
  superdata: 'cff_super',       // super data {}
  pins:      'cff_pins',        // PIN hashes {}
  categories:'cff_categories',  // custom categories []
  lbudgets:  'cff_lbudgets',    // linked budgets {}
  rules:     'cff_rules',       // merchant→category auto-rules {}
  recurring: 'cff_recurring',   // recurring transactions []
  transfers: 'cff_transfers',   // transfers []
  tax:       'cff_tax',         // tax data {}
  equities:  'cff_equities',    // equity holdings []
}
```

### Profiles
Two profiles: **Brenton** and **Shelley** — each with PIN protection.
Shared data (mortgage, bills, cash tracker) is profile-agnostic.
Transactions are tagged `person: 'brenton' | 'shelley'`.

---

## Architecture Plan

### Phase 1 — Foundation & Mobile Hardening
1. **PWA shell** — Add `manifest.json` + service worker for iOS "Add to Home Screen"
   - App icon, splash screen, `display: standalone`
   - Offline capability (cache app shell; data always localStorage)
2. **File split** — Break monolithic HTML into:
   ```
   index.html          ← shell, nav, modals
   css/tokens.css      ← design tokens, themes
   css/components.css  ← all component styles
   css/layout.css      ← grid, responsive rules
   js/storage.js       ← load/save/migrate helpers
   js/data.js          ← state variables, defaults
   js/auth.js          ← PIN/profile logic
   js/app.js           ← page routing, init
   js/pages/           ← one file per page
   ```
3. **Bottom tab bar (mobile)** — Replace hamburger with 5-item bottom nav + FAB
   - Home · Transactions · [+ FAB] · Budget/Goals · More
4. **iOS safe area insets** — `env(safe-area-inset-*)` for notch/home-bar

### Phase 2 — Core Feature Polish
5. **Transaction entry** — Optimised mobile sheet (swipe-up drawer)
   - `type="number"`, `inputmode="decimal"`, `type="date"` for keyboard optimisation
   - Quick-amount chips ($50, $100, $200)
6. **Dashboard** — Hero card (net worth) + 4 stat chips + 6-month chart
7. **Budget page** — Traffic-light progress bars, monthly reset
8. **Goals** — Visual savings goal cards with progress rings

### Phase 3 — Australian-Specific Features
9. **Mortgage calculator** — Offset impact, redraw, extra repayments
10. **Superannuation** — Balance tracker + retirement projection
11. **Tax tracker** — FY tax estimate, BAS payments
12. **Equity holdings** — Shares/ETFs with AUD cost base

### Phase 4 — Enhancements
13. **CSV import** — Bank statement import with auto-categorisation rules
14. **Recurring detection** — Auto-detect repeating transactions
15. **Forecast** — 3/6/12-month projection
16. **Export** — CSV + JSON backup/restore

---

## Coding Standards

### HTML
- `lang="en-AU"` on `<html>`
- All `<input type="number">` for amounts, `inputmode="decimal"`
- All `<input type="date">` for dates (prevents iOS zoom)
- Min 44px height on all interactive elements

### CSS
- Mobile-first: base styles → `@media (min-width: 760px)` for desktop
- Use CSS custom properties exclusively — no hard-coded colours
- BEM-lite naming: `.card`, `.card--hero`, `.card__title`
- No `!important` unless overriding third-party

### JavaScript
- Vanilla JS only (no frameworks) — keeps the app self-contained and fast
- `load(key)` / `save(key, val)` wrappers around localStorage (already exist)
- All currency formatted as: `new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(n)`
- All amounts stored as numbers (not strings)
- Dates stored as `YYYY-MM-DD` strings

### Charts
- Chart.js 4.x (CDN, already wired) — graceful fallback if CDN fails
- Chart colours follow design tokens — never hard-coded hex in JS

---

## Mobile Responsive Rules
| Breakpoint | Layout |
|------------|--------|
| < 760px | Single column, bottom tab nav, FAB, full-width cards |
| ≥ 760px | Sidebar nav (240px) + content area, 2-col card grids |

- Sidebar hidden on mobile, replaced by bottom tab bar
- Modals/drawers use `position:fixed` with safe-area padding
- Tables become scrollable horizontally on mobile (already done)
- Font size floor: `16px` on inputs (prevents iOS auto-zoom)

---

## Security & Privacy
- **All data in localStorage** — never leaves the device
- PIN protection per profile (4-digit, hashed)
- Lock on tab hide (`visibilitychange`) — scrubs in-memory state
- No analytics, no external calls except Google Fonts + Chart.js CDN
- Export files are local download only

---

## File Naming Convention
```
charnley-finance_XX.html   ← version iterations of the monolith (reference only)
index.html                 ← production entry point (new multi-file build)
manifest.json              ← PWA manifest
sw.js                      ← service worker
css/                       ← stylesheets
js/                        ← scripts
assets/icons/              ← app icons (192px, 512px)
```

---

## Key Design Decisions (locked)
1. **Dark theme default** — better for evening financial review
2. **localStorage only** — privacy is non-negotiable
3. **Vanilla JS** — no build step, open in any browser
4. **AUD currency** — `en-AU` locale throughout
5. **Two profiles** — Brenton + Shelley, separate PINs, shared household data
6. **DM Mono for numbers** — non-negotiable for financial UX trust
7. **FAB for add transaction** — fastest path to the most common action

---

## Confirmed Decisions
- [x] **Multi-file** — Split into `css/` + `js/pages/` structure
- [x] **PWA** — Installable on iOS home screen, own icon + splash screen
- [x] **New features** — Added on demand, not pre-built speculatively
- [x] **Third profile** — Add "Joint" view (merges Brenton + Shelley data)
- [x] **Theme** — Follows iOS `prefers-color-scheme` (dark/light system setting)
- [x] **Offline** — Full service worker cache, works with no internet after first load
- [x] **Starting point** — Evolve existing HTML (extract + reorganise, don't rewrite logic)

## File Structure (target)
```
index.html              ← app shell, nav skeleton
manifest.json           ← PWA manifest (name, icons, display:standalone)
sw.js                   ← service worker (cache-first for app shell)
assets/
  icons/
    icon-192.png
    icon-512.png
    apple-touch-icon.png
css/
  tokens.css            ← design tokens + all [data-theme] overrides
  components.css        ← buttons, cards, badges, progress, table, forms
  layout.css            ← sidebar, bottom nav, FAB, page grid, responsive
js/
  storage.js            ← load() / save() / migrate() helpers
  data.js               ← all state vars (TX, BUDGETS, GOALS…), K keys
  auth.js               ← PIN logic, profile selection, lock/unlock
  app.js                ← router (go()), init, theme, toast, chart helpers
  pages/
    dashboard.js
    transactions.js
    transfers.js
    bills.js
    mortgage.js
    cash.js
    insurance.js
    super.js
    tax.js
    assets.js
    forecast.js
    bva.js
    categories.js
    export.js
```
