// ══════════════════════════════════════════════════════════════
// CATEGORY MANAGEMENT
// ══════════════════════════════════════════════════════════════

// Map of known bad/legacy catIds → correct LCATS id
var _LEGACY_CAT_MAP = {
  // from old autocategorise.js (wrong generic ids)
  'groceries':       'food_eating_out',
  'dining':          'food_eating_out',
  'transport':       'car_transport',
  'health':          'health_beauty',
  'mortgage':        'home',
  'utilities':       'home',
  'travel':          'holidays_travel',
  'insurance':       'insurance_utilities',
  'super':           'other',
  'charity':         'shopping',
  'family':          'children',
  'tax':             'business',
  'income':          'salary',
  'pet':             'pippen',
  'education':       'business',
  // capitalisation variants
  'Other':           'other',
  'Transfers':       'transfers',
  'Shopping':        'shopping',
  'Business':        'business',
  'Fitness':         'fitness',
  'Entertainment':   'entertainment',
  'Home':            'home',
  'Salary':          'salary',
  'Bonus':           'bonus',
  'Interest':        'interest',
  // old category name strings used as ids
  'Food & Eating Out':       'food_eating_out',
  'Car & Transport':         'car_transport',
  'Health & Beauty':         'health_beauty',
  'Insurance & Utilities':   'insurance_utilities',
  'Holidays & Travel':       'holidays_travel',
  'Children Expenses':       'children',
  'Business Costs':          'business',
  'Capital Gains':           'capital_gains',
  'Pippen':                  'pippen',
  'Pets':                    'pippen',
  // Sports & Fitness → fitness
  'sports_fitness':          'fitness',
  'sport_fitness':           'fitness',
  'Sports & Fitness':        'fitness',
  'sports and fitness':      'fitness',
};

// Comprehensive subcat → {catId, subcat} map.
// Applied to ALL transactions regardless of current category.
// If catId matches current and subcat matches current, it's a no-op.
var _SUBCAT_FULL_MAP = {
  // ── Food & Eating Out — subcat renames (stay in category) ───
  'supermarket':                    { catId:'food_eating_out', subcat:'Groceries' },
  'butcher':                        { catId:'food_eating_out', subcat:'Groceries' },
  'bakery':                         { catId:'food_eating_out', subcat:'Groceries' },
  'deli / specialty':               { catId:'food_eating_out', subcat:'Groceries' },
  'deli':                           { catId:'food_eating_out', subcat:'Groceries' },
  'fruit & veg':                    { catId:'food_eating_out', subcat:'Groceries' },
  'restaurants':                    { catId:'food_eating_out', subcat:'Eating Out (Cafes, Restaurant Food)' },
  'restaurant':                     { catId:'food_eating_out', subcat:'Eating Out (Cafes, Restaurant Food)' },
  'fast food':                      { catId:'food_eating_out', subcat:'Eating Out (Cafes, Restaurant Food)' },
  'takeaway':                       { catId:'food_eating_out', subcat:'Eating Out (Cafes, Restaurant Food)' },
  'cafe':                           { catId:'food_eating_out', subcat:'Cafe and Lunches' },
  'coffee':                         { catId:'food_eating_out', subcat:'Cafe and Lunches' },
  'coffee & tea':                   { catId:'food_eating_out', subcat:'Cafe and Lunches' },
  'coffee and tea':                 { catId:'food_eating_out', subcat:'Cafe and Lunches' },
  'alcohol & bars':                 { catId:'food_eating_out', subcat:'Alcohol and Bars' },
  'other food expenses':            { catId:'food_eating_out', subcat:'' },
  // ── Food wrongly used for other categories — move them ──────
  'pharmacies':                     { catId:'health_beauty',   subcat:'Pharmacy' },
  'pet food':                       { catId:'pippen',          subcat:'Pet Food' },
  'charities':                      { catId:'shopping',        subcat:'Donations' },
  'parking & tolls':                { catId:'car_transport',   subcat:'Tolls' },
  'public transit':                 { catId:'car_transport',   subcat:'Public Transport' },
  // ── Health & Beauty — renames & additions ───────────────────
  'eyes':                           { catId:'health_beauty',   subcat:'Doctors, Health, Specialists' },
  'eye care':                       { catId:'health_beauty',   subcat:'Doctors, Health, Specialists' },
  'optometrist':                    { catId:'health_beauty',   subcat:'Doctors, Health, Specialists' },
  'glasses':                        { catId:'health_beauty',   subcat:'Doctors, Health, Specialists' },
  'contact lenses':                 { catId:'health_beauty',   subcat:'Doctors, Health, Specialists' },
  'vision':                         { catId:'health_beauty',   subcat:'Doctors, Health, Specialists' },
  'health expenses':                { catId:'health_beauty',   subcat:'Doctors, Health, Specialists' },
  'medical':                        { catId:'health_beauty',   subcat:'Doctors, Health, Specialists' },
  'dentist':                        { catId:'health_beauty',   subcat:'Doctors, Health, Specialists' },
  'dental':                         { catId:'health_beauty',   subcat:'Doctors, Health, Specialists' },
  'massages':                       { catId:'health_beauty',   subcat:'Nails, Beauty & Other Errands' },
  'massage':                        { catId:'health_beauty',   subcat:'Nails, Beauty & Other Errands' },
  'beauty':                         { catId:'health_beauty',   subcat:'Nails, Beauty & Other Errands' },
  // ── Car & Transport — renames ────────────────────────────────
  'toll':                           { catId:'car_transport',   subcat:'Tolls' },
  'uber':                           { catId:'car_transport',   subcat:'Ubers and Taxis' },
  'taxi':                           { catId:'car_transport',   subcat:'Ubers and Taxis' },
  'rideshare':                      { catId:'car_transport',   subcat:'Ubers and Taxis' },
  'parking':                        { catId:'car_transport',   subcat:'Car Parking' },
  'rego':                           { catId:'car_transport',   subcat:'Registration' },
  'fuel':                           { catId:'car_transport',   subcat:'Petrol' },
  // ── Children — renames ───────────────────────────────────────
  'activities':                     { catId:'children',        subcat:'Children Activities' },
  'children activities':            { catId:'children',        subcat:'Children Activities' },
  'daycare':                        { catId:'children',        subcat:'Childcare' },
  'nanny':                          { catId:'children',        subcat:'Nannies & Carers' },
  // ── Shopping — renames ───────────────────────────────────────
  "children's clothing":            { catId:'shopping',        subcat:'Clothing & Shopping' },
  'childrens clothing':             { catId:'shopping',        subcat:'Clothing & Shopping' },
  'clothing':                       { catId:'shopping',        subcat:'Clothing & Shopping' },
  'gifts':                          { catId:'shopping',        subcat:'Gifts' },
  'donations':                      { catId:'shopping',        subcat:'Donations' },
  'charities':                      { catId:'shopping',        subcat:'Donations' },
  // ── Home — renames ───────────────────────────────────────────
  'dry cleaning':                   { catId:'home',            subcat:'House Cleaning' },
  'furnishings':                    { catId:'shopping',        subcat:'Home Shopping' },
  // ── Pets — fix daycare misassignment ────────────────────────
  'dog daycare':                    { catId:'pippen',          subcat:'Pet Supplies' },
  // ── Transfers ────────────────────────────────────────────────
  'transfers':                      { catId:'transfers',       subcat:'Between Accounts' },
  // ── → Uncategorised (no matching standard category) ─────────
  'auto payments':                  { catId:'uncategorised',   subcat:'' },
  'auto payment':                   { catId:'uncategorised',   subcat:'' },
  'automatic payment':              { catId:'uncategorised',   subcat:'' },
  'postage':                        { catId:'uncategorised',   subcat:'' },
  'post':                           { catId:'uncategorised',   subcat:'' },
  'courier':                        { catId:'uncategorised',   subcat:'' },
  'government':                     { catId:'uncategorised',   subcat:'' },
  'other business expenses':        { catId:'uncategorised',   subcat:'' },
  'other personal expenses':        { catId:'uncategorised',   subcat:'' },
  'other insurance expenses':       { catId:'uncategorised',   subcat:'' },
  'services':                       { catId:'uncategorised',   subcat:'' },
  'direct debit':                   { catId:'uncategorised',   subcat:'' },
};

