// ══════════════════════════════════════════════════════════════
// PROFILES — is a second person set up?
//   The second person ('shelley' profile id) is opt-in. Pure logic only, so
//   tests/profiles.test.js can load it; the DOM side lives in app.js.
// ══════════════════════════════════════════════════════════════

// cfg is USER_CONFIG, pins is PINS. Onboarding, the wizard and Settings all
// write cfg.p2enabled. Configs saved before that flag existed fall back to
// signs that a second person was really set up: their own PIN, or a name
// other than the 'Profile 2' placeholder.
function secondUserOn(cfg, pins) {
  cfg = cfg || {};
  if (typeof cfg.p2enabled === 'boolean') return cfg.p2enabled;
  if (pins && pins.shelley) return true;
  var name = String(cfg.p2name || '').trim();
  return name !== '' && name !== 'Profile 2';
}
