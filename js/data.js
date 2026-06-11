
let TX        = load(K.tx)       || [];
let BUDGETS   = load(K.budgets)  || {};
let GOALS     = load(K.goals)    || [];
let BILLS     = load(K.bills)    || [];
let MORTGAGE  = load(K.mortgage) || {};
let CT        = load(K.ct)       || {};
let CTCFG     = load(K.ctcfg)    || {};
let INS       = load(K.ins)      || [];
let SUPER     = load(K.superdata)|| {};
let PINS      = load(K.pins)     || {};
// Migrate any legacy plaintext PINs to SHA-256 hashes on load
let LCATS = load(K.categories) || [{"id": "home", "name": "Home", "icon": "🏠", "color": "#74b9ff", "type": "expense", "subcats": ["Mortgage Repayments", "Home Internet", "House Cleaning", "Council Rates", "Maintenance", "Strata Fees", "Home Improvements", "House Renovations"]}, {"id": "car_transport", "name": "Car & Transport", "icon": "🚗", "color": "#a29bfe", "type": "expense", "subcats": ["Car Servicing", "Tolls", "Petrol", "Car Cleaning", "Car Parking", "Public Transport", "Ubers and Taxis", "Registration"]}, {"id": "health_beauty", "name": "Health & Beauty", "icon": "❤", "color": "#f04060", "type": "expense", "subcats": ["Doctors, Health, Specialists", "Haircuts", "Nails, Beauty & Other Errands", "Psychologist", "Pharmacy"]}, {"id": "fitness", "name": "Fitness", "icon": "🏋", "color": "#52d68a", "type": "expense", "subcats": ["Gym Memberships", "Personal Training", "Other Fitness"]}, {"id": "food_eating_out", "name": "Food & Eating Out", "icon": "🍽", "color": "#f07aaa", "type": "expense", "subcats": ["Groceries", "Meal Delivery", "Eating Out (Cafes, Restaurant Food)", "Uber Eats and Delivery", "Alcohol and Bars", "Cafe and Lunches", "Other Food Expense"]}, {"id": "children", "name": "Children Expenses", "icon": "👶", "color": "#fd79a8", "type": "expense", "subcats": ["Clothing", "Children Activities", "Nannies & Carers", "Childcare", "School Fees", "Other Children Expenses", "Toys and Presents"]}, {"id": "pippen", "name": "Pets", "icon": "🐾", "color": "#00b894", "type": "expense", "subcats": ["Pet Insurance", "Dog Grooming", "Pet Food", "Vet Bills", "Dog Walking", "Pet Supplies"]}, {"id": "insurance_utilities", "name": "Insurance", "icon": "🛡", "color": "#f0a040", "type": "expense", "subcats": ["Life & Income Insurance", "Health Insurance", "Car Insurance", "Home & Contents Insurance", "Pet Insurance", "Income Protection", "Other Insurance"]}, {"id": "utilities", "name": "Utilities", "icon": "💡", "color": "#38bdf8", "type": "expense", "subcats": ["Power Bill", "Gas Bill", "Water Rates", "Internet / Broadband", "Mobile Phone Bills", "Home Phone", "Streaming Services", "Other Utilities"]}, {"id": "tax", "name": "Tax Payments", "icon": "🧾", "color": "#ef4444", "type": "expense", "subcats": ["Income Tax", "Capital Gains Tax", "BAS / GST", "PAYG Instalments", "Stamp Duty", "Land Tax", "Council Rates", "Other Tax"]}, {"id": "entertainment", "name": "Entertainment", "icon": "🎬", "color": "#e8457a", "type": "expense", "subcats": ["Wine & Presents", "Netflix", "Amazon Prime", "Apple Subscriptions", "Other Entertainment"]}, {"id": "holidays_travel", "name": "Holidays & Travel", "icon": "✈", "color": "#74b9ff", "type": "expense", "subcats": ["Flights", "Accommodation", "Car Rentals", "Travel Insurance"]}, {"id": "shopping", "name": "Shopping", "icon": "🛍", "color": "#fd79a8", "type": "expense", "subcats": ["Clothing & Shopping", "Online Shopping", "Home Shopping", "Gifts", "Donations"]}, {"id": "business", "name": "Business Costs", "icon": "💼", "color": "#636e72", "type": "expense", "subcats": ["Business Insurance", "Website and Digital", "LinkedIn", "Domains", "Tax Payments", "Education"]}, {"id": "salary", "name": "Salary", "icon": "💰", "color": "#52d68a", "type": "income", "subcats": ["Regular Pay", "Overtime", "Commission"]}, {"id": "bonus", "name": "Bonus", "icon": "🎁", "color": "#f0a040", "type": "income", "subcats": ["Work Bonus", "Performance Pay", "Annual Bonus"]}, {"id": "interest", "name": "Interest", "icon": "🏦", "color": "#74b9ff", "type": "income", "subcats": ["Savings Interest", "Term Deposit", "Offset Interest"]}, {"id": "capital_gains", "name": "Capital Gains", "icon": "📈", "color": "#00b894", "type": "income", "subcats": ["Property", "Shares", "ETF", "Crypto"]}, {"id": "transfers", "name": "Transfers", "icon": "🔄", "color": "#74b9ff", "type": "both", "subcats": ["Between Accounts", "Mortgage Offset", "Savings Transfer", "Investment Transfer", "External Transfer", "Loan Repayment", "Credit Card Payment"]}, {"id": "other", "name": "Other", "icon": "📋", "color": "#8a8095", "type": "both", "subcats": []}];
// Category versioning: bump version to force-update categories on next load
const CAT_VERSION = 11;
const _BUILT_IN_CATS = [{"id": "home", "name": "Home", "icon": "🏠", "color": "#74b9ff", "type": "expense", "subcats": ["Mortgage Repayments", "Home Internet", "House Cleaning", "Council Rates", "Maintenance", "Strata Fees", "Home Improvements", "House Renovations"]}, {"id": "car_transport", "name": "Car & Transport", "icon": "🚗", "color": "#a29bfe", "type": "expense", "subcats": ["Car Servicing", "Tolls", "Petrol", "Car Cleaning", "Car Parking", "Public Transport", "Ubers and Taxis", "Registration"]}, {"id": "health_beauty", "name": "Health & Beauty", "icon": "❤", "color": "#f04060", "type": "expense", "subcats": ["Doctors, Health, Specialists", "Haircuts", "Nails, Beauty & Other Errands", "Psychologist", "Pharmacy"]}, {"id": "fitness", "name": "Fitness", "icon": "🏋", "color": "#52d68a", "type": "expense", "subcats": ["Gym Memberships", "Personal Training", "Other Fitness"]}, {"id": "food_eating_out", "name": "Food & Eating Out", "icon": "🍽", "color": "#f07aaa", "type": "expense", "subcats": ["Groceries", "Meal Delivery", "Eating Out (Cafes, Restaurant Food)", "Uber Eats and Delivery", "Alcohol and Bars", "Cafe and Lunches", "Other Food Expense"]}, {"id": "children", "name": "Children Expenses", "icon": "👶", "color": "#fd79a8", "type": "expense", "subcats": ["Clothing", "Children Activities", "Nannies & Carers", "Childcare", "School Fees", "Other Children Expenses", "Toys and Presents"]}, {"id": "pippen", "name": "Pets", "icon": "🐾", "color": "#00b894", "type": "expense", "subcats": ["Pet Insurance", "Dog Grooming", "Pet Food", "Vet Bills", "Dog Walking", "Pet Supplies"]}, {"id": "insurance_utilities", "name": "Insurance", "icon": "🛡", "color": "#f0a040", "type": "expense", "subcats": ["Life & Income Insurance", "Health Insurance", "Car Insurance", "Home & Contents Insurance", "Pet Insurance", "Income Protection", "Other Insurance"]}, {"id": "utilities", "name": "Utilities", "icon": "💡", "color": "#38bdf8", "type": "expense", "subcats": ["Power Bill", "Gas Bill", "Water Rates", "Internet / Broadband", "Mobile Phone Bills", "Home Phone", "Streaming Services", "Other Utilities"]}, {"id": "tax", "name": "Tax Payments", "icon": "🧾", "color": "#ef4444", "type": "expense", "subcats": ["Income Tax", "Capital Gains Tax", "BAS / GST", "PAYG Instalments", "Stamp Duty", "Land Tax", "Council Rates", "Other Tax"]}, {"id": "entertainment", "name": "Entertainment", "icon": "🎬", "color": "#e8457a", "type": "expense", "subcats": ["Wine & Presents", "Netflix", "Amazon Prime", "Apple Subscriptions", "Other Entertainment"]}, {"id": "holidays_travel", "name": "Holidays & Travel", "icon": "✈", "color": "#74b9ff", "type": "expense", "subcats": ["Flights", "Accommodation", "Car Rentals", "Travel Insurance"]}, {"id": "shopping", "name": "Shopping", "icon": "🛍", "color": "#fd79a8", "type": "expense", "subcats": ["Clothing & Shopping", "Online Shopping", "Home Shopping", "Gifts", "Donations"]}, {"id": "business", "name": "Business Costs", "icon": "💼", "color": "#636e72", "type": "expense", "subcats": ["Business Insurance", "Website and Digital", "LinkedIn", "Domains", "Tax Payments", "Education"]}, {"id": "salary", "name": "Salary", "icon": "💰", "color": "#52d68a", "type": "income", "subcats": ["Regular Pay", "Overtime", "Commission"]}, {"id": "bonus", "name": "Bonus", "icon": "🎁", "color": "#f0a040", "type": "income", "subcats": ["Work Bonus", "Performance Pay", "Annual Bonus"]}, {"id": "interest", "name": "Interest", "icon": "🏦", "color": "#74b9ff", "type": "income", "subcats": ["Savings Interest", "Term Deposit", "Offset Interest"]}, {"id": "capital_gains", "name": "Capital Gains", "icon": "📈", "color": "#00b894", "type": "income", "subcats": ["Property", "Shares", "ETF", "Crypto"]}, {"id": "transfers", "name": "Transfers", "icon": "🔄", "color": "#74b9ff", "type": "both", "subcats": ["Between Accounts", "Mortgage Offset", "Savings Transfer", "Investment Transfer", "External Transfer", "Loan Repayment", "Credit Card Payment"]}, {"id": "other", "name": "Other", "icon": "📋", "color": "#8a8095", "type": "both", "subcats": []}];
if (!load(K.categories) || ((load("cff_cat_version")|0) < CAT_VERSION)) {
  LCATS = _BUILT_IN_CATS;
  save(K.categories, LCATS);
  try { localStorage.setItem("cff_cat_version", CAT_VERSION); } catch(e) {}
} else {
  LCATS = load(K.categories) || _BUILT_IN_CATS;
}
// Ensure Uncategorised category exists (added without forcing a full reset)
if (!LCATS.find(function(c){ return c.id === 'uncategorised'; })) {
  LCATS.push({"id":"uncategorised","name":"Uncategorised","icon":"❓","color":"#8a8095","type":"both","subcats":[]});
  save(K.categories, LCATS);
}

