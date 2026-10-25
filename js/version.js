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
//
//  Each entry also feeds "What's new" (js/pages/whatsnew.js):
//    headline   what the user can now do, ≤ 60 chars, second person
//    benefits   2–3 user-facing bullets, ≤ 110 chars each
//    link       optional { page, label }: the Try it button and the
//               nav item that gets a "New" badge
//    requires   optional beta flag the link depends on ('tax')
//    highlight  optional. X.Y.0 releases show the Dashboard card and
//               patches don't; set true for a patch that adds
//               something users want to know about, false for a
//               MINOR that is purely internal
//  `notes` stay the detailed list in Settings › About.
//  Writing guide: docs/specs/whats-new.md §6.
// ═══════════════════════════════════════════════════════════════

var APP_VERSION = '2.11.0';

// Newest first. `date` is ISO YYYY-MM-DD. `notes` is a short list
// of human-readable highlights shown in the Settings history.
var APP_CHANGELOG = [
  {
    version: '2.11.0',
    date: '2026-10-25',
    title: 'What’s new',
    headline: 'See what’s new in Kelda, right on your Dashboard',
    benefits: [
      'After an update, new features show as a card on your Dashboard the first time you open Kelda',
      'Find every update under What’s new in the menu, the bell, or on the sign-in screen',
      'Pages with something new get a New tag until you’ve had a look',
    ],
    notes: [
      'A What’s new card appears on the Dashboard once after a feature update. Dismiss it, or it goes by itself after 14 days',
      'Each person sees it once; dismissing it on your profile doesn’t hide it for anyone else',
      'New What’s new page in the menu, plus a link from the bell and from the version number on the sign-in screen',
      'A New tag marks the page an update added to, until you open it or for 30 days',
    ],
  },
  {
    version: '2.10.1',
    date: '2026-10-25',
    title: 'Tax (Beta): match instalment payments',
    headline: 'Tax (Beta): match each instalment to its payment',
    benefits: [
      'Tax suggests which Spending transaction paid each PAYG instalment',
      'Instalment and tax due dates now show on Bills and in Forecast',
      'Compare your forecast tax with what you’ve paid through instalments and withholding',
    ],
    link: { page: 'tax', label: 'Open Tax (Beta)' },
    requires: 'tax',
    notes: [
      'Match a PAYG instalment to the ATO payment in Spending. Tax suggests the likely transaction under each quarter',
      'Year check on the Instalments tab: your forecast tax against the ATO’s instalments plus withholding',
      'Check your instalments credit against ATO online services in the Return worksheet; the return uses the ATO figure once entered',
      'Instalment and tax payment due dates now show on Bills (read-only) and in Forecast',
      'Pick the payment for a notice of assessment from Spending'
    ]
  },
  {
    version: '2.10.0',
    date: '2026-10-25',
    title: 'Goals keep a history',
    headline: 'Goal finish dates now follow your real pace',
    benefits: [
      'Once you add money to a goal, its finish date is based on that goal’s own pace',
      'Link a goal to any of your accounts, not only the first four',
      'Deleting an account no longer touches its goals. They keep their amounts and stop syncing',
    ],
    link: { page: 'goals', label: 'Open Goals' },
    notes: [
      'Goals now keep a history of the money added to them, ready for one-tap contributions in the next update. Your goals and amounts are unchanged',
      'Finish dates now follow each goal’s own pace once it has contributions. A goal linked to an account counts its month-to-month balance changes',
      'You can link a goal to any of your accounts, not only the first four',
      'Deleting an account keeps its goals and their amounts; they just stop syncing',
      'The goals CSV export adds Type, Owner, Status and Contributions columns'
    ]
  },
  {
    version: '2.9.1',
    date: '2026-10-18',
    title: 'Goals fixes',
    headline: 'Goal dates you can trust',
    benefits: [
      'Finish dates use what you’ve actually saved over the last 3 months, not a guessed $500 a month',
      'Your Dashboard and Goals page now show the same finish date',
      'Deleted a goal by mistake? You have 5 seconds to undo it',
    ],
    notes: [
      'A goal you’ve reached now shows a green bar and a green “Goal reached”, instead of turning amber and then red as you got closer',
      'Finish dates are now worked out from your actual average savings over the last 3 months, split across your unfinished goals, instead of assuming $500 a month',
      'The dashboard’s Goal Projection card and the Goals page now give the same date',
      'Two goals linked to the same account no longer count its balance twice in Total Saved, and each card says the account is shared',
      'Deleting a goal now asks first, and you can undo it for 5 seconds',
      'Fixed: the goals CSV export had empty Target and Saved columns',
    ],
  },
  {
    version: '2.9.0',
    date: '2026-10-18',
    title: 'Balances for cards and loans',
    headline: 'Import a card or loan statement and its balance fills itself in',
    benefits: [
      'Pick a credit card, BNPL, loan or mortgage when you import a bank file with a running balance',
      'Kelda fills in that debt’s monthly balances and current balance for you',
      'Choose “balances only” so repayments already in your bank account aren’t counted twice',
    ],
    link: { page: 'upload', label: 'Import a file' },
    notes: [
      'When you import a bank file with a running balance, you can now pick a credit card, BNPL, loan or mortgage as well as a cash account',
      'Kelda works out whether the file shows the amount owed as a positive or negative balance, then fills in that liability’s monthly balances and updates its current balance',
      'For card and loan files you can sync balances only, so repayments already in your bank account file aren’t counted twice',
      'Cash Tracker accounts and liabilities list every balance read from a bank file, with its date and the file it came from',
      'Fixed: a card file with a balance column now imports purchases as spending when “Positive amounts are spending” is ticked',
    ],
  },
  {
    version: '2.8.0',
    date: '2026-10-11',
    title: 'Tax (Beta): share awards and tax owed in net worth',
    headline: 'Tax (Beta): know what to set aside when your shares vest',
    benefits: [
      'Record each RSU vest and see the tax to put aside on it, and on the next one coming up',
      'Shares sold within 30 days of vesting are handled correctly, even across financial years',
      'Estimated tax owed comes off net worth and borrowing power, labelled as an estimate. You can turn this off',
    ],
    link: { page: 'tax', label: 'Open Tax (Beta)' },
    requires: 'tax',
    notes: [
      'Record each RSU vest from your Equities grant: market value, the exchange rate you used, any sale and whether it matches your ESS statement',
      'Shares sold within 30 days of vesting are taxed at the sale date, which can move the income into the next financial year',
      'See the tax to set aside on each vest and on the next one coming up',
      'Estimated tax owed now shows on Liabilities and comes off net worth and borrowing power, labelled as an estimate. You can turn that off',
      'Enter your notice of assessment to replace the estimate, and mark it paid',
    ],
  },
  {
    version: '2.7.0',
    date: '2026-10-05',
    title: 'Tax (Beta): return worksheet',
    headline: 'Tax (Beta): see your return take shape before you lodge',
    benefits: [
      'A worksheet laid out by ATO label, showing where every figure came from',
      'Interest, capital gains and tagged deductions fill in from what’s already in Kelda',
      'See an estimate of what you’ll pay or get back, and export a pack for your tax agent',
    ],
    link: { page: 'tax', label: 'Open Tax (Beta)' },
    requires: 'tax',
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
    headline: 'Tax (Beta): PAYG instalments and ATO due dates in one place',
    benefits: [
      'See your ATO due dates based on how you lodge, whether yourself or through a tax agent',
      'Track each PAYG instalment, when it’s due and what you’ve paid',
      'Turn it on in Settings › Beta features. Estimates only, not tax advice',
    ],
    link: { page: 'tax', label: 'Open Tax (Beta)' },
    requires: 'tax',
    notes: [
      'New Tax (Beta) page, hidden until you turn it on in Settings › Beta features. Estimates only, not tax advice, and Kelda can’t lodge',
      'Choose how each person lodges (yourself, a tax agent, or not sure yet) and see the matching ATO due dates, including weekend notes',
      'Track PAYG instalments: amount or rate from your ATO notice, quarterly due dates, statuses and the payments you’ve made',
    ],
  },
  {
    version: '2.5.13',
    date: '2026-10-08',
    title: 'Balances from your bank file',
    highlight: true,
    headline: 'Your account balances can now fill themselves in',
    benefits: [
      'When your bank file includes a running balance, Kelda fills in that account’s monthly balances',
      'A check before import shows anything that doesn’t add up, and nothing changes until you’ve reviewed it',
      'Everyone in your household now sees the same net worth',
    ],
    link: { page: 'cash', label: 'Open Bank Accounts' },
    notes: [
      'When a bank CSV has a running-balance column, Kelda can fill in that account’s Cash Tracker balances for you. Pick the account on the column step',
      'A balance check before import shows anything that doesn’t add up, and nothing is synced until you’ve reviewed it',
      'Accounts with no balance entered for the latest month now carry their last known balance instead of counting as $0',
      'Brenton and Shelley now see the same net worth figure',
    ],
  },
  {
    version: '2.5.12',
    date: '2026-10-08',
    title: 'Checkboxes look like checkboxes',
    headline: 'Checkboxes that look like checkboxes',
    benefits: [
      'Checkboxes and options use your device’s own style, in your theme colour',
      'On phones you can tap the label next to a checkbox, not just the box',
    ],
    notes: [
      'Checkboxes and option buttons across the app use your device’s own style, tinted with the theme colour, instead of showing as blank boxes',
      'On phones, the label beside each checkbox can be tapped too',
    ],
  },
  {
    version: '2.5.11',
    date: '2026-10-08',
    title: 'Easier-to-read text in every theme',
    headline: 'Easier to read in every theme',
    benefits: [
      'Status badges, buttons and green, amber and red amounts have stronger contrast in every theme',
    ],
    notes: [
      'Paid, Due, Overdue and other status badges use stronger text colours, so they’re readable in every theme',
      'Buttons and toggles filled with the theme colour use a label colour that stands out from it. In the Kelda dark theme, those labels are now dark',
      'Form labels and other secondary text in the Kelda dark theme are a little lighter',
      'Green, amber and red amounts and labels are darker in the light themes, so income, warnings and overdue figures are easier to read',
      'Links and selected tabs in the Fintech dark theme use a lighter blue',
      'Smart Rules, import tips, Transfers and Settings no longer show dark patches or faint text in the light themes',
    ],
  },
  {
    version: '2.5.10',
    date: '2026-10-08',
    title: 'More accurate categories',
    headline: 'More of your transactions get the right category on their own',
    benefits: [
      '“Purchase at…” and “Online purchase from…” are matched on the shop’s name',
      'A rule you set for Bunnings now covers every Bunnings store',
      'Fewer odd matches: Uber Eats is food delivery, not a taxi',
    ],
    notes: [
      'Transactions worded “Purchase at…”, “Online purchase from…” or “To… receipt number” are now matched on the shop or payee name, so more of them get a category',
      'A category you set for one of these now also covers the same merchant when your bank words it differently, and “Apply to all” offers the shop name instead of “Purchase”',
      'Categories you set in the past now apply to more of your transactions',
      'Transactions that already got a category keep the same one',
      'Your own category for a brand now covers all its stores: a rule for Bunnings applies to “Bunnings (Artarmon)” too',
      'Large deposits are no longer guessed to be Salary. Ones the app can’t recognise are left for you to categorise',
      'Fewer false matches: “Shelley” no longer counts as Shell petrol, or “hospitality” as a hospital',
      'Uber Eats is filed as food delivery, not a taxi, and Coles Express as petrol',
    ],
  },
  {
    version: '2.5.9',
    date: '2026-10-08',
    title: 'Credit card CSV signs',
    headline: 'Card statements with positive spending import correctly',
    benefits: [
      'New “Positive amounts are spending” option for statements that list purchases as positive',
    ],
    notes: [
      'New “Positive amounts are spending” box on the column step, for card statements that list purchases as positive amounts. It is ticked for American Express files and can be unticked',
    ],
  },
  {
    version: '2.5.8',
    date: '2026-10-08',
    title: 'American Express CSV import',
    highlight: true,
    headline: 'Import your American Express statements',
    benefits: [
      'Amex CSV files now import, with purchases as spending and repayments filed as transfers',
      'Addresses that run over several lines no longer break a transaction into pieces',
    ],
    link: { page: 'upload', label: 'Import a file' },
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
// upgrade locally (What's new reads PREV_RUN_VERSION to tell an
// upgrade from a fresh install). This never leaves the device —
// it's just another localStorage value.
var APP_VERSION_KEY = 'cff_app_version';

function getLastRunVersion() {
  try { return localStorage.getItem(APP_VERSION_KEY) || null; }
  catch (e) { return null; }
}

// The version this device ran before this load (null on a fresh
// install). Read before recordCurrentVersion() below overwrites it.
var PREV_RUN_VERSION = getLastRunVersion();

// True when this load is the first run after a version bump.
function isFreshUpgrade() {
  return PREV_RUN_VERSION !== null && PREV_RUN_VERSION !== APP_VERSION;
}

function recordCurrentVersion() {
  try { localStorage.setItem(APP_VERSION_KEY, APP_VERSION); }
  catch (e) { /* storage unavailable — non-fatal */ }
}

// Stamp the running version as soon as this script loads.
recordCurrentVersion();
