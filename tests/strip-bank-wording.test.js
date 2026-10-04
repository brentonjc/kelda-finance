// Bank-wording fallback in the auto-categoriser (js/pages/autocategorise.js): when the full
// description finds no category, the merchant name without "purchase at", "to … receipt number",
// the state code and so on is looked up, including learned rules filed under the same stripped key.
// Anything that matches today must keep exactly the same result.
// Run: node --test "tests/**/*.test.js"
// Every description here is made up or a national brand name. No real transactions.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');

function loadApp({ rules = {}, tx = [] } = {}) {
  const store = { ledger_rules: JSON.stringify(rules) };
  const el = () => ({ querySelector: () => null, appendChild() {}, parentNode: { removeChild() {} } });
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
    document: { createElement: el, getElementById: () => ({}), body: el() },
    toast() {},
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/storage.js'), 'utf8'), ctx, { filename: 'js/storage.js' });
  vm.runInContext('var LRULES = load(K.rules) || {};', ctx);
  ctx.TX = tx;
  ctx.LCATS = ['shopping', 'food_eating_out', 'home', 'business', 'transfers', 'car_transport', 'utilities',
    'entertainment', 'health_beauty'].map((id) => ({ id, name: id }));
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/pages/autocategorise.js'), 'utf8'), ctx,
    { filename: 'js/pages/autocategorise.js' });
  ctx.seedLRulesFromCSV();
  return ctx;
}

// What a CSV import assigns, as "catId › subcat" ('other' when nothing matched)
function cat(app, description, type = 'expense', amount = 40) {
  const r = app.AutoCat.categorise(description, '', amount, type);
  return r.catId + (r.subcat ? ' › ' + r.subcat : '');
}
// What Rescan assigns to an untouched transaction (or 'unchanged')
function rescan(app, description, type = 'expense', amount = 40) {
  const t = { id: 'r1', name: description, rawDescription: description, amount, type, catId: 'other', subcat: '' };
  app.TX = [t];
  app.AutoCat.reprocess(null, null);
  return t.catId === 'other' ? 'unchanged' : t.catId + (t.subcat ? ' › ' + t.subcat : '');
}

function userRule(catId, subcat, pattern = 'exact') {
  return { catId, subcat, pattern, source: 'manual', confidence: 'HIGH', userModified: true,
    matchCount: 0, lastMatchedAt: '', createdAt: '2026-01-01' };
}

const strip = (app, raw) => app.stripBankWording(app.preprocessMerchantString(raw));

test('the stripper keeps only the merchant or payee for each bank shape', () => {
  const app = loadApp();
  const cases = [
    ['PURCHASE AT EXAMPLE BOOKSHOP EXAMPLEVILLE NS', 'example bookshop exampleville'],
    ['Purchase at Example Cafe Exampleville NS', 'example cafe exampleville'],
    ['ONLINE PURCHASE FROM EXAMPLE GADGETS AU', 'example gadgets'],
    ['PURCHASE FROM EXAMPLE FLORIST SAMPLETON VI', 'example florist sampleton'],
    ['ONLINE PAYMENT TO EXAMPLE PLUMBING', 'example plumbing'],
    ['TO J EXAMPLE - DINNER', 'j example'],
    ['TO EXAMPLE STRATA RECEIPT NUMBER 12', 'example strata'],
    ['TO EXAMPLE CLUB FUNDS TRANSFER', 'example club'],
    ['TO A SAMPLE PAYMENT DESCRIPTION RENT', 'a sample'],
    ['TO EXAMPLE SAVER INTERNAL TRANSFER', 'example saver'],
    ['FROM K SAMPLE - LUNCH', 'k sample'],
    ['FROM EXAMPLE PTY LTD CREDIT TO ACCOUNT', 'example pty ltd'],
    ['FROM EXAMPLE FUND D/DBT', 'example fund'],
    ['EXAMPLE BAKERY SAMPLETON NZ', 'example bakery sampleton'],
  ];
  for (const [raw, want] of cases) assert.equal(strip(app, raw), want, raw);
});

