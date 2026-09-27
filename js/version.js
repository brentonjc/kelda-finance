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

var APP_VERSION = '2.2.0';

// Newest first. `date` is ISO YYYY-MM-DD. `notes` is a short list
// of human-readable highlights shown in the Settings history.
var APP_CHANGELOG = [
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
