// Migration: the Pets category's id was 'pippen' (a pet's name) — rename it to
// 'pets' in every store that holds a category id. Runs before the globals below
// are loaded, so they pick up the new id. Idempotent: it only writes a store when
// it finds an old id, so it's a no-op after the first run, and it re-runs
// harmlessly after a restore brings an old backup back (restore reloads the page).
function migratePetsCatId() {
  var OLD = 'pippen', NEW = 'pets';
  function fix(o, field) { if (o && o[field] === OLD) { o[field] = NEW; return true; } return false; }
  function each(key, fn) {
    var v = load(key);
    if (v && typeof v === 'object' && fn(v)) save(key, v);
  }
  // Arrays of records: transactions, recurring transactions, bills
  each(K.tx, function(list) {
    var ch = false;
    (Array.isArray(list) ? list : []).forEach(function(t) {
      if (fix(t, 'catId')) ch = true;
      if (fix(t, 'suggestedCatId')) ch = true;
    });
    return ch;
  });
  each(K.recurring, function(list) {
    var ch = false;
    (Array.isArray(list) ? list : []).forEach(function(r) {
      if (fix(r, 'catId')) ch = true;
      if (fix(r, 'category')) ch = true;
    });
    return ch;
  });
  each(K.bills, function(list) {
    var ch = false;
    (Array.isArray(list) ? list : []).forEach(function(b) {
      if (fix(b, 'category')) ch = true;
      if (fix(b, 'catId')) ch = true;
    });
    return ch;
  });
  // Budgets keyed by category id. If both keys exist, the 'pets' value wins.
  [K.budgets, K.lbudgets].forEach(function(key) {
    each(key, function(b) {
      if (Array.isArray(b) || !Object.prototype.hasOwnProperty.call(b, OLD)) return false;
      if (!Object.prototype.hasOwnProperty.call(b, NEW)) b[NEW] = b[OLD];
      delete b[OLD];
      return true;
    });
  });
  // Rules (and their amount thresholds), plus AutoCat's learned mappings
  [K.rules, 'learnedMappings'].forEach(function(key) {
    each(key, function(rules) {
      var ch = false;
      for (var m in rules) {
        var r = rules[m];
        if (!r || typeof r !== 'object') continue;
        if (fix(r, 'catId')) ch = true;
        (Array.isArray(r.amountThresholds) ? r.amountThresholds : []).forEach(function(th) {
          if (fix(th, 'catId')) ch = true;
        });
      }
      return ch;
    });
  });
  // Categories. If a 'pets' category somehow already exists, fold the old one into it.
  each(K.categories, function(cats) {
    if (!Array.isArray(cats)) return false;
    var oldAt = cats.findIndex(function(c) { return c && c.id === OLD; });
    if (oldAt === -1) return false;
    var existing = cats.find(function(c) { return c && c.id === NEW; });
    if (!existing) { cats[oldAt].id = NEW; return true; }
    (cats[oldAt].subcats || []).forEach(function(s) {
      existing.subcats = existing.subcats || [];
      if (existing.subcats.indexOf(s) === -1) existing.subcats.push(s);
    });
    cats.splice(oldAt, 1);
    return true;
  });
  // Pending AutoCat reviews
  each('cff_pending_reviews', function(list) {
    var ch = false;
    (Array.isArray(list) ? list : []).forEach(function(r) {
      if (fix(r, 'currentCatId')) ch = true;
      if (fix(r, 'suggestedCatId')) ch = true;
    });
    return ch;
  });
}
try { migratePetsCatId(); } catch(e) { console.warn('migratePetsCatId:', e); }