test('the stripper leaves other text alone', () => {
  const app = loadApp();
  for (const raw of ['EXAMPLE BOOKSHOP', 'TOYOTA EXAMPLEVILLE', 'FROMAGE EXAMPLE', 'PURCHASER EXAMPLE',
    'EXAMPLE CO', 'TOKYO SUSHI EXAMPLEVILLE', 'EXAMPLE SALSA BAR']) {
    const pre = app.preprocessMerchantString(raw);
    assert.equal(app.stripBankWording(pre), pre, raw);
  }
  // never strips to nothing
  assert.equal(app.stripBankWording('purchase at'), 'purchase at');
  assert.equal(app.stripBankWording(''), '');
});

test('a description that matches today keeps exactly the same result on import and Rescan', () => {
  const rules = {
    'purchase at example deli exampleville ns': userRule('food_eating_out', 'Groceries'),
    'example deli exampleville': userRule('shopping', 'Gifts'),   // the stripped key must not take over
    'to example strata': userRule('home', 'Strata Fees', 'contains'),
    'example strata': userRule('business', 'Website and Digital'),
  };
  const app = loadApp({ rules });
  const table = [
    ['PURCHASE AT EXAMPLE DELI EXAMPLEVILLE NS', 'food_eating_out › Groceries'],
    ['TO EXAMPLE STRATA RECEIPT NUMBER 12', 'home › Strata Fees'],
    ['PURCHASE AT EXAMPLE CAFE EXAMPLEVILLE NS', 'food_eating_out › Cafe and Lunches'],   // keyword 'cafe'
    ['PURCHASE AT BUNNINGS EXAMPLEVILLE NS', 'shopping › Home Shopping'],   // keyword, not the stripped seed
    ['ONLINE PURCHASE FROM NETFLIX.COM AU', 'entertainment › Netflix'],
    ['TRANSFER TO EXAMPLE SAVER', 'transfers › Between Accounts'],
    ['WOOLWORTHS 1234 EXAMPLEVILLE', 'food_eating_out › Groceries'],
    ['UBER *EATS', 'food_eating_out › Uber Eats and Delivery'],
    ['VISA PURCHASE VODAFONE AU NSW', 'utilities › Mobile Phone Bills'],
  ];
  for (const [d, want] of table) {
    const full = app.AutoCat.categoriseFullText(d, '', 40, 'expense');
    assert.notEqual(full.confidence, app.AutoCat.CONF_NONE, d + ' should match on the full text');
    assert.equal(cat(app, d), full.catId + (full.subcat ? ' › ' + full.subcat : ''), d);
    assert.equal(cat(app, d), want, d);
    assert.equal(rescan(app, d), want, d + ' (rescan)');
  }
});

test('a description that matches today is identical with or without the fallback, across many shapes', () => {
  const app = loadApp({ rules: { 'example gym': userRule('health_beauty', 'Gym Memberships', 'contains') } });
  const merchants = ['WOOLWORTHS', 'COLES', 'EXAMPLE CAFE', 'EXAMPLE PIZZA', 'SHELL', 'BP', 'NETFLIX', 'SPOTIFY',
    'TELSTRA', 'EXAMPLE PHARMACY', 'EXAMPLE GYM', 'KMART', 'BUNNINGS', 'AMAZON', 'UBER', 'QANTAS', 'EXAMPLE HOTEL'];
  const shapes = [(m) => m, (m) => 'PURCHASE AT ' + m + ' EXAMPLEVILLE NS', (m) => 'ONLINE PURCHASE FROM ' + m + ' AU',
    (m) => 'TO ' + m + ' - RECEIPT NUMBER 5', (m) => 'FROM ' + m + ' CREDIT TO ACCOUNT', (m) => 'VISA PURCHASE ' + m + ' SYDNEY NSW'];
  let checked = 0;
  for (const m of merchants) {
    for (const shape of shapes) {
      for (const type of ['expense', 'income']) {
        const d = shape(m);
        const full = app.AutoCat.categoriseFullText(d, '', 40, type);
        if (full.confidence === app.AutoCat.CONF_NONE) continue;
        const now = app.AutoCat.categorise(d, '', 40, type);
        assert.deepEqual({ ...now }, { ...full }, d + ' (' + type + ')');
        checked++;
      }
    }
  }
  assert.ok(checked > 100, 'checked ' + checked);
});

