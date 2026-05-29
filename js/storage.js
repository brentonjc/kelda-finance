// ══════════════════════════════════════════════════════════════
// DATA STORE
// ══════════════════════════════════════════════════════════════
const K={
  tx:'cff_tx',budgets:'cff_budgets',goals:'cff_goals',bills:'cff_bills',
  mortgage:'cff_mortgage',ct:'cff_ct',ctcfg:'cff_ctcfg',
  ins:'cff_ins',superdata:'cff_super',pins:'cff_pins',
  categories:'ledger_categories',lbudgets:'ledger_budgets',rules:'ledger_rules',
  recurring:'ledger_recurring',transfers:'cff_transfers',equities:'cff_equities',userconfig:'cff_userconfig',liabilities:'cff_liabilities'
};
function load(k){try{return JSON.parse(localStorage.getItem(k)||'null');}catch(e){return null;}}
function save(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){console.warn('Storage unavailable:',e);}}
function esc(s){return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