let TX        = load(K.tx)       || [];
let BUDGETS   = load(K.budgets)  || {}; // legacy pre-ledger limits; kept only for backup compatibility — budgets live in LBUDGETS
let GOALS     = load(K.goals)    || [];
let BILLS     = load(K.bills)    || [];
let BILL_ALIASES    = load(K.billAliases)    || {}; // { merchantKey: [rawDescriptionString, ...] }
let BILLS_DISMISSED = load(K.billsDismissed) || []; // [merchantKey, ...] — permanent
let MORTGAGE  = load(K.mortgage) || {};
let CT        = load(K.ct)       || {};
let CTCFG     = load(K.ctcfg)    || {};
let INS       = load(K.ins)      || [];
let SUPER     = load(K.superdata)|| {};
let PINS      = load(K.pins)     || {};
// Migrate any legacy plaintext PINs to SHA-256 hashes on load
let LCATS = load(K.categories) || [{"id": "home", "name": "Home", "icon": "home", "color": "#74b9ff", "type": "expense", "subcats": ["Mortgage Repayments", "Home Internet", "House Cleaning", "Council Rates", "Maintenance", "Strata Fees", "Home Improvements", "House Renovations"]}, {"id": "car_transport", "name": "Car & Transport", "icon": "car", "color": "#a29bfe", "type": "expense", "subcats": ["Car Servicing", "Tolls", "Petrol", "Car Cleaning", "Car Parking", "Public Transport", "Ubers and Taxis", "Registration"]}, {"id": "health_beauty", "name": "Health & Beauty", "icon": "heart", "color": "#f04060", "type": "expense", "subcats": ["Doctors, Health, Specialists", "Haircuts", "Nails, Beauty & Other Errands", "Psychologist", "Pharmacy"]}, {"id": "fitness", "name": "Fitness", "icon": "barbell", "color": "#52d68a", "type": "expense", "subcats": ["Gym Memberships", "Personal Training", "Other Fitness"]}, {"id": "food_eating_out", "name": "Food & Eating Out", "icon": "tools-kitchen-2", "color": "#f07aaa", "type": "expense", "subcats": ["Groceries", "Meal Delivery", "Eating Out (Cafes, Restaurant Food)", "Uber Eats and Delivery", "Alcohol and Bars", "Cafe and Lunches", "Other Food Expense"]}, {"id": "children", "name": "Children Expenses", "icon": "baby-carriage", "color": "#fd79a8", "type": "expense", "subcats": ["Clothing", "Children Activities", "Nannies & Carers", "Childcare", "School Fees", "Other Children Expenses", "Toys and Presents"]}, {"id": "pets", "name": "Pets", "icon": "paw", "color": "#00b894", "type": "expense", "subcats": ["Pet Insurance", "Dog Grooming", "Pet Food", "Vet Bills", "Dog Walking", "Pet Supplies"]}, {"id": "insurance_utilities", "name": "Insurance", "icon": "shield-check", "color": "#f0a040", "type": "expense", "subcats": ["Life & Income Insurance", "Health Insurance", "Car Insurance", "Home & Contents Insurance", "Pet Insurance", "Income Protection", "Other Insurance"]}, {"id": "utilities", "name": "Utilities", "icon": "bulb", "color": "#38bdf8", "type": "expense", "subcats": ["Power Bill", "Gas Bill", "Water Rates", "Internet / Broadband", "Mobile Phone Bills", "Home Phone", "Streaming Services", "Other Utilities"]}, {"id": "tax", "name": "Tax Payments", "icon": "receipt", "color": "#ef4444", "type": "expense", "subcats": ["Income Tax", "Capital Gains Tax", "BAS / GST", "PAYG Instalments", "Stamp Duty", "Land Tax", "Council Rates", "Other Tax"]}, {"id": "entertainment", "name": "Entertainment", "icon": "movie", "color": "#e8457a", "type": "expense", "subcats": ["Wine & Presents", "Netflix", "Amazon Prime", "Apple Subscriptions", "Other Entertainment"]}, {"id": "holidays_travel", "name": "Holidays & Travel", "icon": "plane", "color": "#74b9ff", "type": "expense", "subcats": ["Flights", "Accommodation", "Car Rentals", "Travel Insurance"]}, {"id": "shopping", "name": "Shopping", "icon": "shopping-bag", "color": "#fd79a8", "type": "expense", "subcats": ["Clothing & Shopping", "Online Shopping", "Home Shopping", "Gifts", "Donations"]}, {"id": "business", "name": "Business Costs", "icon": "briefcase", "color": "#636e72", "type": "expense", "subcats": ["Business Insurance", "Website and Digital", "LinkedIn", "Domains", "Tax Payments", "Education"]}, {"id": "salary", "name": "Salary", "icon": "coin", "color": "#52d68a", "type": "income", "subcats": ["Regular Pay", "Overtime", "Commission"]}, {"id": "bonus", "name": "Bonus", "icon": "gift", "color": "#f0a040", "type": "income", "subcats": ["Work Bonus", "Performance Pay", "Annual Bonus"]}, {"id": "interest", "name": "Interest", "icon": "building-bank", "color": "#74b9ff", "type": "income", "subcats": ["Savings Interest", "Term Deposit", "Offset Interest"]}, {"id": "capital_gains", "name": "Capital Gains", "icon": "trending-up", "color": "#00b894", "type": "income", "subcats": ["Property", "Shares", "ETF", "Crypto"]}, {"id": "transfers", "name": "Transfers", "icon": "refresh", "color": "#74b9ff", "type": "both", "subcats": ["Between Accounts", "Mortgage Offset", "Savings Transfer", "Investment Transfer", "External Transfer", "Loan Repayment", "Credit Card Payment"]}, {"id": "other", "name": "Other", "icon": "clipboard-list", "color": "#8a8095", "type": "both", "subcats": []}];
// Category versioning: bump version to force-update categories on next load
const CAT_VERSION = 11;
const _BUILT_IN_CATS = [{"id": "home", "name": "Home", "icon": "home", "color": "#74b9ff", "type": "expense", "subcats": ["Mortgage Repayments", "Home Internet", "House Cleaning", "Council Rates", "Maintenance", "Strata Fees", "Home Improvements", "House Renovations"]}, {"id": "car_transport", "name": "Car & Transport", "icon": "car", "color": "#a29bfe", "type": "expense", "subcats": ["Car Servicing", "Tolls", "Petrol", "Car Cleaning", "Car Parking", "Public Transport", "Ubers and Taxis", "Registration"]}, {"id": "health_beauty", "name": "Health & Beauty", "icon": "heart", "color": "#f04060", "type": "expense", "subcats": ["Doctors, Health, Specialists", "Haircuts", "Nails, Beauty & Other Errands", "Psychologist", "Pharmacy"]}, {"id": "fitness", "name": "Fitness", "icon": "barbell", "color": "#52d68a", "type": "expense", "subcats": ["Gym Memberships", "Personal Training", "Other Fitness"]}, {"id": "food_eating_out", "name": "Food & Eating Out", "icon": "tools-kitchen-2", "color": "#f07aaa", "type": "expense", "subcats": ["Groceries", "Meal Delivery", "Eating Out (Cafes, Restaurant Food)", "Uber Eats and Delivery", "Alcohol and Bars", "Cafe and Lunches", "Other Food Expense"]}, {"id": "children", "name": "Children Expenses", "icon": "baby-carriage", "color": "#fd79a8", "type": "expense", "subcats": ["Clothing", "Children Activities", "Nannies & Carers", "Childcare", "School Fees", "Other Children Expenses", "Toys and Presents"]}, {"id": "pets", "name": "Pets", "icon": "paw", "color": "#00b894", "type": "expense", "subcats": ["Pet Insurance", "Dog Grooming", "Pet Food", "Vet Bills", "Dog Walking", "Pet Supplies"]}, {"id": "insurance_utilities", "name": "Insurance", "icon": "shield-check", "color": "#f0a040", "type": "expense", "subcats": ["Life & Income Insurance", "Health Insurance", "Car Insurance", "Home & Contents Insurance", "Pet Insurance", "Income Protection", "Other Insurance"]}, {"id": "utilities", "name": "Utilities", "icon": "bulb", "color": "#38bdf8", "type": "expense", "subcats": ["Power Bill", "Gas Bill", "Water Rates", "Internet / Broadband", "Mobile Phone Bills", "Home Phone", "Streaming Services", "Other Utilities"]}, {"id": "tax", "name": "Tax Payments", "icon": "receipt", "color": "#ef4444", "type": "expense", "subcats": ["Income Tax", "Capital Gains Tax", "BAS / GST", "PAYG Instalments", "Stamp Duty", "Land Tax", "Council Rates", "Other Tax"]}, {"id": "entertainment", "name": "Entertainment", "icon": "movie", "color": "#e8457a", "type": "expense", "subcats": ["Wine & Presents", "Netflix", "Amazon Prime", "Apple Subscriptions", "Other Entertainment"]}, {"id": "holidays_travel", "name": "Holidays & Travel", "icon": "plane", "color": "#74b9ff", "type": "expense", "subcats": ["Flights", "Accommodation", "Car Rentals", "Travel Insurance"]}, {"id": "shopping", "name": "Shopping", "icon": "shopping-bag", "color": "#fd79a8", "type": "expense", "subcats": ["Clothing & Shopping", "Online Shopping", "Home Shopping", "Gifts", "Donations"]}, {"id": "business", "name": "Business Costs", "icon": "briefcase", "color": "#636e72", "type": "expense", "subcats": ["Business Insurance", "Website and Digital", "LinkedIn", "Domains", "Tax Payments", "Education"]}, {"id": "salary", "name": "Salary", "icon": "coin", "color": "#52d68a", "type": "income", "subcats": ["Regular Pay", "Overtime", "Commission"]}, {"id": "bonus", "name": "Bonus", "icon": "gift", "color": "#f0a040", "type": "income", "subcats": ["Work Bonus", "Performance Pay", "Annual Bonus"]}, {"id": "interest", "name": "Interest", "icon": "building-bank", "color": "#74b9ff", "type": "income", "subcats": ["Savings Interest", "Term Deposit", "Offset Interest"]}, {"id": "capital_gains", "name": "Capital Gains", "icon": "trending-up", "color": "#00b894", "type": "income", "subcats": ["Property", "Shares", "ETF", "Crypto"]}, {"id": "investment_property", "name": "Investment Property", "icon": "building-community", "color": "#2dd4bf", "type": "both", "subcats": ["Rent Received", "Other Rental Income", "Council Rates", "Water Charges", "Strata / Body Corporate", "Landlord Insurance", "Repairs & Maintenance", "Property Management Fees", "Land Tax", "Loan Interest", "Cleaning", "Gardening / Lawn Mowing", "Pest Control", "Advertising for Tenants", "Legal Expenses", "Borrowing Expenses", "Stationery, Phone & Postage", "Other Rental Expenses"]}, {"id": "transfers", "name": "Transfers", "icon": "refresh", "color": "#74b9ff", "type": "both", "subcats": ["Between Accounts", "Mortgage Offset", "Savings Transfer", "Investment Transfer", "External Transfer", "Loan Repayment", "Credit Card Payment"]}, {"id": "other", "name": "Other", "icon": "clipboard-list", "color": "#8a8095", "type": "both", "subcats": []}];
if (!load(K.categories) || ((load("cff_cat_version")|0) < CAT_VERSION)) {
  LCATS = _BUILT_IN_CATS;
  save(K.categories, LCATS);
  try { localStorage.setItem("cff_cat_version", CAT_VERSION); } catch(e) {}
} else {
  LCATS = load(K.categories) || _BUILT_IN_CATS;
}
// Ensure Uncategorised category exists (added without forcing a full reset)
if (!LCATS.find(function(c){ return c.id === 'uncategorised'; })) {
  LCATS.push({"id":"uncategorised","name":"Uncategorised","icon": "help","color":"#8a8095","type":"both","subcats":[]});
  save(K.categories, LCATS);
}
// Ensure the Investment Property category exists — rent and property costs
// tagged with it feed the Investment Property module. Added without a
// CAT_VERSION bump (which would discard user customisation), and skipped if the
// user already made their own category with that name.
(function ensureInvestmentPropertyCategory() {
  var exists = LCATS.find(function(c) {
    return c.id === 'investment_property' || String(c.name || '').trim().toLowerCase() === 'investment property';
  });
  if (exists) return;
  var cat = _BUILT_IN_CATS.find(function(c) { return c.id === 'investment_property'; });
  if (!cat) return;
  cat = JSON.parse(JSON.stringify(cat));
  var at = LCATS.findIndex(function(c) { return c.id === 'transfers'; });
  if (at === -1) LCATS.push(cat); else LCATS.splice(at, 0, cat);
  save(K.categories, LCATS);
})();
// Non-destructive icon migration: upgrade any legacy emoji icon to a Tabler
// icon key WITHOUT touching name/color/subcats (unlike CAT_VERSION resets,
// this never discards user customisation).
(function migrateCategoryIconsToKeys() {
  if (typeof legacyIconToKey !== 'function') return;
  var changed = false;
  LCATS.forEach(function(c) {
    var k = legacyIconToKey(c.icon);
    if (k !== c.icon) { c.icon = k; changed = true; }
  });
  if (changed) save(K.categories, LCATS);
})();