let LBUDGETS  = load(K.lbudgets) || {}; // { catId: amount }

// Migration: Convert LRULES from old format (no pattern field) to new format (with pattern type)
function migrateRulesToPattern() {
  var stored = load(K.rules) || {};
  var migrated = false;
  for (var merchant in stored) {
    if (stored.hasOwnProperty(merchant)) {
      var rule = stored[merchant];
      // If pattern field doesn't exist, add it as 'exact' (backward compatibility)
      if (rule && typeof rule === 'object' && !rule.pattern) {
        rule.pattern = 'exact';
        rule.confidence = rule.confidence || 'HIGH';
        migrated = true;
      }
    }
  }
  if (migrated) {
    try { save(K.rules, stored); } catch(e) {}
  }
  return stored;
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
    { id:'offset', name: uc.acct_offset || 'Offset Account',    icon:'🏦', currency:'AUD', location:'Australia', color:'#e8457a', isCore:true },
    { id:'home',   name: uc.acct_home   || 'Joint Transaction',  icon:'🏠', currency:'AUD', location:'Australia', color:'#7c5cbf', isCore:true },
    { id:'sav1',   name: uc.acct_sav1   || 'Savings Account 1', icon:'💰', currency:'AUD', location:'Australia', color:'#f07aaa', isCore:true },
    { id:'sav2',   name: uc.acct_sav2   || 'Savings Account 2', icon:'💎', currency:'AUD', location:'Australia', color:'#a29bfe', isCore:true }
  ];
  try { localStorage.setItem(K.accounts, JSON.stringify(a)); } catch(e) {}
  return a;
})();
