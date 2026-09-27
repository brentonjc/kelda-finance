// ══════════════════════════════════════════════════════════════
// DATA STORE
// ══════════════════════════════════════════════════════════════
const K={
  tx:'cff_tx',budgets:'cff_budgets',goals:'cff_goals',bills:'cff_bills',
  mortgage:'cff_mortgage',ct:'cff_ct',ctcfg:'cff_ctcfg',
  ins:'cff_ins',superdata:'cff_super',pins:'cff_pins',
  categories:'ledger_categories',lbudgets:'ledger_budgets',rules:'ledger_rules',
  recurring:'ledger_recurring',transfers:'cff_transfers',equities:'cff_equities',userconfig:'cff_userconfig',liabilities:'cff_liabilities',
  accounts:'cff_accounts',
  transfersPending:'cff_transfers_pending',
  ctdates:'cff_ct_dates',quickstart:'cff_qs_progress',superAccts:'cff_super_accts',
  billAliases:'cff_bill_aliases',billsDismissed:'cff_bills_dismissed',billsHorizon:'cff_bills_horizon',
  billsNotify:'cff_bills_notify',
  // Per-component monthly histories — power the Net Worth breakdown table
  superHist:    'cff_super_history',    // { 'YYYY-MM': { brenton, shelley } }
  mortgageHist: 'cff_mortgage_history', // { 'YYYY-MM': { homeValue, balance } }
  eqHist:       'cff_eq_history',       // { 'YYYY-MM': totalValue }
  liabHist:     'cff_liab_history',     // { 'YYYY-MM': totalBalance }
  // Monthly closing balance grids (Cash Tracker-style per component)
  superMonthly: 'cff_super_monthly',    // { accountId: { 'YYYY-MM': balance } }
  liabMonthly:  'cff_liab_monthly',     // { liabilityId: { 'YYYY-MM': balance } }
  eqMonthly:    'cff_eq_monthly',       // { 'YYYY-MM': { closing } }
  // Data-health timestamps — power the post-unlock welcome insight cards.
  // Missing = never done → treated as "danger" (expected for a fresh household).
  lastFullBackup: 'kf_last_full_backup', // ISO 'YYYY-MM-DD', set on successful full JSON export
  lastCsvImport:  'kf_last_csv_import',   // ISO 'YYYY-MM-DD', set on successful CSV import
  lastIn:         'kf_last_in'            // { profileId: epoch-ms } — "Last in" meta on profile picker
};
function load(k){try{return JSON.parse(localStorage.getItem(k)||'null');}catch(e){return null;}}
function save(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){console.warn('Storage unavailable:',e);}}
function esc(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
// Every key this app owns: the cff_/kf_/ledger_/kelda_ prefixes (incl. the Investment
// Property module's kf_ip_*) plus AutoCat's unprefixed learnedMappings. Full Backup and
// Erase All both work from this, so a new feature's data is covered automatically.
const APP_KEY_RE=/^(cff_|kf_|ledger_|kelda_)/;
function isAppKey(k){return !!k&&(APP_KEY_RE.test(k)||k==='learnedMappings');}
function appKeys(store){var out=[];try{store=store||localStorage;for(var i=0;i<store.length;i++){var k=store.key(i);if(isAppKey(k))out.push(k);}}catch(e){}return out;}