test('bank wording around a built-in brand now finds the brand', () => {
  const app = loadApp();
  assert.equal(cat(app, 'SQUARESPACE'), 'business › Website and Digital');
  assert.equal(app.AutoCat.categoriseFullText('PURCHASE AT SQUARESPACE AU', '', 40, 'expense').confidence, app.AutoCat.CONF_NONE);
  assert.equal(cat(app, 'PURCHASE AT SQUARESPACE AU'), 'business › Website and Digital');
  assert.equal(rescan(app, 'PURCHASE AT SQUARESPACE AU'), 'business › Website and Digital');
});

test('a learned rule keyed on a whole bank description covers the other wordings of that merchant', () => {
  const app = loadApp({ rules: { 'purchase at example bookshop exampleville ns': userRule('shopping', 'Gifts') } });
  for (const d of ['PURCHASE AT EXAMPLE BOOKSHOP EXAMPLEVILLE NS', 'ONLINE PURCHASE FROM EXAMPLE BOOKSHOP EXAMPLEVILLE',
    'PURCHASE AT EXAMPLE BOOKSHOP EXAMPLEVILLE AU']) {
    assert.equal(cat(app, d), 'shopping › Gifts', d);
    assert.equal(rescan(app, d), 'shopping › Gifts', d + ' (rescan)');
  }
  assert.equal(cat(app, 'PURCHASE AT EXAMPLE BOOKSHOP OTHERTON NS'), 'other', 'an exact rule does not cover another suburb');
});

test('correcting a "purchase at" transaction writes the rule on the merchant and the suburb variant follows', () => {
  const tx = [
    { id: 't1', name: 'Purchase at Example Bookshop Exampleville NS', rawDescription: 'Purchase at Example Bookshop Exampleville NS', amount: 30, type: 'expense', catId: 'other', subcat: '' },
    { id: 't2', name: 'PURCHASE AT EXAMPLE BOOKSHOP EXAMPLEVILLE NS', rawDescription: 'PURCHASE AT EXAMPLE BOOKSHOP EXAMPLEVILLE NS', amount: 12, type: 'expense', catId: 'other', subcat: '' },
    { id: 't3', name: 'PURCHASE AT EXAMPLE BOOKSHOP OTHERTON VI', rawDescription: 'PURCHASE AT EXAMPLE BOOKSHOP OTHERTON VI', amount: 18, type: 'expense', catId: 'other', subcat: '' },
  ];
  const app = loadApp({ tx });
  assert.equal(cat(app, tx[0].name), 'other');
  app.onManualCategorySave(tx[0], 'shopping', 'Gifts');
  assert.equal(tx[0].correctionSource, 'user');
  assert.ok(app.LRULES['example bookshop exampleville'], 'rule on the merchant name');
  assert.equal(app.LRULES['purchase at example bookshop exampleville ns'], undefined, 'no rule on the bank wording');
  assert.equal(cat(app, 'PURCHASE AT EXAMPLE BOOKSHOP EXAMPLEVILLE NS'), 'shopping › Gifts');
  assert.equal(cat(app, 'ONLINE PURCHASE FROM EXAMPLE BOOKSHOP EXAMPLEVILLE'), 'shopping › Gifts');

  // Generalisation offers the merchant, not "purchase", and counts the other suburb as a variant
  app.offerGeneralisation('example bookshop exampleville', 'shopping', 'Gifts', 't1');
  const offer = app._toastQueue[0];
  assert.equal(offer.candidateKey, 'example');
  assert.equal(offer.variantCount, 2);
  // Accepting it covers the other suburb on import and Rescan, and flags the past one for review
  app.writeContainsRule(offer.candidateKey, 'shopping', 'Gifts');
  app.flagPastTransactions(offer.candidateKey, 'shopping', 'Gifts', 'contains', 't1');
  assert.equal(tx[2].reviewFlag, true);
  assert.equal(cat(app, 'PURCHASE AT EXAMPLE BOOKSHOP OTHERTON VI'), 'shopping › Gifts');
  assert.equal(cat(app, 'PURCHASE AT EXAMPLE BOOKSHOP SAMPLETON NS'), 'shopping › Gifts');
  const app2 = app;
  app2.TX = [tx[2]];
  app2.AutoCat.reprocess(null, null);
  assert.equal(tx[2].catId, 'shopping');
});

