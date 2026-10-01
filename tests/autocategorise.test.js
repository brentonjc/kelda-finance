// Unit tests for the auto-categoriser (js/pages/autocategorise.js): broker and exchange
// settlements are transfers, not capital gains; RSU sale proceeds are bonus income; the user's
// own rules outrank built-in keywords; the built-in seeds stay generic; and Rescan leaves
// hand-categorised transactions alone.
// Run: node --test "tests/**/*.test.js"
// Every description here is made up.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

// Load the page scripts the way the browser does: classic scripts sharing one global scope.
// LRULES, LCATS and TX normally come from data.js. Timers are stubbed so the debounced rule save
// never fires.
function loadApp({ store = {}, tx = [] } = {}) {
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
  ctx.TX = tx;
  ctx.LCATS = [
    { id: 'transfers', name: 'Transfers' }, { id: 'bonus', name: 'Bonus' },
    { id: 'capital_gains', name: 'Capital Gains' }, { id: 'food_eating_out', name: 'Food & Eating Out' },
  ];
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/pages/autocategorise.js'), 'utf8'), ctx,
    { filename: 'js/pages/autocategorise.js' });
  ctx.seedLRulesFromCSV();   // as unlocking the app does
  return ctx;
}

// What a CSV import assigns: category, or category › subcategory
function categorise(app, description, type = 'expense', amount = 500) {
  const r = app.AutoCat.categorise(description, '', amount, type);
  return r.catId + (r.subcat ? ' › ' + r.subcat : '');
}

const INVESTMENT = 'transfers › Investment Transfer';

test('payments to brokers, crypto exchanges and Vanguard are investment transfers', () => {
  const app = loadApp();
  for (const d of ['COMMSEC SECURITIES LTD SYDNEY', 'DIRECT DEBIT COMMSEC', 'SELFWEALTH PTY LTD',
    'STAKE AUS PTY LTD', 'INTERACTIVE BROKERS AUSTRALIA', 'PEARLER INVESTMENTS', 'COINSPOT PTY LTD',
    'SWYFTX PTY LTD BRISBANE', 'BTC MARKETS PTY LTD', 'CRYPTO.COM MELBOURNE', 'BPAY VANGUARD PERSONAL INVESTOR']) {
    assert.equal(categorise(app, d), INVESTMENT, d);
  }
});

test('sale proceeds from a broker are investment transfers, not income', () => {
  const app = loadApp();
  assert.equal(categorise(app, 'COMMSEC SECURITIES SALE PROCEEDS', 'income', 12000), INVESTMENT);
  assert.equal(categorise(app, 'DIRECT CREDIT SELFWEALTH', 'income', 6000), INVESTMENT);
});

test('a "transfer to" a broker is filed as an investment transfer', () => {
  const app = loadApp();
  assert.equal(categorise(app, 'TRANSFER TO COMMSEC'), INVESTMENT);
  const other = categorise(app, 'TRANSFER TO SAVINGS');
  assert.ok(other.startsWith('transfers') && other !== INVESTMENT, other);
});

test('Vanguard Super, distributions, Stake.com and near-miss words are not investment transfers', () => {
  const app = loadApp();
  for (const [d, type] of [['VANGUARD SUPER', 'expense'], ['VANGUARD INVESTMENTS DISTRIBUTION', 'income'],
    ['STAKE.COM', 'expense'], ['MISTAKE REVERSAL', 'income'], ['DEFINITELY DELICIOUS BAKERY', 'expense'],
    ['ABTC CONSULTING', 'expense']]) {
    const got = categorise(app, d, type, 250);
    assert.notEqual(got, INVESTMENT, d);
    assert.ok(!got.startsWith('capital_gains'), d + ' → ' + got);
  }
  assert.equal(categorise(app, 'THE STAKEHOLDER CAFE', 'expense', 12), 'food_eating_out › Cafe and Lunches');
});

test('no built-in keyword files anything under Capital Gains any more', () => {
  const app = loadApp();
  for (const d of ['BTC SYDNEY', 'CRYPTO SYDNEY', 'NFT SYDNEY', 'BLACKROCK SYDNEY', 'ISHARES SYDNEY', 'ETHEREUM SYDNEY']) {
    for (const type of ['expense', 'income']) {
      assert.ok(!categorise(app, d, type, 42).startsWith('capital_gains'), d + ' ' + type);
    }
  }
});

test('everyday merchants are unaffected', () => {
  const app = loadApp();
  assert.equal(categorise(app, 'EFTPOS COLES 3421 EXAMPLEVILLE NSW', 'expense', 80).split(' › ')[0], 'food_eating_out');
  assert.equal(categorise(app, 'NETFLIX.COM', 'expense', 20).split(' › ')[0], 'entertainment');
});