// Category name variations → catId
var _CAT_NAME_TO_CAT = {
  'food':                           'food_eating_out',
  'food and eating out':            'food_eating_out',
  'eating out':                     'food_eating_out',
  'health and beauty':              'health_beauty',
  'health & beauty':                'health_beauty',
  'health expenses':                'health_beauty',
  'medical expenses':               'health_beauty',
  'car and transport':              'car_transport',
  'car & transport':                'car_transport',
  'transport':                      'car_transport',
  'insurance and utilities':        'insurance_utilities',
  'insurance & utilities':          'insurance_utilities',
  'utilities':                      'insurance_utilities',
  'holidays and travel':            'holidays_travel',
  'holidays & travel':              'holidays_travel',
  'travel':                         'holidays_travel',
  'children expenses':              'children',
  'kids':                           'children',
  'family':                         'children',
  'pet':                            'pippen',
  'pets':                           'pippen',
  'pippen':                         'pippen',
  'business costs':                 'business',
  'capital gains':                  'capital_gains',
};

// Returns true if this transaction was deliberately resolved by the user
// (manually assigned, or matched by a confirmed LRULE).
// Passes 2–4 of the fix function and AutoCat.reprocess() skip these.
function isResolvedTx(t) {
  if (t.userSet) return true;
  var key = ruleKey(t);
  return !!(key && LRULES[key]);
}

function resolveValidCatId(catId, categoryName, subcat) {
  // Already valid and not 'other' — leave it
  if (catId && catId !== 'other' && LCATS.find(function(c){ return c.id === catId; })) return catId;
  // Known legacy id mapping
  if (catId && catId !== 'other' && _LEGACY_CAT_MAP[catId]) return _LEGACY_CAT_MAP[catId];
  // Case-insensitive id match
  if (catId && catId !== 'other') {
    var lower = catId.toLowerCase();
    var byId = LCATS.find(function(c){ return c.id.toLowerCase() === lower; });
    if (byId) return byId.id;
  }
  // Try category name (exact then case-insensitive)
  if (categoryName && categoryName !== 'Other' && categoryName !== 'other') {
    var byName = LCATS.find(function(c){ return c.name === categoryName; });
    if (byName) return byName.id;
    var nameLower = categoryName.toLowerCase();
    var byNameCI = LCATS.find(function(c){ return c.name.toLowerCase() === nameLower; });
    if (byNameCI) return byNameCI.id;
    // Lookup in name variants map
    if (_CAT_NAME_TO_CAT[nameLower]) return _CAT_NAME_TO_CAT[nameLower];
  }
  // Try subcat → catId via full map
  if (subcat) {
    var subcatLower = subcat.toLowerCase().trim();
    var fullMatch = _SUBCAT_FULL_MAP[subcatLower];
    if (fullMatch) return fullMatch.catId;
  }
  return 'other';
}