test('exact-key flagging finds past transactions by the merchant name too', () => {
  const tx = [
    { id: 'a', rawDescription: 'PURCHASE AT EXAMPLE BOOKSHOP EXAMPLEVILLE NS', amount: 9, type: 'expense', catId: 'other', subcat: '' },
    { id: 'b', rawDescription: 'ONLINE PURCHASE FROM EXAMPLE BOOKSHOP EXAMPLEVILLE', amount: 9, type: 'expense', catId: 'other', subcat: '' },
    { id: 'c', rawDescription: 'PURCHASE AT EXAMPLE BOOKSHOP OTHERTON NS', amount: 9, type: 'expense', catId: 'other', subcat: '' },
  ];
  const app = loadApp({ tx });
  assert.equal(app.flagPastTransactions('example bookshop exampleville', 'shopping', 'Gifts', 'exact', null), 2);
  assert.equal(tx[2].reviewFlag, undefined);
});

test('a correction the full text would still override keeps a rule on the full text too', () => {
  const tx = [{ id: 'k1', rawDescription: 'PURCHASE AT EXAMPLE CAFE EXAMPLEVILLE NS', amount: 60, type: 'expense', catId: 'food_eating_out', subcat: 'Cafe and Lunches' }];
  const app = loadApp({ tx });
  app.onManualCategorySave(tx[0], 'business', 'Website and Digital');
  assert.ok(app.LRULES['example cafe exampleville']);
  assert.ok(app.LRULES['purchase at example cafe exampleville ns'], 'the keyword "cafe" would otherwise still win');
  assert.equal(cat(app, 'PURCHASE AT EXAMPLE CAFE EXAMPLEVILLE NS', 'expense', 60), 'business › Website and Digital');
  assert.equal(rescan(app, 'PURCHASE AT EXAMPLE CAFE EXAMPLEVILLE NS', 'expense', 60), 'business › Website and Digital');
  // Known limit: another wording of a "cafe" still gets the keyword's category, because the
  // merchant name is only looked up when the full text finds nothing
  assert.equal(cat(app, 'PURCHASE AT EXAMPLE CAFE EXAMPLEVILLE AU'), 'food_eating_out › Cafe and Lunches');
});

test('an existing rule on the full description is updated, not left to override the correction', () => {
  const tx = [{ id: 'u1', rawDescription: 'PURCHASE AT EXAMPLE BOOKSHOP EXAMPLEVILLE NS', amount: 20, type: 'expense', catId: 'home', subcat: 'Maintenance' }];
  const app = loadApp({ tx, rules: { 'purchase at example bookshop exampleville ns': userRule('home', 'Maintenance') } });
  app.onManualCategorySave(tx[0], 'shopping', 'Gifts');
  assert.equal(app.LRULES['purchase at example bookshop exampleville ns'].catId, 'shopping');
  assert.equal(cat(app, 'PURCHASE AT EXAMPLE BOOKSHOP EXAMPLEVILLE NS'), 'shopping › Gifts');
});