test("the user's own rule for a description beats the built-in keywords", () => {
  const app = loadApp();
  // What saving a manual category does: an exact rule on the full (pre-alias) description
  app.writeExactRule(app.preprocessMerchantString('COMMSEC SECURITIES LTD'), 'transfers', 'Savings Transfer');
  assert.equal(categorise(app, 'COMMSEC SECURITIES LTD'), 'transfers › Savings Transfer');
});

test('employee share plan sale proceeds are bonus income', () => {
  const app = loadApp();
  for (const d of ['MORGAN STANLEY SMI PROCEEDS', 'SHAREWORKS ESPP SALE', 'EMPLOYEE SHARE PLAN PAYMENT']) {
    assert.equal(categorise(app, d, 'income', 15000), 'bonus › Work Bonus', d);
  }
});

test('dropping a rule from the built-in seeds leaves an existing install\'s stored copy alone', () => {
  const KEY = 'example local cafe';
  const stored = { catId: 'food_eating_out', subcat: 'Cafe and Lunches', pattern: 'contains', source: 'manual',
    confidence: 'HIGH', userModified: false };
  const store = { cff_seed_version: '2026-09-27-v1', ledger_rules: JSON.stringify({ [KEY]: stored }) };
  const app = loadApp({ store });
  assert.equal(categorise(app, 'EXAMPLE LOCAL CAFE', 'expense', 9), 'food_eating_out › Cafe and Lunches');
  assert.ok(app.LRULES[KEY]);
});

test('the built-in seeds hold no rules that could never match', () => {
  const app = loadApp();
  for (const [key, rule] of Object.entries(app.SEED_LRULES)) {
    if (rule.pattern === 'contains') assert.ok(key.length >= 4, key + ' is too short for a contains rule');
  }
});

test('a few dollars at a servo is a coffee, a full tank is petrol', () => {
  const app = loadApp();
  assert.equal(categorise(app, 'BP EXAMPLEVILLE NSW', 'expense', 6), 'food_eating_out › Cafe and Lunches');
  assert.equal(categorise(app, 'BP EXAMPLEVILLE NSW', 'expense', 70), 'car_transport › Petrol');
});

test('supermarkets are groceries whatever the amount', () => {
  const app = loadApp();
  assert.equal(categorise(app, 'COLES 1234 EXAMPLEVILLE', 'expense', 9), 'food_eating_out › Groceries');
  assert.equal(categorise(app, 'WOOLWORTHS 1234 EXAMPLEVILLE', 'expense', 9), 'food_eating_out › Groceries');
});

test('a BPAY to the Tax Office is income tax', () => {
  const app = loadApp();
  assert.equal(categorise(app, 'BPAY AUSTRALIAN TAX OFFICE', 'expense', 900), 'tax › Income Tax');
});

test('short keywords only match whole words', () => {
  const app = loadApp();
  assert.ok(!categorise(app, 'VELVET HAIR STUDIO', 'expense', 80).startsWith('pippen'));
  assert.ok(!categorise(app, 'TOYOTA EXAMPLEVILLE SERVICE', 'expense', 400).startsWith('children'));
  assert.equal(categorise(app, 'EXAMPLEVILLE VET CLINIC', 'expense', 120), 'pippen › Vet Bills');
});

test('aliases resolve to the plain brand, not one bank\'s wording of it', () => {
  const app = loadApp();
  assert.equal(app.resolveAlias('yoto player'), 'yoto');
  assert.equal(app.resolveAlias('met life insurance'), 'metlife');
  assert.equal(categorise(app, 'METLIFE INSURANCE', 'expense', 90), 'insurance_utilities › Life & Income Insurance');
});

test('Rescan moves auto-categorised broker payments but leaves hand-categorised ones alone', () => {
  const tx = [
    { id: 1, name: 'COMMSEC SECURITIES', type: 'expense', amount: 5000, catId: 'capital_gains', subcat: 'Shares' },
    { id: 2, name: 'COMMSEC SECURITIES', type: 'expense', amount: 5000, catId: 'capital_gains', subcat: 'Shares', correctionSource: 'user' },
  ];
  const app = loadApp({ tx });
  let changed = null;
  app.AutoCat.reprocess(null, (n) => { changed = n; });
  assert.equal(changed, 1);
  assert.deepEqual(tx.map((t) => t.catId + ' › ' + t.subcat), [INVESTMENT, 'capital_gains › Shares']);
});