let LBUDGETS  = load(K.lbudgets) || {}; // { catId: amount }

// Migration: Convert LRULES from old format (no pattern field) to new format (with pattern type)
function migrateRulesToPattern() {
  var stored = load(K.rules) || {};
  var migrated = false;
  for (var merchant in stored) {
    if (stored.hasOwnProperty(merchant)) {
      var rule = stored[merchant];
      if (rule && typeof rule === 'object' && !rule.pattern) {
        rule.pattern = 'exact';
        rule.confidence = rule.confidence || 'HIGH';
        migrated = true;
      }
      // Ensure all new fields exist
      if (rule && typeof rule === 'object') {
        if (!rule.source) { rule.source = 'manual'; migrated = true; }
        if (typeof rule.matchCount !== 'number') { rule.matchCount = 0; migrated = true; }
        if (!rule.lastMatchedAt) { rule.lastMatchedAt = ''; migrated = true; }
        if (!rule.createdAt) { rule.createdAt = ''; migrated = true; }
        if (typeof rule.userModified === 'undefined') { rule.userModified = true; migrated = true; }
      }
    }
  }
  if (migrated) {
    try { save(K.rules, stored); } catch(e) {}
  }
  return stored;
}

// Backfill tx fields onto the live TX array (call after TX is assigned from localStorage)
// Tax (Beta) fields (taxDeductible, taxLabel, taxPerson, taxNote) are optional and deliberately
// not backfilled: a transaction without them is untagged (see taxTxTag in js/tax/engine.js),
// so turning the beta on never rewrites existing transactions.
function migrateTxFields() {
  var txMigrated = false;
  for (var i = 0; i < TX.length; i++) {
    var tx = TX[i];
    if (!tx.rawDescription) { tx.rawDescription = tx.name || ''; txMigrated = true; }
    if (typeof tx.reviewFlag === 'undefined') { tx.reviewFlag = false; txMigrated = true; }
    if (typeof tx.correctionSource === 'undefined') { tx.correctionSource = ''; txMigrated = true; }
    if (typeof tx.suggestedCatId === 'undefined') { tx.suggestedCatId = ''; txMigrated = true; }
    if (typeof tx.suggestedSubcat === 'undefined') { tx.suggestedSubcat = ''; txMigrated = true; }
  }
  if (txMigrated) {
    try { save(K.tx, TX); } catch(e) {}
  }
}