test('learned keys holding "*", a trailing ")" or a reference number are reachable now', () => {
  const rules = {
    'example *studio': userRule('health_beauty', 'Haircuts'),
    'example tutoring (sampleton)': userRule('home', 'Maintenance'),
    'to example rentals on0000123456': userRule('home', 'Strata Fees'),
    'example plumbing 1234567': userRule('home', 'Maintenance'),
  };
  const app = loadApp({ rules });
  const none = (d) => app.AutoCat.categoriseFullText(d, '', 40, 'expense').confidence === app.AutoCat.CONF_NONE;
  for (const d of ['PURCHASE AT EXAMPLE *STUDIO NS', 'PURCHASE AT EXAMPLE TUTORING (SAMPLETON) NS',
    'TO EXAMPLE RENTALS ON0000987654 - RECEIPT NUMBER 7', 'ONLINE PAYMENT TO EXAMPLE PLUMBING 7654321']) {
    assert.ok(none(d), d + ' finds nothing on the full text');
  }
  assert.equal(cat(app, 'PURCHASE AT EXAMPLE *STUDIO NS'), 'health_beauty › Haircuts');
  assert.equal(cat(app, 'PURCHASE AT EXAMPLE TUTORING (SAMPLETON) NS'), 'home › Maintenance');
  assert.equal(cat(app, 'TO EXAMPLE RENTALS ON0000987654 - RECEIPT NUMBER 7'), 'home › Strata Fees');
  assert.equal(rescan(app, 'TO EXAMPLE RENTALS ON0000987654 - RECEIPT NUMBER 7'), 'home › Strata Fees');
  assert.equal(cat(app, 'ONLINE PAYMENT TO EXAMPLE PLUMBING 7654321'), 'home › Maintenance');
});

test('two rules filing the same merchant under different categories match neither', () => {
  const app = loadApp({ rules: {
    'purchase at example market exampleville ns': userRule('food_eating_out', 'Groceries'),
    'online purchase from example market exampleville': userRule('shopping', 'Gifts'),
  } });
  assert.equal(cat(app, 'ONLINE PAYMENT TO EXAMPLE MARKET EXAMPLEVILLE'), 'other');
  // each full description still hits its own rule
  assert.equal(cat(app, 'PURCHASE AT EXAMPLE MARKET EXAMPLEVILLE NS'), 'food_eating_out › Groceries');
});

test("the user's rule wins over a built-in one with the same merchant name", () => {
  const app = loadApp({ rules: { 'purchase at godaddy au': userRule('home', 'Maintenance') } });
  assert.equal(cat(app, 'ONLINE PURCHASE FROM GODADDY NZ'), cat(app, 'GODADDY'),
    'the built-in rule on the merchant name is found first by the normal rule pass');
  const app2 = loadApp({ rules: {
    'purchase at example gadgets ns': userRule('shopping', 'Gifts'),
    'example gadgets': { catId: 'business', subcat: 'Website and Digital', pattern: 'contains', source: 'manual', confidence: 'HIGH', userModified: false },
  } });
  assert.equal(app2.ruleIndexHit('example gadgets').catId, 'shopping');
});

test('keys under 3 characters and short prefix rules are not indexed', () => {
  const app = loadApp({ rules: { 'to ab': userRule('home', 'Maintenance'), 'purchase at exa': userRule('home', 'Maintenance', 'contains') } });
  assert.equal(app.ruleIndexHit('ab'), null);
  assert.equal(app.ruleIndexHit('exa something'), null);
  assert.equal(app.ruleIndexHit('exa').catId, 'home', 'a 3-character key still matches exactly');
});

