// ══════════════════════════════════════════════════════════════
// Kelda Finance — Icon System
// Single source of truth for icon rendering. Replaces ad-hoc emoji
// with the Tabler icon font already loaded in index.html.
//
// - ICON(key, opts)        → HTML string for a Tabler icon tag
// - legacyIconToKey(value) → maps an old emoji (or already-migrated
//                            key) stored in localStorage to a Tabler
//                            icon key, so existing family data upgrades
//                            automatically without a destructive migration.
// ══════════════════════════════════════════════════════════════

// Legacy emoji glyph → Tabler icon key. Keys are used as the canonical
// stored value going forward (categories, accounts, goals, bills).
const EMOJI_TO_ICON_KEY = {
  // Home / property
  '🏠':'home','🏡':'home-2','🏢':'building','🏘':'building-community','🏘️':'building-community',
  // Transport
  '🚗':'car','🚌':'bus',
  // Health / body
  '❤':'heart','❤️':'heart','💛':'heart','💚':'heart','💔':'heart-broken','💊':'pill','🏋':'barbell','🏋️':'barbell',
  // Food
  '🍽':'tools-kitchen-2','🍽️':'tools-kitchen-2','🍺':'beer','🍕':'pizza','🍎':'apple','☕':'coffee',
  // Family
  '👶':'baby-carriage','👤':'user','👩':'user','👨':'user','🧑':'user','👱':'user','👫':'users','🧔':'user',
  // Pets
  '🐾':'paw','🐕':'paw','🐶':'paw',
  // Insurance / protection
  '🛡':'shield-check','🛡️':'shield-check',
  // Utilities
  '💡':'bulb','💧':'droplet','🚿':'droplet','📡':'antenna',
  // Entertainment
  '🎬':'movie','🎵':'music','🎮':'device-gamepad-2','🎭':'mask',
  // Travel
  '✈':'plane','✈️':'plane','🏖':'beach','🏖️':'beach','🏕':'tent','🏕️':'tent',
  // Shopping
  '🛍':'shopping-bag','🛍️':'shopping-bag','🛒':'shopping-cart',
  // Money / finance
  '💰':'coin','💵':'cash','💸':'cash-off','💱':'currency-dollar','💲':'currency-dollar',
  '🏦':'building-bank','🏪':'building-store','💳':'credit-card','💎':'diamond','💍':'diamond',
  '📈':'trending-up','📉':'trending-down','💹':'chart-candle',
  // Bills / documents
  '🧾':'receipt','📋':'clipboard-list','📄':'file-text','📝':'notes','📚':'books','📖':'book',
  // Work
  '💼':'briefcase','💻':'device-laptop',
  // Status / actions
  '✅':'circle-check-filled','✓':'check','✔':'check','✔️':'check',
  '⚠':'alert-triangle','⚠️':'alert-triangle','🚨':'alert-triangle','❗':'exclamation-mark',
  '❌':'x','✕':'x','✗':'x','🗑':'trash','🗑️':'trash','✏':'pencil','✏️':'pencil',
  '➕':'plus','🔴':'circle-filled','🟡':'circle-filled',
  // Nav / misc UI
  '📊':'chart-bar','🎯':'target','📅':'calendar','⚡':'bolt','🔗':'link',
  '🔒':'lock','🔓':'lock-open','🔑':'key','🏷':'tag','🏷️':'tag',
  '🤖':'robot','📱':'device-mobile','📂':'folder','⚙':'settings','⚙️':'settings',
  '🔧':'tool','🛠':'tools','🛠️':'tools','🎓':'school','🎉':'confetti',
  '🔎':'search','🔍':'search','⚖':'scale','🌟':'star','⭐':'star','✦':'sparkles','✨':'sparkles',
  '♿':'wheelchair','🚀':'rocket','🔥':'flame','💪':'flame',
  '📥':'download','📤':'upload','👋':'hand-stop','🤝':'handshake',
  '🔮':'sparkles','🔢':'123','🔀':'arrows-shuffle','📷':'camera','🔔':'bell',
  '🏆':'trophy','👁':'eye','🎚':'adjustments','🧴':'bottle','💈':'scissors',
  '🌿':'leaf','🌺':'flower','🌱':'seedling','🌍':'world','⚽':'ball-football',
  '❓':'help','⚿':'key','🎁':'gift','🔄':'refresh','★':'star'
};

// Tabler icon key → default render. Everything routes through here so
// color/size can be controlled from one place.
function ICON(key, opts) {
  opts = opts || {};
  var cls = 'ti ti-' + key + (opts.cls ? ' ' + opts.cls : '');
  var style = opts.style || '';
  return '<i class="' + cls + '"' + (style ? ' style="' + style + '"' : '') + '></i>';
}

// Given a value that might be a legacy emoji OR an already-migrated
// icon key, return the canonical Tabler icon key.
function legacyIconToKey(value) {
  if (!value) return 'tag';
  if (EMOJI_TO_ICON_KEY[value]) return EMOJI_TO_ICON_KEY[value];
  // Already a plain key (e.g. 'home') — pass through.
  if (/^[a-z0-9-]+$/i.test(value)) return value;
  return 'tag';
}

// Render helper for any stored icon field (emoji legacy or key) — use this
// at render sites instead of interpolating cat.icon / acct.icon directly.
function iconTag(value, opts) {
  return ICON(legacyIconToKey(value), opts);
}

// Curated set offered in icon pickers (categories, accounts, goals).
const ICON_PICKER_SET = [
  'home','home-2','building','car','bus','heart','pill','barbell',
  'tools-kitchen-2','beer','pizza','apple','coffee','baby-carriage','users',
  'paw','shield-check','bulb','droplet','movie','music','device-gamepad-2',
  'plane','beach','tent','shopping-bag','shopping-cart','coin','cash',
  'building-bank','building-store','credit-card','diamond','trending-up',
  'receipt','clipboard-list','file-text','notes','books','briefcase',
  'device-laptop','target','calendar','bolt','link','lock','tag','robot',
  'device-mobile','folder','settings','tool','school','confetti','search',
  'scale','star','sparkles','wheelchair','rocket','flame','gift','trophy',
  'world','leaf','flower','plus','tag-3'
];