function runFixOrphaned() {
  var el = document.getElementById('fix-orphan-result');
  var btn = document.querySelector('[onclick="runFixOrphaned()"]');
  if (btn) btn.disabled = true;
  if (el) { el.style.color = 'var(--muted)'; el.textContent = 'Step 1/2: fixing invalid categories…'; }

  // Step 1 — fix legacy/invalid catIds and subcat renames
  var fixed = fixOrphanedTxCats();

  if (el) el.textContent = 'Step 2/2: applying keyword rules…';

  // Step 2 — re-run AutoCat keyword rules across all transactions
  if (typeof AutoCat !== 'undefined') {
    AutoCat.reprocess(
      null,
      function(reprocessed) {
        if (btn) btn.disabled = false;
        var total = fixed + reprocessed;
        if (el) {
          el.style.color = total > 0 ? 'var(--success)' : 'var(--muted)';
          el.textContent = total > 0
            ? fixed + ' legacy fixed, ' + reprocessed + ' re-categorised ✓'
            : 'Nothing to fix';
          setTimeout(function(){ el.textContent = ''; }, 6000);
        }
        if (typeof renderTx === 'function') renderTx();
        if (typeof renderDashboard === 'function') renderDashboard();
        if (typeof renderRulesList === 'function') renderRulesList();
        toast('🔧 Done — ' + total + ' transaction' + (total !== 1 ? 's' : '') + ' updated');
      }
    );
  } else {
    if (btn) btn.disabled = false;
    if (el) {
      el.style.color = fixed > 0 ? 'var(--success)' : 'var(--muted)';
      el.textContent = fixed > 0 ? fixed + ' transactions fixed ✓' : 'Nothing to fix';
      setTimeout(function(){ el.textContent = ''; }, 5000);
    }
    if (fixed > 0) {
      if (typeof renderTx === 'function') renderTx();
      if (typeof renderDashboard === 'function') renderDashboard();
    }
    toast(fixed > 0 ? '🔧 Fixed ' + fixed + ' transaction' + (fixed !== 1 ? 's' : '') : '✅ Nothing to fix');
  }
}

function fixOrphanedTxCats() {
  var validIds = new Set(LCATS.map(function(c){ return c.id; }));
  // Build a set of valid subcats per catId for final validation
  var validSubcats = {};
  LCATS.forEach(function(c) {
    validSubcats[c.id] = new Set((c.subcats || []).map(function(s){ return s.toLowerCase(); }));
  });

  var fixed = 0;
  TX.forEach(function(t) {
    var changed = false;

    // ── Pass 1: Fix truly invalid catIds (runs on every transaction) ─
    // Even user-resolved transactions can have stale catIds from old data.
    if (!validIds.has(t.catId)) {
      var newId = resolveValidCatId(t.catId, t.category, t.subcat);
      var c1 = LCATS.find(function(c){ return c.id === newId; });
      t.catId    = newId;
      t.category = c1 ? c1.name : 'Uncategorised';
      changed = true;
    }

    // Passes 2–4 are skipped for transactions the user has manually resolved
    // (manually assigned via UI, or matched by a confirmed LRULE).
    if (!isResolvedTx(t)) {

      // ── Pass 2: Apply _SUBCAT_FULL_MAP (cross-category remaps) ───
      if (t.subcat) {
        var mapKey = t.subcat.toLowerCase().trim();
        var remap = _SUBCAT_FULL_MAP[mapKey];
        if (remap) {
          var c2 = LCATS.find(function(c){ return c.id === remap.catId; });
          if (c2) {
            t.catId    = remap.catId;
            t.category = c2.name;
            t.subcat   = remap.subcat;
            changed = true;
          }
        }
      }

      // ── Pass 3: Re-map 'other' with subcat clue ───────────────
      if (t.catId === 'other' && t.subcat) {
        t.catId    = 'uncategorised';
        t.category = 'Uncategorised';
        changed = true;
      }

      // ── Pass 4: Clear subcat if not in the category's list ────
      if (t.subcat && t.catId !== 'uncategorised' && t.catId !== 'other') {
        var catSubcats = validSubcats[t.catId];
        if (catSubcats && catSubcats.size > 0 && !catSubcats.has(t.subcat.toLowerCase())) {
          t.subcat = '';
          changed = true;
        }
      }
    }

    if (changed) fixed++;
  });

  if (fixed > 0) {
    try { save(K.tx, TX); } catch(e) {}
  }
  return fixed;
}

function getCat(idOrName) {
  return LCATS.find(c => c.id === idOrName || c.name === idOrName);
}

function catIdFor(name) {
  if (!name) return 'other';
  const c = LCATS.find(c => c.name === name || c.id === name);
  return c ? c.id : 'other';
}

function catNameFor(idOrName) {
  if (!idOrName) return 'Uncategorised';
  const c = LCATS.find(c => c.id === idOrName || c.name === idOrName);
  return c ? c.name : (idOrName || 'Uncategorised');
}

function buildCatOptions(currentCatIdOrName) {
  const currentId = catIdFor(currentCatIdOrName);
  return '<option value="">Uncategorised</option>'
    + LCATS.map(c => {
        const safeIcon = c.icon.replace(/\ufe0f|\ufe0e/g, '');
        return '<option value="' + c.id + '"' + (c.id === currentId ? ' selected' : '') + '>'
          + safeIcon + ' ' + c.name + '</option>';
      }).join('');
}

function updateTxBulkSelects() {
  const sel = document.getElementById('tx-bulk-cat');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Pick category —</option>'
    + LCATS.map(c => '<option value="' + c.id + '">' + c.icon + ' ' + c.name + '</option>').join('');
}

// Sync existing transactions: map old string category names to new cat IDs if needed
function migrateTxCategories() {
  let changed = false;
  TX.forEach(t => {
    if (!t.catId) {
      const c = LCATS.find(c => c.name.toLowerCase() === (t.category || '').toLowerCase());
      t.catId = c ? c.id : catIdFor(t.category);
      changed = true;
    }
  });
  if (changed) save(K.tx, TX);
}



function renameCategory(id) {
  const cat = LCATS.find(c => c.id === id);
  if (!cat) return;
  const newName = prompt('Rename "' + cat.name + '" to:', cat.name);
  if (!newName || !newName.trim() || newName.trim() === cat.name) return;
  cat.name = newName.trim();
  save(K.categories, LCATS);
  // Update transactions that use this category name (legacy)
  TX.forEach(t => { if (t.catId === id) t.category = newName.trim(); });
  save(K.tx, TX);
  renderCategories(); renderTx(); toast('✅ Renamed');
}

