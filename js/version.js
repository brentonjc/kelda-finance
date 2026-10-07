// ═══════════════════════════════════════════════════════════════
//  version.js — single source of truth for the app version
// ───────────────────────────────────────────────────────────────
//  Bump APP_VERSION on every release and add a matching entry to
//  the TOP of APP_CHANGELOG. The version is shown on the login
//  screen (bottom-left) and in Settings › About, so a user can
//  always tell you which build they're running.
//
//  Semantic versioning — MAJOR.MINOR.PATCH:
//    MAJOR  breaking data/UX changes
//    MINOR  new features, backwards-compatible
//    PATCH  bug fixes and small tweaks
//
//  Keep this in step with the service-worker CACHE name in sw.js.
// ═══════════════════════════════════════════════════════════════

var APP_VERSION = '2.7.0';

// Newest first. `date` is ISO YYYY-MM-DD. `notes` is a short list
// of human-readable highlights shown in the Settings history.
var APP_CHANGELOG = [
  {
    version: '2.7.0',
    date: '2026-10-05',
    title: 'Tax (Beta): return worksheet',
    notes: [
      'Enter each employer’s income statement, and see a return worksheet laid out by ATO label, with where every figure came from',
      'Interest comes from your Interest transactions, capital gains from your Equities sales, and deductions from transactions you tag in Spending',
      'Overview shows an estimate of what you’ll pay or get back, and how many sections of the return are ready',
      'Household view puts both returns side by side; they are never added into one tax figure',
      'Export the worksheet as a summary, CSV or printout, or as an agent pack if a tax agent lodges for you',
    ],
  },
  {
    version: '2.6.0',
    date: '2026-10-04',
    title: 'Tax (Beta), off by default',
    notes: [
      'New Tax (Beta) page, hidden until you turn it on in Settings › Beta features. Estimates only, not tax advice, and Kelda can’t lodge',
      'Choose how each person lodges (yourself, a tax agent, or not sure yet) and see the matching ATO due dates, including weekend notes',
      'Track PAYG instalments: amount or rate from your ATO notice, quarterly due dates, statuses and the payments you’ve made',
    ],
  },
  {
    version: '2.5.8',
    date: '2026-10-08',
    title: 'American Express CSV import',
    notes: [
      'American Express CSV files now import. Purchases come in as expenses, and card repayments are filed under Transfers › Credit Card Payment',
      'Cells that run over several lines, such as Amex addresses, no longer split a transaction into broken rows',
      'Title rows above the column headings are skipped, and dates like “8 Oct 2026” are read correctly',
    ],
  },
  {
    version: '2.5.2',
    date: '2026-10-03',
    title: 'Pets category tidy-up',
    notes: [
      'The Pets category has a cleaner internal name. Your pet transactions, budgets and rules move across automatically',
      'Older backups and exports still import into Pets',
    ],
  },
  {
    version: '2.5.1',
    date: '2026-10-01',
    title: 'Smarter built-in categories',
    notes: [
      'Built-in categorisation rules now cover national brands only, so new users don’t inherit one household’s local cafes and providers. Rules already saved on your device are kept as they are',
      'BPAY payments to the Australian Tax Office are filed as Income Tax',
      'Fewer false matches: “velvet” no longer counts as a vet, or “Toyota” as a toy',
      'For new setups: a few dollars at BP is filed as coffee and snacks, Coles and Woolworths are always Groceries, and Apple charges are Apple Subscriptions',
    ],
  },
  {
    version: '2.5.0',
    date: '2026-10-01',
    title: 'Welcome screen',
    notes: [
      'Opening the app now shows a welcome screen with the Kelda logo and a Sign in button, instead of going straight to the PIN keypad',
      'Locking the app still goes straight back to sign-in',
    ],
  },
  {
    version: '2.4.2',
    date: '2026-10-01',
    title: 'New app icon',
    notes: [
      'New Kelda icon and logo on the home screen, browser tab, sidebar and setup screens',
      'Setup screens are readable in light mode',
      'No more “Detection complete” message every time you unlock',
    ],
  },
  {
    version: '2.4.1',
    date: '2026-10-01',
    title: 'Tab bar uses the app font',
    notes: [
      'Tab bar labels now use the app’s font on every phone, instead of the phone’s own system font',
    ],
  },
  {
    version: '2.4.0',
    date: '2026-09-28',
    title: 'Buy and sell shares, with realised gains',
    notes: [
      'Investments shows one row per stock; open it to Buy, Sell or update the price',
      'Buy adds a new parcel with its own date and cost, and brokerage is included in the cost',
      'Sell uses your oldest parcels first, or lets you choose them, and can be entered in US$',
      'Before you save, a sale shows proceeds, cost base and gain, and how much is from parcels held 12 months or more',
      'Vested RSUs are sold vest by vest, costed at the vest price',
      'Each stock lists its sales; delete one to put the units back',
      '"Realised" shows the gain on sales this financial year',
      'Can’t sell more units than you hold, and deleting a sale asks first',
    ],
  },
  {
    version: '2.3.0',
    date: '2026-09-28',
    title: 'Faster share price updates, US$ prices and correct RSU gains',
    notes: [
      'Update Prices shows one row per code: one price updates every holding with that code, including both owners, extra parcels, RSU grants and options',
      'Enter US-listed prices in US$: set the exchange rate once and they’re converted to A$',
      'Paste prices from your broker or a spreadsheet, one "code price" per line (add US$ for US prices)',
      'Unrealised profit now costs RSUs at their vest price instead of $0, so it’s no longer overstated',
      'Options are valued at the price above their strike everywhere, including the vesting cards',
      'Each price shows how old it is, and Investments flags prices not updated in over 30 days',
      'Adding a holding with a code you already hold fills in its current price',
      'Holdings entered without a code can be linked to the matching stock',
      'Editing a holding no longer resets its price date or drops details the form doesn’t show',
      'Phones: the + button and tab bar no longer cover Investments pop-ups, and the RSU vesting table no longer pushes the page sideways',
    ],
  },
  {
    version: '2.2.2',
    date: '2026-09-28',
    title: 'Share and crypto trades no longer counted as spending or income',
    notes: [
      'Payments to and from brokers, crypto exchanges and Vanguard are now filed as Transfers › Investment Transfer, not Capital Gains',
      'Buying shares no longer shows up as spending, and sale proceeds no longer count as income',
      'More Australian platforms recognised: SelfWealth, Pearler, Stake, CoinSpot, Swyftx, BTC Markets and others',
      'Employee share plan (RSU) sale proceeds from Morgan Stanley are now filed as Bonus income',
      'Fewer false matches: Vanguard Super, distributions, Stake.com and words like "mistake" are left alone',
      'Your own category corrections now take priority over the built-in keyword list, as documented',
      'Existing transactions are unchanged; use Rescan to apply the new rules to past imports',
    ],
  },
  {
    version: '2.2.1',
    date: '2026-09-28',
    title: 'Cash Flow Forecast fix',
    notes: [
      'Cash Flow Forecast now shows its charts, summary figures and month-by-month view instead of an empty page',
      'Opening Forecast picks up your latest account balances as the starting balance, so the Cumulative view is ready without pressing Sync',
      'The Forecast how-to guide now explains how the 12-month forecast is worked out',
    ],
  },
  {
    version: '2.2.0',
    date: '2026-09-27',
    title: 'Bills overhaul, Borrowing Power and Investment Property (Beta)',
    notes: [
      'Bills rebuilt with tabs: Overview, All Bills, Calendar and Subscriptions',
      'Bills: edit/delete confirmed bills, per-bill detail drawer with amount history',
      'Bills: calendar month view with .ics export, subscriptions audit for price creep',
      'Bills: due-soon reminders, household "paid by" split, annual-buffer savings link',
      'Borrowing Power calculator moved under a new "Beta Features" nav section',
      'Borrowing calculator: HEM living-expense benchmark now scales with income',
      'New Investment Property (Beta): rental income, expenses, depreciation and tax report',
      'New "Investment Property" category feeds rent and costs into the module',
      'Investment Property: links to Kelda loans so balance, rate and value stay in sync',
      'Full Backup now includes all your data, not just the core set',
      'Restore a backup from the welcome screen; Erase All now clears everything',
    ],
  },
  {
    version: '2.1.1',
    date: '2026-07-26',
    title: 'Version history, borrowing calculator and onboarding fixes',
    notes: [
      'Added a version history view on login and in Settings',
      'Borrowing calculator: corrected expense mapping and HEM benchmarks',
      'Borrowing calculator: stopped sync wiping imported values',
      'Fixed onboarding data not carrying through to the app',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-07-26',
    title: 'First public beta',
    notes: [
      'Full visual refresh with 10 light/dark themes',
      'Guided first-run setup and Quick Start checklist',
      'CSV import, smart transfer detection and auto-categorisation',
      'Net Worth tracking across super, liabilities and equities',
      'Borrowing Power calculator under Calculators',
      'Added semantic version display on login and in Settings',
    ],
  },
];

// ── On-device upgrade tracking ─────────────────────────────────
// Records the version the user last ran so the app can detect an
// upgrade locally (e.g. to show a "what's new" banner later). This
// never leaves the device — it's just another localStorage value.
var APP_VERSION_KEY = 'cff_app_version';

function getLastRunVersion() {
  try { return localStorage.getItem(APP_VERSION_KEY) || null; }
  catch (e) { return null; }
}

// Returns true the first time the app runs after a version bump.
function isFreshUpgrade() {
  var last = getLastRunVersion();
  return last !== null && last !== APP_VERSION;
}

function recordCurrentVersion() {
  try { localStorage.setItem(APP_VERSION_KEY, APP_VERSION); }
  catch (e) { /* storage unavailable — non-fatal */ }
}

// Stamp the running version as soon as this script loads.
recordCurrentVersion();