test('the index follows changes to the rules', () => {
  const app = loadApp();
  assert.equal(cat(app, 'PURCHASE AT EXAMPLE KIOSK EXAMPLEVILLE NS'), 'other');
  app.LRULES['purchase at example kiosk exampleville ns'] = userRule('shopping', 'Gifts');
  assert.equal(cat(app, 'ONLINE PURCHASE FROM EXAMPLE KIOSK EXAMPLEVILLE'), 'shopping › Gifts');
  app.LRULES['purchase at example kiosk exampleville ns'].catId = 'home';
  app.LRULES['purchase at example kiosk exampleville ns'].subcat = 'Maintenance';
  assert.equal(cat(app, 'ONLINE PURCHASE FROM EXAMPLE KIOSK EXAMPLEVILLE'), 'home › Maintenance');
  delete app.LRULES['purchase at example kiosk exampleville ns'];
  assert.equal(cat(app, 'ONLINE PURCHASE FROM EXAMPLE KIOSK EXAMPLEVILLE'), 'other');
  app.LRULES = { 'to example kiosk': userRule('business', 'Website and Digital') };
  assert.equal(cat(app, 'ONLINE PURCHASE FROM EXAMPLE KIOSK EXAMPLEVILLE'), 'other');
  assert.equal(cat(app, 'PURCHASE AT EXAMPLE KIOSK'), 'business › Website and Digital');
});

test('keyword exclusions still see the full description', () => {
  const app = loadApp();
  // "vanguard" is an investment transfer unless the description says distribution
  assert.notEqual(cat(app, 'FROM VANGUARD - DISTRIBUTION', 'income', 120), 'transfers › Investment Transfer');
});

test('Rescan leaves transactions the user set alone', () => {
  const tx = [
    { id: 's1', rawDescription: 'PURCHASE AT SQUARESPACE AU', amount: 20, type: 'expense', catId: 'home', subcat: 'Maintenance', correctionSource: 'user' },
    { id: 's2', rawDescription: 'PURCHASE AT SQUARESPACE AU', amount: 20, type: 'expense', catId: 'other', subcat: '', userSet: true },
    { id: 's3', rawDescription: 'PURCHASE AT SQUARESPACE AU', amount: 20, type: 'expense', catId: 'other', subcat: '' },
  ];
  const app = loadApp({ tx });
  let changed = null;
  app.AutoCat.reprocess(null, (n) => { changed = n; });
  assert.equal(changed, 1);
  assert.equal(tx[0].catId, 'home');
  assert.equal(tx[1].catId, 'other');
  assert.equal(tx[2].catId, 'business');
});

test('correcting one purchase never changes a brand-wide rule', () => {
  const tx = [{ id: 'b1', rawDescription: 'PURCHASE AT SQUARESPACE AU', amount: 30, type: 'expense', catId: 'business', subcat: 'Website and Digital' }];
  const app = loadApp({ tx });
  assert.equal(app.LRULES.squarespace.pattern, 'contains');
  app.onManualCategorySave(tx[0], 'shopping', 'Gifts');
  assert.equal(app.LRULES.squarespace.catId, 'business', 'the built-in brand rule is untouched');
  assert.equal(app.LRULES['purchase at squarespace au'].catId, 'shopping', 'the correction is kept on the full text');
  assert.equal(cat(app, 'PURCHASE AT SQUARESPACE AU'), 'shopping › Gifts');
  assert.equal(cat(app, 'SQUARESPACE'), 'business › Website and Digital');
});

test('locking clears the rule index along with the rules', () => {
  const app = loadApp({ rules: { 'purchase at example kiosk ns': userRule('shopping', 'Gifts') } });
  assert.equal(app.ruleIndexHit('example kiosk').catId, 'shopping');
  app.resetRuleIndex();
  assert.equal(vm.runInContext('_ruleIndex', app), null);
  assert.equal(Object.keys(vm.runInContext('_ruleKeyNorm', app)).length, 0);
});