function deleteCategory(id) {
  const cat = LCATS.find(c => c.id === id);
  if (!cat) return;
  const count = TX.filter(t => t.catId === id || t.category === cat.name).length;
  if (!confirm('Delete "' + cat.name + '"? ' + (count ? count + ' transactions will become Uncategorised.' : 'No transactions assigned.'))) return;
  LCATS = LCATS.filter(c => c.id !== id);
  save(K.categories, LCATS);
  TX.forEach(t => { if (t.catId === id) { t.catId = 'other'; t.category = 'Other'; } });
  save(K.tx, TX);
  if (LBUDGETS[id]) { delete LBUDGETS[id]; save(K.lbudgets, LBUDGETS); }
  renderCategories(); renderTx(); renderBVA(); toast('🗑️ Category deleted');
}

function renderCategories() {
  const el = document.getElementById('cat-list');
  if (!el) return;
  renderIconPicker();

  const filter = window._catFilter || 'expense';
  const filtered = filter === 'all' ? LCATS : LCATS.filter(c => !c.type || c.type === 'both' || c.type === filter);

  if (!filtered.length) {
    el.innerHTML = '<div class="empty"><div class="ei">🏷️</div><p>No categories.</p></div>';
  } else {
    el.innerHTML = filtered.map(c => {
      const count    = TX.filter(t => t.catId === c.id || t.category === c.name).length;
      const typeCol  = c.type === 'income' ? 'var(--success)' : c.type === 'both' ? '#74b9ff' : 'var(--primary)';
      const typeBg   = c.type === 'income' ? '#1a3020' : c.type === 'both' ? '#0a1a30' : '#2a1020';
      const typeLbl  = c.type || 'expense';
      const subcatPills = (c.subcats || []).map(s =>
        '<span style="display:inline-block;font-size:.68rem;background:#2a2535;color:var(--muted);'
        + 'border-radius:99px;padding:2px 8px;margin:2px 3px 2px 0;cursor:pointer;border:1px solid var(--border)"'
        + ' onclick="deleteSubcat(\'' + c.id + '\',\'' + s.replace(/'/g, "\\'") + '\')" title="Click to remove">'
        + s + ' ✕</span>'
      ).join('');
      return '<div style="background:var(--card2);border:1px solid var(--border);border-radius:12px;'
        + 'padding:14px 16px;margin-bottom:10px">'
        + '<div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">'
        + '<div style="width:38px;height:38px;border-radius:10px;display:flex;align-items:center;'
        + 'justify-content:center;font-size:1.2rem;flex-shrink:0;background:' + c.color + '33;color:' + c.color + '">'
        + c.icon + '</div>'
        + '<div style="flex:1;min-width:0">'
        + '<div style="font-weight:700;font-size:.9rem;display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
        + c.name
        + ' <span style="font-size:.66rem;padding:2px 7px;border-radius:99px;background:' + typeBg + ';color:' + typeCol + '">' + typeLbl + '</span>'
        + ' <span style="font-size:.7rem;color:var(--muted)">' + count + ' tx</span>'
        + '</div>'
        + '<div style="margin-top:8px;line-height:1.8">' + subcatPills
        + '<span style="font-size:.68rem;color:var(--primary);cursor:pointer;padding:2px 8px;border:1px dashed var(--primary);'
        + 'border-radius:99px;margin-left:2px" onclick="promptAddSubcat(\'' + c.id + '\')" title="Add subcategory">+ add</span>'
        + '</div>'
        + '</div>'
        + '<div style="display:flex;gap:6px;flex-shrink:0">'
        + '<button class="del-btn" onclick="renameCategory(\'' + c.id + '\')" title="Rename" style="font-size:.9rem">✏️</button>'
        + '<button class="del-btn" onclick="deleteCategory(\'' + c.id + '\')" title="Delete">🗑</button>'
        + '</div>'
        + '</div></div>';
    }).join('');
  }

  // Rules list
  renderRulesList();
}

function _buildRuleCardHtml(merchant, catId, subcat, source, meta) {
  var cat      = LCATS.find(function(c) { return c.id === catId; });
  var txCount  = TX.filter(function(t) { return ruleKey(t) === merchant; }).length;
  var catName  = cat ? (cat.icon + ' ' + cat.name) : (catId || 'Unknown');
  var catColor = cat ? (cat.color || 'var(--primary)') : 'var(--muted)';
  var catOpts  = LCATS.map(function(c) {
    return '<option value="' + c.id + '"' + (c.id === catId ? ' selected' : '') + '>'
      + c.icon + ' ' + c.name + '</option>';
  }).join('');
  var subcatOpts = (cat ? (cat.subcats || []) : []).map(function(s) {
    return '<option value="' + s + '"' + (s === subcat ? ' selected' : '') + '>' + s + '</option>';
  }).join('');

  // Source badge + meta line
  var sourceBadge = source === 'lrule'
    ? '<span style="font-size:.65rem;background:#1a2540;color:var(--primary);border-radius:99px;padding:2px 8px;font-weight:700;letter-spacing:.04em">⚡ RULE</span>'
    : '<span style="font-size:.65rem;background:#1a2520;color:var(--success);border-radius:99px;padding:2px 8px;font-weight:700;letter-spacing:.04em">🤖 AUTO-LEARNED</span>';

  var metaLine = '';
  if (source === 'learned' && meta) {
    var conf = meta.matchCount >= 5 ? 'High confidence' : meta.matchCount >= 3 ? 'Medium confidence' : 'Low confidence';
    var confColor = meta.matchCount >= 5 ? 'var(--success)' : meta.matchCount >= 3 ? 'var(--warn)' : 'var(--danger)';
    var daysAgo = meta.lastMatchedAt ? Math.round((Date.now() - meta.lastMatchedAt) / 86400000) : null;
    var lastSeen = daysAgo !== null ? (daysAgo === 0 ? 'today' : daysAgo + 'd ago') : '';
    metaLine = '<span style="font-size:.7rem;color:' + confColor + '">' + conf + '</span>'
      + (lastSeen ? '<span style="font-size:.7rem;color:var(--muted)"> · last seen ' + lastSeen + '</span>' : '')
      + '<span style="font-size:.7rem;color:var(--muted)"> · ' + meta.matchCount + ' match' + (meta.matchCount !== 1 ? 'es' : '') + '</span>';
  } else {
    metaLine = '<span style="font-size:.7rem;color:var(--muted)">' + txCount + ' transaction' + (txCount !== 1 ? 's' : '') + ' matched</span>';
  }

  // Promote button only for learned entries
  var promoteBtn = source === 'learned'
    ? '<button class="btn btn-ghost btn-sm" onclick="promoteLearnedRule(this.closest(\'.rule-card\'))" title="Promote to confirmed rule" style="color:var(--primary)">⬆ Confirm</button>'
    : '';

  return '<div class="rule-card" data-merchant="' + merchant.replace(/"/g, '&quot;') + '" data-source="' + source + '">'
    + '<div style="display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap">'
    + '<div style="flex:1;min-width:140px">'
    + '<div style="display:flex;align-items:center;gap:7px;margin-bottom:4px">'
    + '<span style="font-weight:700;font-size:.88rem">🏪 ' + merchant + '</span>'
    + sourceBadge
    + '</div>'
    + '<div>' + metaLine + '</div>'
    + '</div>'
    + '<div style="display:flex;align-items:center;gap:12px;flex:2;min-width:200px;flex-wrap:wrap">'
    + '<div><div style="font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:3px">Category</div>'
    + '<span style="font-weight:700;color:' + catColor + '">' + catName + '</span></div>'
    + '<span style="color:var(--border)">›</span>'
    + '<div><div style="font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:3px">Subcategory</div>'
    + (subcat ? '<span style="background:#2a2535;color:var(--text);border-radius:6px;padding:2px 9px;font-size:.8rem;font-weight:600">' + subcat + '</span>'
              : '<span style="font-size:.78rem;color:var(--muted);font-style:italic">None</span>')
    + '</div></div>'
    + '<div style="display:flex;gap:6px;flex-shrink:0;align-items:center;flex-wrap:wrap">'
    + promoteBtn
    + '<button class="btn btn-ghost btn-sm" onclick="toggleRuleEdit(this.closest(\'.rule-card\'))">✏️ Edit</button>'
    + '<button class="del-btn" onclick="deleteRuleCard(this.closest(\'.rule-card\'))" title="Delete">🗑</button>'
    + '</div></div>'
    + '<div class="rule-edit-inline" style="display:none;margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">'
    + '<div style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap">'
    + '<div style="flex:1;min-width:150px"><label class="lbl" style="font-size:.72rem">Category</label>'
    + '<select class="rule-cat-sel" style="width:100%" onchange="ruleEditCatChanged(this)">' + catOpts + '</select></div>'
    + '<div style="flex:1;min-width:150px"><label class="lbl" style="font-size:.72rem">Subcategory</label>'
    + '<select class="rule-subcat-sel" style="width:100%"><option value="">— None —</option>' + subcatOpts + '</select></div>'
    + '<div style="display:flex;gap:6px">'
    + '<button class="btn btn-primary btn-sm" onclick="saveRuleCard(this.closest(\'.rule-card\'))">Save</button>'
    + '<button class="btn btn-ghost btn-sm" onclick="toggleRuleEdit(this.closest(\'.rule-card\'))">Cancel</button>'
    + '</div></div></div>'
    + '</div>';
}

function renderRulesList() {
  var rulesEl = document.getElementById('rules-list');
  if (!rulesEl) return;

  var lruleEntries   = Object.entries(LRULES);
  var learnedRaw     = {};
  try { learnedRaw = JSON.parse(localStorage.getItem('learnedMappings') || '{}'); } catch(e) {}
  var learnedEntries = Object.entries(learnedRaw);

  if (!lruleEntries.length && !learnedEntries.length) {
    rulesEl.innerHTML = '<div class="empty"><div class="ei">⚡</div><p>No rules yet. Assign a category to a transaction to create one automatically.</p></div>';
    return;
  }

  var html = '';

  // ── Confirmed rules (LRULES) ─────────────────────────────────
  if (lruleEntries.length) {
    html += '<div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-bottom:10px">⚡ Confirmed Rules (' + lruleEntries.length + ')</div>';
    lruleEntries.forEach(function(entry) {
      var merchant = entry[0];
      var rule     = ruleRead(merchant);
      var catId    = rule ? rule.catId : (typeof entry[1] === 'string' ? entry[1] : '');
      var subcat   = rule ? (rule.subcat || '') : '';
      html += _buildRuleCardHtml(merchant, catId, subcat, 'lrule', null);
    });
  }

  // ── Auto-learned mappings ────────────────────────────────────
  if (learnedEntries.length) {
    // Sort: high confidence first, then by matchCount desc
    learnedEntries.sort(function(a, b) {
      return (b[1].matchCount || 0) - (a[1].matchCount || 0);
    });
    html += '<div style="font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:18px 0 10px">🤖 Auto-Learned (' + learnedEntries.length + ')</div>';
    learnedEntries.forEach(function(entry) {
      var key   = entry[0];
      var meta  = entry[1];
      if (!meta || !meta.catId) return;
      html += _buildRuleCardHtml(key, meta.catId, meta.subcat || '', 'learned', meta);
    });
  }

  rulesEl.innerHTML = html;
}

function toggleRuleEdit(card) {
  if (!card) return;
  var form = card.querySelector('.rule-edit-inline');
  if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
}


function saveRuleCard(card) {
  if (!card) return;
  var merchant  = card.dataset.merchant;
  var source    = card.dataset.source || 'lrule';
  var catSel    = card.querySelector('.rule-cat-sel');
  var subcatSel = card.querySelector('.rule-subcat-sel');
  if (!merchant || !catSel) return;
  var newCatId  = catSel.value;
  var newSubcat = subcatSel ? subcatSel.value : '';

  if (source === 'learned') {
    // Update learnedMappings
    var learned = {};
    try { learned = JSON.parse(localStorage.getItem('learnedMappings') || '{}'); } catch(e) {}
    if (learned[merchant]) {
      learned[merchant].catId  = newCatId;
      learned[merchant].subcat = newSubcat;
    }
    try { localStorage.setItem('learnedMappings', JSON.stringify(learned)); } catch(e) {}
  } else {
    // Update LRULES
    LRULES[merchant] = { catId: newCatId, subcat: newSubcat };
    try { save(K.rules, LRULES); } catch(e) {}
  }

  // Re-apply to matching transactions
  var applied = 0;
  TX.forEach(function(t) {
    if (ruleKey(t) === merchant) {
      t.catId   = newCatId;
      t.subcat  = newSubcat;
      t.userSet = true;
      var cat = LCATS.find(function(c) { return c.id === newCatId; });
      t.category = cat ? cat.name : 'Other'; applied++;
    }
  });
  try { save(K.tx, TX); } catch(e) {}
  renderRulesList();
  renderTx();
  toast('Rule updated — ' + applied + ' transaction' + (applied !== 1 ? 's' : '') + ' re-assigned');
}

function deleteRuleCard(card) {
  if (!card) return;
  var merchant = card.dataset.merchant;
  var source   = card.dataset.source || 'lrule';
  if (!merchant) return;
  if (source === 'learned') {
    var learned = {};
    try { learned = JSON.parse(localStorage.getItem('learnedMappings') || '{}'); } catch(e) {}
    delete learned[merchant];
    try { localStorage.setItem('learnedMappings', JSON.stringify(learned)); } catch(e) {}
    renderRulesList();
    toast('🗑️ Removed');
  } else {
    deleteRule(merchant);
  }
}

function promoteLearnedRule(card) {
  if (!card) return;
  var merchant = card.dataset.merchant;
  if (!merchant) return;
  var learned = {};
  try { learned = JSON.parse(localStorage.getItem('learnedMappings') || '{}'); } catch(e) {}
  var entry = learned[merchant];
  if (!entry || !entry.catId) return;

  // Move to LRULES and delete from learnedMappings
  LRULES[merchant] = { catId: entry.catId, subcat: entry.subcat || '' };
  try { save(K.rules, LRULES); } catch(e) {}
  delete learned[merchant];
  try { localStorage.setItem('learnedMappings', JSON.stringify(learned)); } catch(e) {}

  renderRulesList();
  toast('⚡ Promoted to confirmed rule');
}


function ruleEditCatChanged(selectEl) {
  var card = selectEl.closest('.rule-card');
  if (!card) return;
  var subcatSel = card.querySelector('.rule-subcat-sel');
  if (!subcatSel) return;
  var cat = LCATS.find(function(c) { return c.id === selectEl.value; });
  var subs = cat ? (cat.subcats || []) : [];
  subcatSel.innerHTML = '<option value="">— None —</option>'
    + subs.map(function(s) { return '<option value="' + s + '">' + s + '</option>'; }).join('');
}



function setCatFilter(f) {
  window._catFilter = f;
  ['expense','income','all'].forEach(x => {
    const b = document.getElementById('cat-filter-' + x);
    if (!b) return;
    b.style.background = x === f ? 'rgba(232,69,122,.15)' : 'transparent';
    b.style.borderColor = x === f ? 'var(--primary)' : 'var(--border)';
    b.style.color = x === f ? 'var(--primary)' : 'var(--muted)';
  });
  renderCategories();
}

function deleteRule(merchant) {
  delete LRULES[merchant];
  try { save(K.rules, LRULES); } catch(e) {}
  renderCategories();
  toast('Rule removed');
}

// ── Rule key: prefer t.name (merchant), fall back to first 3 words of description
function ruleKey(t) {
  if (t.name && t.name.trim()) return t.name.trim().toLowerCase();
  return (t.description || '').split(' ').slice(0, 3).join(' ').toLowerCase();
}

// ── Read a rule — handles both old format {catId:string} and new {catId, subcat}
function ruleRead(key) {
  var r = LRULES[key];
  if (!r) return null;
  if (typeof r === 'string') return { catId: r, subcat: '' }; // backward compat
  return r;
}

// ══════════════════════════════════════════════════════════════
// INLINE CATEGORY & SUBCATEGORY ASSIGNMENT
// ══════════════════════════════════════════════════════════════

function inlineAssignSubcat(sel) {
  var txId = Number(sel.dataset.id);
  var t = TX.find(function(x) { return x.id === txId; });
  if (!t) return;
  t.subcat  = sel.value;
  t.userSet = true; // protect from auto-fix overwriting this manual assignment
  try { save(K.tx, TX); } catch(e) {}

  // After assigning a subcat, offer to update the rule if one exists, or create one
  var key = ruleKey(t);
  var existingRule = ruleRead(key);
  if (key && t.type === 'expense' && t.subcat) {
    if (existingRule && existingRule.catId === t.catId && existingRule.subcat !== t.subcat) {
      // Rule exists but subcat changed — update silently
      LRULES[key] = { catId: t.catId, subcat: t.subcat };
      try { save(K.rules, LRULES); } catch(e) {}
    } else if (!existingRule) {
      showRuleBanner(key, t.catId, t.subcat);
    }
  }
}

function inlineAssignCat(selectEl) {
  var txId  = Number(selectEl.dataset.id);
  var catId = selectEl.value;
  var t = TX.find(function(x) { return x.id === txId; });
  if (!t) return;
  var cat = LCATS.find(function(c) { return c.id === catId; });

  t.catId    = catId || 'other';
  t.category = cat ? cat.name : 'Other';
  t.subcat   = ''; // reset subcat when category changes
  t.userSet  = true; // protect from auto-fix overwriting this manual assignment
  try { save(K.tx, TX); } catch(e) {}

  // Refresh the subcat dropdown in the same row without full re-render
  var row = selectEl.closest('tr');
  if (row) {
    var subcatSel = row.querySelector('select[data-field="subcat"]');
    if (subcatSel) {
      var newSubcats = getSubcats(catId);
      subcatSel.innerHTML = '<option value="">—</option>'
        + newSubcats.map(function(s) { return '<option value="' + s + '">' + s + '</option>'; }).join('');
    }
  }

  // Check for existing rule to update, or offer to create one
  var key = ruleKey(t);
  if (key && catId) {
    var existingRule = ruleRead(key);
    if (!existingRule) {
      showRuleBanner(key, catId, '', cat);
    } else if (existingRule.catId !== catId) {
      // Rule exists for different category — update silently
      LRULES[key] = { catId: catId, subcat: '' };
      try { save(K.rules, LRULES); } catch(e) {}
    }
  }

  if (document.getElementById('page-bva') && document.getElementById('page-bva').classList.contains('active')) renderBVA();
}

function showRuleBanner(merchant, catId, subcat, cat) {
  var banner = document.getElementById('tx-rule-banner');
  if (!banner) return;
  if (!cat) cat = LCATS.find(function(c) { return c.id === catId; });
  var catLabel = cat ? cat.icon + ' ' + cat.name : catId;
  // Store rule data on the element to avoid inline string escaping issues
  banner._ruleMerchant = merchant;
  banner._ruleCatId    = catId;
  banner._ruleSubcat   = subcat || '';
  banner.style.display = 'flex';
  banner.innerHTML = '<span style="flex:1">Assign <strong style="color:var(--pink-light)">'
    + merchant + '</strong> → <strong style="color:' + (cat ? cat.color : 'var(--primary)') + '">'
    + catLabel + '</strong>'
    + (subcat ? ' → <span style="color:var(--muted);font-size:.8rem">' + subcat + '</span>' : '')
    + ' always?</span>'
    + '<button class="btn btn-sm btn-primary" onclick="createRuleFromBanner()">Yes</button>'
    + '<button class="btn btn-sm btn-ghost" onclick="dismissRuleBanner()">No</button>';
  setTimeout(function() { if (banner) banner.style.display = 'none'; }, 14000);
}

function dismissRuleBanner() {
  var b = document.getElementById('tx-rule-banner');
  if (b) b.style.display = 'none';
}

function createRuleFromBanner() {
  var b = document.getElementById('tx-rule-banner');
  if (!b) return;
  var merchant = b._ruleMerchant || '';
  var catId    = b._ruleCatId    || '';
  var subcat   = b._ruleSubcat   || '';
  if (merchant && catId) createRule(merchant, catId, subcat);
  else dismissRuleBanner();
}

function createRule(merchant, catId, subcat) {
  LRULES[merchant] = { catId: catId, subcat: subcat || '' };
  try { save(K.rules, LRULES); } catch(e) {}

  // Apply to all existing matching transactions
  var applied = 0;
  TX.forEach(function(t) {
    if (ruleKey(t) === merchant) {
      t.catId    = catId;
      t.subcat   = subcat || '';
      t.userSet  = true; // rule-confirmed: protect from future auto-fix passes
      var c = LCATS.find(function(x) { return x.id === catId; });
      t.category = c ? c.name : 'Other';
      applied++;
    }
  });
  try { save(K.tx, TX); } catch(e) {}
  dismissRuleBanner();
  renderTx();
  if (typeof renderCategories === 'function') renderCategories();
  toast('⚡ Rule saved — ' + applied + ' transaction' + (applied !== 1 ? 's' : '') + ' updated');
}

// Apply auto-rules when a new transaction is added
function applyAutoRules(t) {
  var key = ruleKey(t);
  if (!key) return;
  var rule = ruleRead(key);
  if (rule) {
    t.catId    = rule.catId;
    t.subcat   = rule.subcat || '';
    var cat    = LCATS.find(function(c) { return c.id === rule.catId; });
    t.category = cat ? cat.name : 'Other';
  }
}

// ── BULK SELECTION ────────────────────────────────────────────
function onTxCheck() {
  const checked = document.querySelectorAll('.tx-row-check:checked');
  const bar = document.getElementById('tx-bulk-bar');
  const lbl = document.getElementById('tx-bulk-count');
  const selAll = document.getElementById('tx-select-all');
  const total  = document.querySelectorAll('.tx-row-check').length;
  if (bar) bar.style.display = checked.length ? 'flex' : 'none';
  if (lbl) lbl.textContent = checked.length + ' selected';
  if (selAll) selAll.indeterminate = checked.length > 0 && checked.length < total;
  if (selAll) selAll.checked = checked.length === total && total > 0;
}

function toggleSelectAll(masterCb) {
  document.querySelectorAll('.tx-row-check').forEach(cb => { cb.checked = masterCb.checked; });
  onTxCheck();
}

function clearTxSelection() {
  document.querySelectorAll('.tx-row-check,.tx-select-all').forEach(cb => { cb.checked = false; });
  const bar = document.getElementById('tx-bulk-bar');
  if (bar) bar.style.display = 'none';
  const sa = document.getElementById('tx-select-all');
  if (sa) { sa.checked = false; sa.indeterminate = false; }
}

function bulkAssignCategory() {
  const catId = document.getElementById('tx-bulk-cat')?.value;
  if (!catId) { toast('⚠️ Pick a category first'); return; }
  const cat = LCATS.find(c => c.id === catId);
  const checked = document.querySelectorAll('.tx-row-check:checked');
  let count = 0;
  checked.forEach(cb => {
    const txId = Number(cb.dataset.id);
    const t = TX.find(x => x.id === txId);
    if (t) { t.catId = catId; t.category = cat ? cat.name : 'Other'; count++; }
  });
  save(K.tx, TX);
  clearTxSelection();
  renderTx();
  if (document.getElementById('page-bva').classList.contains('active')) renderBVA();
  toast('✅ Assigned ' + count + ' transactions to ' + (cat ? cat.name : catId));
}

// ══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
// SUBCATEGORIES, ICON PICKER, CATEGORY IMPORT/EXPORT
// ══════════════════════════════════════════════════════════════

const ICON_PICKER_EMOJIS = [
  '🛒','🍽','🚗','💡','❤','🎬','🛍','📚','💰','💻','📈','🏠','✈','🎵',
  '⚽','🌿','💊','🐾','🎁','☕','🍕','🚌','💧','📱','🏋','🎮','📷','🧴',
  '🔧','🌍','🍺','🚀','🎓','👶','🐶','🏖','🎭','🍎','🚿','🔑','💈','🌺',
];

function renderIconPicker() {
  const el = document.getElementById('cat-icon-picker');
  if (!el) return;
  const cur = document.getElementById('cat-icon-input')?.value || '🏷';
  el.innerHTML = ICON_PICKER_EMOJIS.map(e =>
    '<div onclick="pickIcon(\'' + e + '\')" style="width:36px;height:36px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:1.3rem;cursor:pointer;background:'
    + (cur === e ? 'var(--primary)' : 'var(--card)') + ';border:1.5px solid '
    + (cur === e ? 'var(--primary)' : 'var(--border)') + ';transition:all .15s">'
    + e + '</div>'
  ).join('');
}

function pickIcon(emoji) {
  const inp = document.getElementById('cat-icon-input');
  if (inp) inp.value = emoji;
  const prev = document.getElementById('cat-icon-preview');
  if (prev) prev.textContent = emoji;
  renderIconPicker();
}

function syncIconFromInput(val) {
  const prev = document.getElementById('cat-icon-preview');
  if (prev) prev.textContent = val || '🏷';
  renderIconPicker();
}

// ── Subcategory helpers ────────────────────────────────────────
function getSubcats(catIdOrName) {
  const cat = LCATS.find(c => c.id === catIdOrName || c.name === catIdOrName);
  return cat?.subcats || [];
}

function populateCatSelect() {
  // Repopulate categories based on income/expense type. Call when type changes.
  var catSel = document.getElementById("tx-cat");
  if (!catSel) return;
  var typeEl = document.getElementById("tx-type");
  var type = typeEl ? typeEl.value : "expense";
  var curVal = catSel.value;
  var filtered = LCATS.filter(function(c) {
    return !c.type || c.type === "both" || c.type === type;
  });
  catSel.innerHTML = filtered.map(function(c) {
    return "<option value=\"" + c.id + "\">" + c.icon + " " + c.name + "</option>";
  }).join("");
  // Restore previous selection if still valid
  if (curVal && catSel.querySelector("option[value=\"" + curVal + "\"]")) {
    catSel.value = curVal;
  }
  refreshSubcatSelect();
}

function refreshSubcatSelect() {
  // ONLY update subcategories for the currently selected category. Does NOT touch tx-cat.
  var catSel = document.getElementById("tx-cat");
  var subcatSel = document.getElementById("tx-subcat");
  if (!catSel || !subcatSel) return;
  var catId = catSel.value;
  var cat = null;
  for (var i = 0; i < LCATS.length; i++) {
    if (LCATS[i].id === catId) { cat = LCATS[i]; break; }
  }
  var subcats = cat && cat.subcats ? cat.subcats : [];
  subcatSel.innerHTML = "<option value=\"\">No subcategory</option>" +
    subcats.map(function(s) {
      return "<option value=\"" + s + "\">" + s + "</option>";
    }).join("");
}

function updateSubcat() {
  // Legacy alias — called from old code. Just refreshes subcats.
  refreshSubcatSelect();
}

// ── Enhanced addCategory ──────────────────────────────────────
// Extend to support subcats editing and type
function addCategoryWithSubcats() {
  const icon  = document.getElementById('cat-icon-input')?.value?.trim() || '🏷';
  const name  = document.getElementById('cat-name-input')?.value?.trim();
  const color = document.getElementById('cat-color-input')?.value || '#e8457a';
  const type  = document.getElementById('cat-type-input')?.value || 'expense';
  if (!name) { toast('Enter a category name'); return; }
  if (LCATS.find(c => c.name.toLowerCase() === name.toLowerCase())) { toast('Category already exists'); return; }
  const id = name.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now();
  LCATS.push({ id, name, icon, color, type, subcats: [] });
  save(K.categories, LCATS);
  document.getElementById('cat-name-input').value = '';
  document.getElementById('cat-icon-input').value = '';
  renderCategories();
  renderIconPicker();
  populateTxCatSelect();
  toast('Category added');
}

// ── addSubcat to existing category ───────────────────────────
function promptAddSubcat(catId) {
  const cat = LCATS.find(c => c.id === catId);
  if (!cat) return;
  const name = prompt('Add subcategory to "' + cat.name + '":');
  if (!name || !name.trim()) return;
  if (!cat.subcats) cat.subcats = [];
  if (cat.subcats.includes(name.trim())) { toast('Subcategory already exists'); return; }
  cat.subcats.push(name.trim());
  save(K.categories, LCATS);
  renderCategories();
  toast('Subcategory added');
}

function deleteSubcat(catId, subcatName) {
  const cat = LCATS.find(c => c.id === catId);
  if (!cat || !cat.subcats) return;
  cat.subcats = cat.subcats.filter(s => s !== subcatName);
  save(K.categories, LCATS);
  renderCategories();
  toast('Subcategory removed');
}

// ── Import / Export categories ────────────────────────────────
function exportCategories() {
  const blob = new Blob([JSON.stringify(LCATS, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'charnley-categories.json';
  a.click();
  toast('Categories exported');
}

function importCategories(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const imported = JSON.parse(e.target.result);
      if (!Array.isArray(imported) || !imported[0]?.name) throw new Error('Invalid format');
      if (!confirm('Replace your current categories with ' + imported.length + ' imported categories? This cannot be undone.')) return;
      LCATS = imported;
      save(K.categories, LCATS);
      renderCategories();
      populateTxCatSelect();
      renderIconPicker();
      toast('Imported ' + imported.length + ' categories');
    } catch (err) {
      toast('Invalid file: ' + err.message);
    }
    event.target.value = '';
  };
  reader.readAsText(file);
}

function resetDefaultCategories() {
  if (!confirm("Reset to default categories?")) return;
  LCATS = _BUILT_IN_CATS.slice();
  save(K.categories, LCATS);
  try { localStorage.setItem("cff_cat_version", 6); } catch(e) {}
  renderCategories();
  populateTxCatSelect();
  toast("Categories reset!");
}

// ══════════════════════════════════════════════════════════════
// TRANSACTION BAR CHART
