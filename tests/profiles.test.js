// Unit tests for js/profiles.js secondUserOn: the second person is off unless
// it was turned on, and older configs without the p2enabled flag only count
// as two-person when there's real evidence of a second profile.
// Run: node --test "tests/**/*.test.js"
// Every record here is made up.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js/profiles.js'), 'utf8'), ctx, { filename: 'js/profiles.js' });
const { secondUserOn } = ctx;

test('a brand-new install has no second person', () => {
  assert.equal(secondUserOn({}, {}), false);
  assert.equal(secondUserOn(undefined, undefined), false);
  assert.equal(secondUserOn({ p1name: 'Tom' }, { brenton: 'a'.repeat(64) }), false);
});

test('the p2enabled flag wins when it is set', () => {
  assert.equal(secondUserOn({ p2enabled: true }, {}), true);
  assert.equal(secondUserOn({ p2enabled: false, p2name: 'Sam' }, { shelley: 'b'.repeat(64) }), false);
});

test('an old config with a second PIN keeps its second person', () => {
  assert.equal(secondUserOn({ p1name: 'Tom' }, { brenton: 'a'.repeat(64), shelley: 'b'.repeat(64) }), true);
});

test('an old config with a real second name keeps its second person', () => {
  assert.equal(secondUserOn({ p2name: 'Sam' }, {}), true);
});

test('the placeholder name or a blank name is not a second person', () => {
  assert.equal(secondUserOn({ p2name: 'Profile 2' }, {}), false);
  assert.equal(secondUserOn({ p2name: '   ' }, {}), false);
});
