// Accuracy regressions for the auto-categoriser (js/pages/autocategorise.js), found by the
// categorisation audit: the Salary amount guess, built-in seeds blocked by a user's exact rule,
// single-word keywords matching inside longer words, alias shortening beating a more specific
// rule, and a bare "BP". Also checks that every built-in seed resolves to itself.
// Run: node --test "tests/**/*.test.js"
// Every description here is made up or a national brand name. No real transactions.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function loadApp({ store = {} } = {}) {
  const ctx = {
    console: { log() {}, warn() {}, group() {}, groupEnd() {} },
    setTimeout: () => 0,
    clearTimeout: () => {},
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: (k) => { delete store[k]; },
      key: (i) => Object.keys(store)[i] ?? null,
      get length() { return Object.keys(store).length; },
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/storage.js'), 'utf8'), ctx, { filename: 'js/storage.js' });
  vm.runInContext('var LRULES = load(K.rules) || {};', ctx);
  ctx.TX = [];
  ctx.LCATS = [];
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/pages/autocategorise.js'), 'utf8'), ctx,
    { filename: 'js/pages/autocategorise.js' });
  ctx.seedLRulesFromCSV();   // as unlocking the app does
  // The rule pass Rescan runs before it falls back to categorise()
  vm.runInContext(`function viaRescan(raw, amount) {
    var pre = preprocessMerchantString(raw);
    if (pre.indexOf('bpay') === 0) pre = extractBpayBiller(pre);
    var can = resolveAlias(pre);
    var r = matchLRulesNew(can, pre) || matchLRulesNew(pre);
    if (r) { r = applyAmountThresholds(r, amount); return r.catId + (r.subcat ? ' › ' + r.subcat : ''); }
    var c = AutoCat.categorise(raw, '', amount, 'expense');
    return c.catId + (c.subcat ? ' › ' + c.subcat : '');
  }`, ctx);
  return ctx;
}

// What a CSV import assigns, as "catId › subcat"
function categorise(app, description, type = 'expense', amount = 70) {
  const r = app.AutoCat.categorise(description, '', amount, type);
  return r.catId + (r.subcat ? ' › ' + r.subcat : '');
}
const catOf = (s) => s.split(' › ')[0];

function userRule(catId, subcat, pattern) {
  return { catId, subcat, pattern, source: 'manual', confidence: 'HIGH', userModified: true,
    matchCount: 0, lastMatchedAt: '', createdAt: '2026-01-01' };
}

test('a large credit nothing recognises is not guessed to be Salary', () => {
  const app = loadApp();
  const r = app.AutoCat.categorise('FROM J EXAMPLE CREDIT TO ACCOUNT', '', 5000, 'income');
  assert.notEqual(r.catId, 'salary');
  assert.equal(r.confidence, app.AutoCat.CONF_NONE);
  // a described salary still is one
  assert.equal(categorise(app, 'SALARY EXAMPLE PTY LTD', 'income', 5000), 'salary › Regular Pay');
});

test('a built-in brand rule still covers a variant when the user already has an exact rule for the brand', () => {
  const app = loadApp({ store: { ledger_rules: JSON.stringify({
    bunnings: userRule('home', 'Home Improvements', 'exact'),
    'example local cafe': userRule('food_eating_out', 'Cafe and Lunches', 'exact'),
  }) } });
  assert.equal(app.LRULES.bunnings.catId, 'home', "the user's category wins");
  assert.equal(app.LRULES.bunnings.pattern, 'contains', 'and now covers the variants');
  assert.equal(categorise(app, 'BUNNINGS (EXAMPLEVILLE)', 'expense', 90), 'home › Home Improvements');
  assert.equal(app.viaRescan('BUNNINGS (EXAMPLEVILLE)', 90), 'home › Home Improvements');
  assert.equal(app.LRULES['example local cafe'].pattern, 'exact', 'a non-brand exact rule is left exact');
});