let LRULES = (function() {
  var stored = load(K.rules) || {};
  // Check if migration is needed (any rule without pattern field)
  var needsMigration = false;
  for (var m in stored) {
    if (stored[m] && !stored[m].pattern) {
      needsMigration = true;
      break;
    }
  }
  if (needsMigration) {
    stored = migrateRulesToPattern();
  }
  return stored;
})();
let LRECURRING = load(K.recurring) || [];
let TRANSFERS  = load(K.transfers)  || [];
let TRANSFERS_PENDING = load(K.transfersPending) || [];
let USER_CONFIG = load('cff_userconfig') || {};
let EQUITIES    = load(K.equities)     || []; // [{id,ticker,company,type,qty,costBase,currentPrice,currency,notes,sales:[]}]
let LIABILITIES = load(K.liabilities) || []; // [{id,type,lender,balance,originalBalance,rate,rateType,fixedExpiry,payment,dueDay,termMonths,creditLimit,notes,addToBills,createdAt}]
// Monthly closing balance grids — per-component historical tracking
var SUPER_MONTHLY = load(K.superMonthly) || {}; // { accountId: { 'YYYY-MM': balance } }
var LIAB_MONTHLY  = load(K.liabMonthly)  || {}; // { liabilityId: { 'YYYY-MM': balance } }
var EQ_MONTHLY    = load(K.eqMonthly)    || {}; // { 'YYYY-MM': { closing } }
// Entry dates for cash tracker: { acctId: { 'YYYY-MM': 'YYYY-MM-DD' } }
var CT_DATES = load(K.ctdates) || {};
// ACCOUNTS — [{id,name,icon,currency,location,color,isCore}]
// Migrates from USER_CONFIG on first load. Never stores BSB/account numbers/bank names.
var ACCOUNTS = (function() {
  var stored = load(K.accounts);
  if (stored && stored.length) return stored;
  // Migrate names from USER_CONFIG (acct_* keys) — no sensitive data ever stored
  var uc = USER_CONFIG || {};
  var a = [
    { id:'offset', name: uc.acct_offset || 'Offset Account',    icon:'building-bank', currency:'AUD', location:'Australia', color:'#e8457a', isCore:true },
    { id:'home',   name: uc.acct_home   || 'Joint Transaction',  icon:'home', currency:'AUD', location:'Australia', color:'#7c5cbf', isCore:true },
    { id:'sav1',   name: uc.acct_sav1   || 'Savings Account 1', icon:'coin', currency:'AUD', location:'Australia', color:'#f07aaa', isCore:true },
    { id:'sav2',   name: uc.acct_sav2   || 'Savings Account 2', icon:'diamond', currency:'AUD', location:'Australia', color:'#a29bfe', isCore:true }
  ];
  try { localStorage.setItem(K.accounts, JSON.stringify(a)); } catch(e) {}
  return a;
})();
// Non-destructive icon migration for accounts (see category migration above).
(function migrateAccountIconsToKeys() {
  if (typeof legacyIconToKey !== 'function') return;
  var changed = false;
  ACCOUNTS.forEach(function(a) {
    var k = legacyIconToKey(a.icon);
    if (k !== a.icon) { a.icon = k; changed = true; }
  });
  if (changed) { try { save(K.accounts, ACCOUNTS); } catch(e) {} }
})();
// Non-destructive icon migration for goals.
(function migrateGoalIconsToKeys() {
  if (typeof legacyIconToKey !== 'function') return;
  var changed = false;
  GOALS.forEach(function(g) {
    if (!g.icon) return;
    var k = legacyIconToKey(g.icon);
    if (k !== g.icon) { g.icon = k; changed = true; }
  });
  if (changed) { try { save(K.goals, GOALS); } catch(e) {} }
})();