test('single-word keywords match whole words only', () => {
  const app = loadApp();
  assert.ok(!catOf(categorise(app, 'FROM EXAMPLE SHELLEYS BIRTHDAY')).startsWith('car_transport'));
  assert.ok(!catOf(categorise(app, 'TO EXAMPLE SHELLEY DINNER')).startsWith('car_transport'));
  assert.equal(catOf(categorise(app, 'SHELL EXAMPLEVILLE')), 'car_transport');
  assert.notEqual(catOf(categorise(app, 'EXAMPLE HOSPITALITY GROUP')), 'health_beauty');
  assert.equal(catOf(categorise(app, 'EXAMPLEVILLE PRIVATE HOSPITAL')), 'health_beauty');
  // multi-word phrases may still sit inside a longer description
  assert.equal(catOf(categorise(app, 'EXAMPLE PAYMENT TRANSFER TO SAVINGS')), 'transfers');
});

test('the more specific rule wins over an alias-shortened one', () => {
  const app = loadApp();
  for (const run of [(d, a) => categorise(app, d, 'expense', a), (d, a) => app.viaRescan(d, a)]) {
    assert.equal(run('UBER *EATS', 40), 'food_eating_out › Uber Eats and Delivery');
    assert.equal(run('UBER EATS GIFT CARD', 40), 'shopping › Gifts');
    assert.equal(catOf(run('UBER TRIP SYDNEY', 30)), 'car_transport');
    assert.equal(run('COLES EXPRESS EXAMPLEVILLE', 70), 'car_transport › Petrol');
    assert.equal(run('SHELL COLES EXPRESS EXAMPLEVILLE', 70), 'car_transport › Petrol');
    assert.equal(run('COLES EXAMPLEVILLE', 70), 'food_eating_out › Groceries');
  }
});

test('a bare BP descriptor is petrol (or a coffee under $10)', () => {
  const app = loadApp();
  assert.equal(categorise(app, 'BP', 'expense', 70), 'car_transport › Petrol');
  assert.equal(categorise(app, 'BP', 'expense', 6), 'food_eating_out › Cafe and Lunches');
});

test('every built-in seed rule resolves to its own category', () => {
  const app = loadApp();
  const bad = [];
  for (const [key, seed] of Object.entries(app.SEED_LRULES)) {
    const want = seed.catId + (seed.subcat ? ' › ' + seed.subcat : '');
    for (const [via, got] of [['import', categorise(app, key, 'expense', 70)], ['rescan', app.viaRescan(key, 70)]]) {
      if (got !== want) bad.push(key + ' (' + via + '): wanted ' + want + ', got ' + got);
    }
  }
  assert.deepEqual(bad, []);
});

test('telcos and utilities are filed under Utilities however the bank words them', () => {
  const app = loadApp();
  for (const d of ['VODAFONE', 'VODAFONE AUSTRALIA', 'DIRECT DEBIT VODAFONE AUSTRALIA 123456', 'VISA PURCHASE VODAFONE AU NSW',
    'BPAY VODAFONE 123456789', 'TELSTRA BILL PAYMENT', 'OPTUS 1234567', 'AUSSIE BROADBAND', 'AMAYSIM',
    'ORIGIN ENERGY', 'AGL SALES', 'SYDNEY WATER']) {
    assert.equal(catOf(categorise(app, d, 'expense', 80)), 'utilities', d);
    assert.equal(catOf(app.viaRescan(d, 80)), 'utilities', d + ' (rescan)');
  }
});

test('short insurer and bank names inside longer words never file a purchase as insurance', () => {
  const app = loadApp();
  for (const d of ['DOMINOS PIZZA', 'GINGER AND SPICE CAFE', 'ONE SUSHI', 'AMPLE CAFE', 'TALLOW BAKERY',
    'GIORGIO PIZZA', 'INGLEBURN CAFE', 'CANBERRA COFFEE', 'VODAFONE']) {
    assert.notEqual(catOf(categorise(app, d, 'expense', 30)), 'insurance_utilities', d);
  }
});
