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
  'pet':             'pets',
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
  'Pippen':                  'pets',
  'Pets':                    'pets',
  'pippen':                  'pets',     // old id of the Pets category — keeps old exports importing
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
  // ── Insurance — v9 moves ──────────────────────────────────────
  'ring insurance':                   { catId:'insurance_utilities', subcat:'Other Insurance' },
  'car insurance & membership':       { catId:'insurance_utilities', subcat:'Car Insurance' },
  'car insurance':                    { catId:'insurance_utilities', subcat:'Car Insurance' },

  // ── Food & Eating Out — v10 renames ──────────────────────────
  'activate food and meals':          { catId:'food_eating_out',     subcat:'Meal Delivery' },

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
  'pet food':                       { catId:'pets',            subcat:'Pet Food' },
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
  'dog daycare':                    { catId:'pets',            subcat:'Pet Supplies' },
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
  'pet':                            'pets',
  'pets':                           'pets',
  'pippen':                         'pets',
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
        return '<option value="' + c.id + '"' + (c.id === currentId ? ' selected' : '') + '>'
          + c.name + '</option>';
      }).join('');
}

function updateTxBulkSelects() {
  const sel = document.getElementById('tx-bulk-cat');
  if (!sel) return;
  sel.innerHTML = '<option value="">— Pick category —</option>'
    + LCATS.map(c => '<option value="' + c.id + '">' + c.name + '</option>').join('');
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
    el.innerHTML = '<div class="empty"><div class="ei">' + ICON('tag') + '</div><p>No categories.</p></div>';
  } else {
    el.innerHTML = filtered.map(c => {
      const count    = TX.filter(t => t.catId === c.id || t.category === c.name).length;
      const typeMod  = c.type === 'income' ? 'income' : c.type === 'both' ? 'both' : 'expense';
      const typeLbl  = c.type || 'expense';
      const subcatPills = (c.subcats || []).map(s =>
        '<span class="subcat-chip"'
        + ' onclick="deleteSubcat(\'' + c.id + '\',\'' + s.replace(/'/g, "\\'") + '\')" title="Click to remove">'
        + s + ' ' + ICON('x') + '</span>'
      ).join('');
      return '<div class="cg-card">'
        + '<div class="cg-card-row">'
        + '<div class="cg-card-ico" style="background:' + c.color + '33;color:' + c.color + '">'
        + iconTag(c.icon) + '</div>'
        + '<div class="cg-card-body">'
        + '<div class="cg-card-name">'
        + c.name
        + ' <span class="cg-type-badge cg-type-badge--' + typeMod + '">' + typeLbl + '</span>'
        + ' <span class="cg-count">' + count + ' tx</span>'
        + '</div>'
        + '<div class="cg-subcats">' + subcatPills
        + '<span class="subcat-chip subcat-chip--add" onclick="promptAddSubcat(\'' + c.id + '\')" title="Add subcategory">+ add</span>'
        + '</div>'
        + '</div>'
        + '<div class="cg-card-actions">'
        + '<button class="del-btn cg-rename" onclick="renameCategory(\'' + c.id + '\')" title="Rename">' + ICON('pencil') + '</button>'
        + '<button class="del-btn" onclick="deleteCategory(\'' + c.id + '\')" title="Delete">' + ICON('trash') + '</button>'
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
  var catName  = cat ? (iconTag(cat.icon) + ' ' + cat.name) : (catId || 'Unknown');
  var catColor = cat ? (cat.color || 'var(--primary)') : 'var(--muted)';
  var catOpts  = LCATS.map(function(c) {
    return '<option value="' + c.id + '"' + (c.id === catId ? ' selected' : '') + '>'
      + c.name + '</option>';
  }).join('');
  var subcatOpts = (cat ? (cat.subcats || []) : []).map(function(s) {
    return '<option value="' + s + '"' + (s === subcat ? ' selected' : '') + '>' + s + '</option>';
  }).join('');

  // Source badge + meta line
  var sourceBadge = source === 'lrule'
    ? '<span class="rc-badge rc-badge--rule">' + ICON('bolt') + ' RULE</span>'
    : '<span class="rc-badge rc-badge--learned">' + ICON('robot') + ' AUTO-LEARNED</span>';

  var metaLine = '';
  if (source === 'learned' && meta) {
    var conf = meta.matchCount >= 5 ? 'High confidence' : meta.matchCount >= 3 ? 'Medium confidence' : 'Low confidence';
    var confTone = meta.matchCount >= 5 ? 'tone-green' : meta.matchCount >= 3 ? 'tone-amber' : 'tone-danger';
    var daysAgo = meta.lastMatchedAt ? Math.round((Date.now() - meta.lastMatchedAt) / 86400000) : null;
    var lastSeen = daysAgo !== null ? (daysAgo === 0 ? 'today' : daysAgo + 'd ago') : '';
    metaLine = '<span class="rc-meta ' + confTone + '">' + conf + '</span>'
      + (lastSeen ? '<span class="rc-meta tone-muted"> · last seen ' + lastSeen + '</span>' : '')
      + '<span class="rc-meta tone-muted"> · ' + meta.matchCount + ' match' + (meta.matchCount !== 1 ? 'es' : '') + '</span>';
  } else {
    metaLine = '<span class="rc-meta tone-muted">' + txCount + ' transaction' + (txCount !== 1 ? 's' : '') + ' matched</span>';
  }

  // Promote button only for learned entries
  var promoteBtn = source === 'learned'
    ? '<button class="btn btn-ghost btn-sm rc-promote" onclick="promoteLearnedRule(this.closest(\'.rule-card\'))" title="Promote to confirmed rule">⬆ Confirm</button>'
    : '';

  // Get pattern from rule if it exists
  var rule = ruleRead(merchant);
  var pattern = rule && rule.pattern ? rule.pattern : 'exact';
  var patternBadge = source === 'lrule'
    ? '<span class="rc-badge rc-badge--pattern">'
      + (pattern === 'contains' ? '◡ CONTAINS' : '= EXACT') + '</span>'
    : '';

  // Overlap indicator: flag rules whose match-set intersects another rule's,
  // since only one can win per transaction (exact > longest contains).
  var overlapBadge = '';
  if (source === 'lrule') {
    var _ov = detectRuleConflicts(merchant, pattern).overlaps;
    if (_ov.length) {
      var _ovKeys = _ov.map(function(o) { return o.key; }).join(', ');
      overlapBadge = '<span title="Overlaps: ' + esc(_ovKeys).replace(/"/g, '&quot;') + '" '
        + 'class="rc-badge rc-badge--overlap">'
        + ICON('alert-triangle') + ' OVERLAPS ' + _ov.length + '</span>';
    }
  }

  return '<div class="rule-card" data-merchant="' + merchant.replace(/"/g, '&quot;') + '" data-source="' + source + '">'
    + '<div class="rc-row">'
    + '<div class="rc-main">'
    + '<div class="rc-head">'
    + '<span class="rc-merchant">' + ICON('building-store') + ' ' + merchant + '</span>'
    + sourceBadge
    + patternBadge
    + overlapBadge
    + '</div>'
    + '<div>' + metaLine + '</div>'
    + '</div>'
    + '<div class="rc-map">'
    + '<div><div class="rc-map-lbl">Category</div>'
    + '<span class="rc-cat" style="color:' + catColor + '">' + catName + '</span></div>'
    + '<span class="rc-arrow">›</span>'
    + '<div><div class="rc-map-lbl">Subcategory</div>'
    + (subcat ? '<span class="rc-subcat">' + subcat + '</span>'
              : '<span class="rc-none">None</span>')
    + '</div></div>'
    + '<div class="rc-actions">'
    + promoteBtn
    + '<button class="btn btn-ghost btn-sm" onclick="toggleRuleEdit(this.closest(\'.rule-card\'))">' + ICON('pencil') + ' Edit</button>'
    + '<button class="del-btn" onclick="deleteRuleCard(this.closest(\'.rule-card\'))" title="Delete">' + ICON('trash') + '</button>'
    + '</div></div>'
    + '<div class="rule-edit-inline" style="display:none">'
    + '<div class="rc-edit-row">'
    + '<div class="rc-edit-f"><label class="lbl">Pattern</label>'
    + '<select class="rule-pattern-sel">'
    + '<option value="exact"' + (pattern === 'exact' ? ' selected' : '') + '>= Exact Match</option>'
    + '<option value="contains"' + (pattern === 'contains' ? ' selected' : '') + '>◡ Contains</option>'
    + '</select></div>'
    + '<div class="rc-edit-f"><label class="lbl">Category</label>'
    + '<select class="rule-cat-sel" onchange="ruleEditCatChanged(this)">' + catOpts + '</select></div>'
    + '<div class="rc-edit-f"><label class="lbl">Subcategory</label>'
    + '<select class="rule-subcat-sel"><option value="">— None —</option>' + subcatOpts + '</select></div>'
    + '<div class="rc-edit-actions">'
    + '<button class="btn btn-primary btn-sm" onclick="saveRuleCard(this.closest(\'.rule-card\'))">Save</button>'
    + '<button class="btn btn-ghost btn-sm" onclick="toggleRuleEdit(this.closest(\'.rule-card\'))">Cancel</button>'
    + '</div></div></div>'
    + '</div>';
}

// Pagination state for rules
var _rulesPage = 0;
var _rulesSearch = '';
var _rulesPerPage = 10;

function renderRulesList() {
  var rulesEl = document.getElementById('rules-list');
  if (!rulesEl) return;

  var lruleEntries   = Object.entries(LRULES);
  var learnedRaw     = {};
  try { learnedRaw = JSON.parse(localStorage.getItem('learnedMappings') || '{}'); } catch(e) {}
  var learnedEntries = Object.entries(learnedRaw);

  // Filter rules by search term
  var search = (_rulesSearch || '').toLowerCase().trim();
  var filteredLRules = lruleEntries.filter(function(entry) {
    return !search || entry[0].toLowerCase().indexOf(search) !== -1;
  });
  var filteredLearned = learnedEntries.filter(function(entry) {
    return !search || entry[0].toLowerCase().indexOf(search) !== -1;
  });

  // Combine and paginate
  var allRules = [];
  filteredLRules.forEach(function(entry) {
    var merchant = entry[0];
    var rule = ruleRead(merchant);
    allRules.push({
      merchant: merchant,
      catId: rule ? rule.catId : (typeof entry[1] === 'string' ? entry[1] : ''),
      subcat: rule ? (rule.subcat || '') : '',
      source: 'lrule',
      meta: null
    });
  });
  filteredLearned.forEach(function(entry) {
    var key = entry[0];
    var meta = entry[1];
    if (meta && meta.catId) {
      allRules.push({
        merchant: key,
        catId: meta.catId,
        subcat: meta.subcat || '',
        source: 'learned',
        meta: meta
      });
    }
  });

  var totalRules = allRules.length;
  var totalPages = Math.ceil(totalRules / _rulesPerPage);
  if (_rulesPage >= totalPages) _rulesPage = Math.max(0, totalPages - 1);

  var start = _rulesPage * _rulesPerPage;
  var end = start + _rulesPerPage;
  var paginatedRules = allRules.slice(start, end);

  var html = '';

  // Search input
  html += '<div class="rules-toolbar">'
    + '<input type="text" id="rules-search-input" placeholder="Search rules..." value="' + (_rulesSearch || '') + '" '
    + 'class="rules-search" '
    + 'onkeyup="rulesSearchUpdate(this.value)">'
    + '<button class="btn btn-primary btn-sm rules-new-btn" onclick="rulesShowCreateForm()">' + ICON('bolt') + ' New Rule</button>'
    + '</div>';

  // Results count and pagination info
  var countText = '';
  if (search) {
    countText = totalRules + ' result' + (totalRules !== 1 ? 's' : '') + ' found';
  } else {
    countText = totalRules + ' rule' + (totalRules !== 1 ? 's' : '');
  }
  html += '<div class="rules-count">' + countText + '</div>';

  // Rules cards
  if (paginatedRules.length === 0) {
    if (search) {
      html += '<div class="empty"><div class="ei">' + ICON('search') + '</div><p>No rules match your search.</p></div>';
    } else {
      html += '<div class="empty"><div class="ei">' + ICON('bolt') + '</div><p>No rules yet. Assign a category to a transaction to create one automatically.</p></div>';
    }
  } else {
    paginatedRules.forEach(function(rule) {
      html += _buildRuleCardHtml(rule.merchant, rule.catId, rule.subcat, rule.source, rule.meta);
    });
  }

  // Pagination controls
  if (totalPages > 1) {
    html += '<div class="rules-pager">'
      + '<button class="btn btn-ghost btn-sm" onclick="rulesPreviousPage()" ' + (_rulesPage === 0 ? 'disabled' : '') + '>← Previous</button>'
      + '<span class="rules-page-lbl">Page ' + (_rulesPage + 1) + ' of ' + totalPages + '</span>'
      + '<button class="btn btn-ghost btn-sm" onclick="rulesNextPage()" ' + (_rulesPage >= totalPages - 1 ? 'disabled' : '') + '>Next →</button>'
      + '</div>';
  }

  rulesEl.innerHTML = html;
}

function rulesSearchUpdate(val) {
  _rulesSearch = val || '';
  _rulesPage = 0; // Reset to first page
  renderRulesList();
}

function rulesNextPage() {
  _rulesPage++;
  renderRulesList();
}

function rulesPreviousPage() {
  _rulesPage = Math.max(0, _rulesPage - 1);
  renderRulesList();
}

function rulesShowCreateForm() {
  // Blank "create a rule from scratch" flow — shares the modal with the
  // inline "save as a rule?" confirmation (see openRuleModal).
  openRuleModal({});
}

function createRuleCategoryChanged() {
  var catId = document.getElementById('create-rule-category').value;
  var subSelect = document.getElementById('create-rule-subcat');
  if (!catId) {
    subSelect.innerHTML = '<option value="">— None —</option>';
    return;
  }
  var cat = LCATS.find(function(c) { return c.id === catId; });
  var subs = cat ? (cat.subcats || []) : [];
  subSelect.innerHTML = '<option value="">— None —</option>'
    + subs.map(function(s) { return '<option value="' + s + '">' + s + '</option>'; }).join('');
}

function createRuleSave() {
  var merchantRaw = document.getElementById('create-rule-merchant').value.trim();
  var catId       = document.getElementById('create-rule-category').value;
  var subcat      = document.getElementById('create-rule-subcat').value || '';
  var patEl       = document.querySelector('input[name="create-rule-pattern"]:checked');
  var pattern     = patEl ? patEl.value : 'exact';

  if (!merchantRaw) { toast('⚠️ Please enter the rule text'); return; }
  if (!catId)       { toast('⚠️ Please select a category');   return; }

  // Keys are stored lowercase so the matching engine can compare directly.
  var merchant = merchantRaw.toLowerCase();

  // Remove any existing key that only differs by case (avoids a stray duplicate).
  Object.keys(LRULES).forEach(function(k) {
    if (k !== merchant && k.toLowerCase() === merchant) delete LRULES[k];
  });

  // Preserve match history / thresholds if we're replacing the same key.
  var prev = (LRULES[merchant] && typeof LRULES[merchant] === 'object') ? LRULES[merchant] : null;
  LRULES[merchant] = Object.assign({}, prev, {
    catId: catId,
    subcat: subcat,
    pattern: pattern || 'exact',
    confidence: 'HIGH',
    userModified: true
  });

  // Remove any overlapping rules the user ticked.
  var removed = 0;
  var learned = null;
  document.querySelectorAll('#create-rule-conflicts input.rule-conflict-cb:checked').forEach(function(cb) {
    var k = cb.dataset.key;
    if (cb.dataset.source === 'learned') {
      if (!learned) { try { learned = JSON.parse(localStorage.getItem('learnedMappings') || '{}'); } catch(e) { learned = {}; } }
      if (learned[k]) { delete learned[k]; removed++; }
    } else if (LRULES[k] && k !== merchant) {
      delete LRULES[k]; removed++;
    }
  });
  if (learned) { try { localStorage.setItem('learnedMappings', JSON.stringify(learned)); } catch(e) {} }

  try { save(K.rules, LRULES); } catch(e) {}

  // Apply to existing transactions (protecting manual edits) if requested.
  var applyCb = document.getElementById('create-rule-apply-all');
  var res = { updated: 0, skipped: 0 };
  if (!applyCb || applyCb.checked) {
    res = applyRuleToTx(merchant, pattern, catId, subcat, true, _ruleModalCtx ? _ruleModalCtx.txId : null);
    try { save(K.tx, TX); } catch(e) {}
  }

  closeRuleModal();
  _rulesPage = 0;
  _rulesSearch = '';
  if (typeof renderTx === 'function') renderTx();
  renderRulesList();

  var msg = '⚡ Rule saved';
  if (res.updated) msg += ' — ' + res.updated + ' transaction' + (res.updated !== 1 ? 's' : '') + ' updated';
  if (res.skipped) msg += ' · ' + res.skipped + ' manual kept';
  if (removed)     msg += ' · ' + removed + ' overlap' + (removed !== 1 ? 's' : '') + ' removed';
  toast(msg);
  if(typeof qsCheckAndAutoComplete==='function')qsCheckAndAutoComplete();
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
  // Get pattern type if available (for new-format rules)
  var patternSel = card.querySelector('.rule-pattern-sel');
  var newPattern = patternSel ? patternSel.value : 'exact';

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
    // Update LRULES with pattern support
    LRULES[merchant] = {
      catId: newCatId,
      subcat: newSubcat,
      pattern: newPattern || 'exact',
      confidence: 'HIGH'
    };
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
  if(typeof qsCheckAndAutoComplete==='function')qsCheckAndAutoComplete();
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

  // Move to LRULES with pattern support and delete from learnedMappings
  LRULES[merchant] = {
    catId: entry.catId,
    subcat: entry.subcat || '',
    pattern: 'exact',
    confidence: 'HIGH'
  };
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
    b.classList.toggle('is-active', x === f);
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

  // After assigning a subcat, decide whether a rule decision is needed.
  var key = ruleKey(t);
  var existingRule = ruleRead(key);
  if (key && t.type === 'expense' && t.subcat) {
    if (!existingRule) {
      // No rule yet — offer to create one (decision).
      openRuleModal({ merchant: key, catId: t.catId, subcat: t.subcat, pattern: 'exact', txId: t.id });
    } else if (existingRule.catId === t.catId && (existingRule.subcat || '') !== t.subcat) {
      // Same category, just refining the subcat — low stakes, update silently
      // but PRESERVE pattern/confidence (previously these were dropped).
      LRULES[key] = Object.assign({}, existingRule, { subcat: t.subcat });
      try { save(K.rules, LRULES); } catch(e) {}
    } else if (existingRule.catId !== t.catId) {
      // Conflicts with an existing rule — let the user decide.
      openRuleModal({ merchant: key, catId: t.catId, subcat: t.subcat, pattern: existingRule.pattern || 'exact', txId: t.id });
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
      subcatSel.dataset.hydrated = '1'; // full list now present; skip lazy re-hydrate
    }
  }

  // Decide whether a rule decision is needed (new rule, or a conflict/overwrite).
  var key = ruleKey(t);
  if (key && catId) {
    var existingRule = ruleRead(key);
    if (!existingRule) {
      // No rule yet — offer to create one.
      openRuleModal({ merchant: key, catId: catId, subcat: '', pattern: 'exact', txId: t.id });
    } else if (existingRule.catId !== catId) {
      // A rule already points this merchant somewhere else — surface the conflict
      // instead of silently clobbering it (which also used to drop its pattern).
      openRuleModal({ merchant: key, catId: catId, subcat: '', pattern: existingRule.pattern || 'exact', txId: t.id });
    }
    // else: the rule already targets this category — nothing to decide.
  }

  if (document.getElementById('page-bva') && document.getElementById('page-bva').classList.contains('active')) renderBVA();
}

// ══════════════════════════════════════════════════════════════
// RULE MODAL — create/confirm a rule (shared by the "New Rule" button
// and the inline category/subcategory assignment flow on Transactions).
// ══════════════════════════════════════════════════════════════

// Context for the currently-open modal. txId is the transaction that
// triggered an "assign" flow (if any) so we never count it as a manual
// edit to protect.
var _ruleModalCtx = { txId: null, mode: 'create' };

// Open the rule modal. opts: { merchant, catId, subcat, pattern, txId }.
// With no opts it's a blank "create a rule" form; with a merchant/txId it's
// the "save as a rule?" confirmation raised by an inline category change.
function openRuleModal(opts) {
  opts = opts || {};
  var modal = document.getElementById('create-rule-modal');
  if (!modal) return;
  // Keep it a direct child of <body> so a hidden parent page can't mask it.
  if (modal.parentElement !== document.body) document.body.appendChild(modal);

  _ruleModalCtx = { txId: (typeof opts.txId !== 'undefined' ? opts.txId : null),
                    mode: opts.merchant ? 'assign' : 'create' };

  // Category select
  var catSel = document.getElementById('create-rule-category');
  if (catSel) {
    catSel.innerHTML = '<option value="">— Select Category —</option>'
      + LCATS.map(function(c) { return '<option value="' + c.id + '">' + c.name + '</option>'; }).join('');
    catSel.value = opts.catId || '';
  }
  // Subcategory select (built from the chosen category)
  createRuleCategoryChanged();
  var subSel = document.getElementById('create-rule-subcat');
  if (subSel && opts.subcat) subSel.value = opts.subcat;

  // Merchant / rule text
  var mI = document.getElementById('create-rule-merchant');
  if (mI) mI.value = opts.merchant || '';

  // Pattern
  var pat = opts.pattern || 'exact';
  document.querySelectorAll('input[name="create-rule-pattern"]').forEach(function(r) {
    r.checked = (r.value === pat);
  });
  updatePatternLabels();

  // Apply-all defaults on
  var applyCb = document.getElementById('create-rule-apply-all');
  if (applyCb) applyCb.checked = true;

  // Title / subtitle reflect the mode
  var title = document.getElementById('create-rule-title');
  var sub   = document.getElementById('create-rule-sub');
  if (_ruleModalCtx.mode === 'assign') {
    if (title) title.innerHTML = '<i class="ti ti-bolt"></i> Save as a rule?';
    if (sub) sub.textContent = 'Auto-apply this category next time this merchant appears — and optionally to matching transactions you already have.';
  } else {
    if (title) title.innerHTML = '<i class="ti ti-bolt"></i> Create Rule';
    if (sub) sub.textContent = 'Auto-assign a category whenever a transaction matches this rule.';
  }

  ruleModalScan();
  modal.style.display = 'flex';
  // Focus the rule text only when it's blank (a create-from-scratch flow).
  if (mI && !opts.merchant) setTimeout(function() { mI.focus(); }, 80);
}

function closeRuleModal() {
  var m = document.getElementById('create-rule-modal');
  if (m) m.style.display = 'none';
  _ruleModalCtx = { txId: null, mode: 'create' };
}

// Do two rules' match-sets overlap? exact matches {s===key}; contains
// matches {s includes key}. Mirrors how the app applies rules to transactions.
function rulesOverlap(aKey, aPat, bKey, bPat) {
  if (!aKey || !bKey) return false;
  if (aKey === bKey) return true;
  if (aPat === 'exact' && bPat === 'exact')     return aKey === bKey;
  if (aPat === 'exact' && bPat === 'contains')  return aKey.indexOf(bKey) !== -1;
  if (aPat === 'contains' && bPat === 'exact')  return bKey.indexOf(aKey) !== -1;
  return aKey.indexOf(bKey) !== -1 || bKey.indexOf(aKey) !== -1; // both contains
}

// Find existing rules that either duplicate this key or overlap its matches.
// Returns { duplicate, overlaps: [{key, catId, subcat, pattern, source}] }.
function detectRuleConflicts(merchant, pattern) {
  var m = (merchant || '').toLowerCase();
  var out = { duplicate: null, overlaps: [] };
  if (!m) return out;

  Object.keys(LRULES).forEach(function(k) {
    var r = ruleRead(k); if (!r) return;
    var kl = k.toLowerCase();
    if (kl === m) { out.duplicate = { key: k, catId: r.catId, subcat: r.subcat || '', pattern: r.pattern || 'exact', source: 'lrule' }; return; }
    if (rulesOverlap(m, pattern, kl, r.pattern || 'exact')) {
      out.overlaps.push({ key: k, catId: r.catId, subcat: r.subcat || '', pattern: r.pattern || 'exact', source: 'lrule' });
    }
  });

  var learned = {};
  try { learned = JSON.parse(localStorage.getItem('learnedMappings') || '{}'); } catch(e) {}
  Object.keys(learned).forEach(function(k) {
    var meta = learned[k]; if (!meta || !meta.catId) return;
    var kl = k.toLowerCase(); if (kl === m) return;
    if (rulesOverlap(m, pattern, kl, 'exact')) {
      out.overlaps.push({ key: k, catId: meta.catId, subcat: meta.subcat || '', pattern: 'exact', source: 'learned' });
    }
  });

  return out;
}

// How many existing transactions this rule would touch, split by whether
// they'd change, are already correct, or are manual edits we'd protect.
function previewRuleMatches(merchant, pattern, catId, subcat) {
  var m = (merchant || '').toLowerCase();
  var trigger = _ruleModalCtx ? _ruleModalCtx.txId : null;
  var r = { total: 0, willChange: 0, manualKept: 0, already: 0 };
  if (!m) return r;
  TX.forEach(function(t) {
    var key = ruleKey(t) || '';
    var match = pattern === 'contains' ? key.indexOf(m) !== -1 : key === m;
    if (!match) return;
    r.total++;
    var same = t.catId === catId && (t.subcat || '') === (subcat || '');
    if (t.userSet && t.id !== trigger) { if (same) r.already++; else r.manualKept++; return; }
    if (same) r.already++; else r.willChange++;
  });
  return r;
}

// Write a rule to matching transactions. Protects manual edits (userSet)
// except the triggering transaction. Returns { updated, skipped }.
function applyRuleToTx(merchant, pattern, catId, subcat, protectManual, triggerTxId) {
  var m = (merchant || '').toLowerCase();
  var cat = LCATS.find(function(c) { return c.id === catId; });
  var catName = cat ? cat.name : 'Other';
  var updated = 0, skipped = 0;
  TX.forEach(function(t) {
    var key = ruleKey(t) || '';
    var match = pattern === 'contains' ? key.indexOf(m) !== -1 : key === m;
    if (!match) return;
    var same = t.catId === catId && (t.subcat || '') === (subcat || '');
    if (protectManual && t.userSet && t.id !== triggerTxId) { if (!same) skipped++; return; }
    if (!same) { t.catId = catId; t.subcat = subcat || ''; t.category = catName; t.userSet = true; updated++; }
  });
  return { updated: updated, skipped: skipped };
}

// Live conflict + apply preview rendered into #create-rule-conflicts.
function ruleModalScan() {
  var box = document.getElementById('create-rule-conflicts');
  if (!box) return;
  var merchant = (document.getElementById('create-rule-merchant').value || '').trim();
  var catId    = document.getElementById('create-rule-category').value;
  var subcat   = document.getElementById('create-rule-subcat').value || '';
  var patEl    = document.querySelector('input[name="create-rule-pattern"]:checked');
  var pattern  = patEl ? patEl.value : 'exact';

  if (merchant.length < 2) { box.innerHTML = ''; return; }

  var html = '';

  // Apply preview
  if (catId) {
    var p = previewRuleMatches(merchant, pattern, catId, subcat);
    var line;
    if (p.willChange > 0) line = '<strong class="tone-pink">' + p.willChange + '</strong> existing transaction' + (p.willChange !== 1 ? 's' : '') + ' will be re-categorised';
    else if (p.already > 0) line = 'Matches ' + p.already + ' transaction' + (p.already !== 1 ? 's' : '') + ' — all already correct';
    else line = 'No existing transactions match yet — this rule applies going forward';
    html += '<div class="cr-preview">'
      + ICON('bolt') + ' ' + line
      + (p.manualKept > 0 ? '<div class="cr-kept">' + ICON('lock') + ' ' + p.manualKept + ' manually-set transaction' + (p.manualKept !== 1 ? 's' : '') + ' will be left untouched</div>' : '')
      + '</div>';
  }

  // Conflicts
  var conf = detectRuleConflicts(merchant, pattern);
  if (conf.duplicate) {
    var dCat = LCATS.find(function(c) { return c.id === conf.duplicate.catId; });
    html += '<div class="cr-dup">'
      + ICON('alert-triangle') + ' A rule for <strong>' + esc(conf.duplicate.key) + '</strong> already exists ('
      + (dCat ? esc(dCat.name) : esc(conf.duplicate.catId)) + '). Saving will <strong>replace</strong> it.'
      + '</div>';
  }
  if (conf.overlaps.length) {
    html += '<div class="cr-ov">'
      + '<div class="cr-ov-hd">'
      + ICON('alert-triangle') + ' ' + conf.overlaps.length + ' overlapping rule' + (conf.overlaps.length !== 1 ? 's' : '') + ' — tick any you want to remove</div>'
      + '<div class="cr-ov-body">';
    conf.overlaps.forEach(function(o, i) {
      var oCat = LCATS.find(function(c) { return c.id === o.catId; });
      var winsNote = _overlapPrecedenceNote(merchant, pattern, o.key, o.pattern);
      html += '<label class="cr-ov-item">'
        + '<input type="checkbox" class="rule-conflict-cb cr-ov-cb" data-key="' + esc(o.key).replace(/"/g, '&quot;') + '" data-source="' + o.source + '"/>'
        + '<span><strong>' + esc(o.key) + '</strong> <span class="tone-muted">(' + (o.pattern === 'contains' ? '◡ contains' : '= exact') + ')</span> → '
        + (oCat ? esc(oCat.name) : esc(o.catId)) + (o.subcat ? ' › ' + esc(o.subcat) : '')
        + (o.source === 'learned' ? ' <span class="tone-green">· auto-learned</span>' : '')
        + (winsNote ? '<br><span class="cr-ov-note">' + winsNote + '</span>' : '')
        + '</span></label>';
    });
    html += '</div></div>';
  }

  box.innerHTML = html;
}

// Plain-language note on which rule wins for the transactions they share.
function _overlapPrecedenceNote(newKey, newPat, oldKey, oldPat) {
  newKey = (newKey || '').toLowerCase(); oldKey = (oldKey || '').toLowerCase();
  if (newPat === 'exact' && oldPat === 'contains') return 'Exact wins — this new rule takes precedence.';
  if (newPat === 'contains' && oldPat === 'exact') return 'Exact wins — the existing rule keeps precedence for its exact match.';
  if (newPat === 'contains' && oldPat === 'contains') {
    if (newKey.length > oldKey.length) return 'Both "contains" — the longer keyword (this new rule) wins.';
    if (newKey.length < oldKey.length) return 'Both "contains" — the longer keyword (the existing rule) wins.';
  }
  return '';
}

function updatePatternLabels() {
  // Defer one tick so the radio is already checked when we read it
  setTimeout(function() {
    var sel = document.querySelector('input[name="create-rule-pattern"]:checked');
    var pattern = sel ? sel.value : 'exact';
    var exactEl    = document.getElementById('pattern-exact-label');
    var containsEl = document.getElementById('pattern-contains-label');

    function applyCard(el, active) {
      if (!el) return;
      el.classList.toggle('is-active', active);
    }

    applyCard(exactEl,    pattern === 'exact');
    applyCard(containsEl, pattern === 'contains');
  }, 0);
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
// The transaction bulk-select bar tracks its state in _txSelected (see
// transactions.js), which spans the whole filtered set — not just the rows
// currently rendered by the load-more window.
function onTxCheck() {
  if (typeof txSelectionChanged === 'function') txSelectionChanged();
}

function toggleSelectAll(masterCb) {
  if (masterCb.checked) { _txFiltered.forEach(t => _txSelected.add(t.id)); }
  else { _txSelected.clear(); }
  // Sync the checkboxes that are actually in the DOM right now.
  document.querySelectorAll('.tx-row-check').forEach(cb => { cb.checked = _txSelected.has(Number(cb.dataset.id)); });
  if (typeof txSelectionChanged === 'function') txSelectionChanged();
}

function clearTxSelection() {
  _txSelected.clear();
  document.querySelectorAll('.tx-row-check').forEach(cb => { cb.checked = false; });
  const bar = document.getElementById('tx-bulk-bar');
  if (bar) bar.style.display = 'none';
  const sa = document.getElementById('tx-select-all');
  if (sa) { sa.checked = false; sa.indeterminate = false; }
}

function bulkAssignCategory() {
  const catId = document.getElementById('tx-bulk-cat')?.value;
  if (!catId) { toast('⚠️ Pick a category first'); return; }
  if (!_txSelected.size) { toast('⚠️ No transactions selected'); return; }
  const cat = LCATS.find(c => c.id === catId);
  let count = 0;
  _txSelected.forEach(id => {
    const t = TX.find(x => x.id === id);
    if (t) { t.catId = catId; t.category = cat ? cat.name : 'Other'; t.userSet = true; count++; }
  });
  save(K.tx, TX);
  clearTxSelection();
  renderTx();
  const bva = document.getElementById('page-bva');
  if (bva && bva.classList.contains('active')) renderBVA();
  toast('✅ Assigned ' + count + ' transactions to ' + (cat ? cat.name : catId));
}

// ══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
// SUBCATEGORIES, ICON PICKER, CATEGORY IMPORT/EXPORT
// ══════════════════════════════════════════════════════════════

function renderIconPicker() {
  const el = document.getElementById('cat-icon-picker');
  if (!el) return;
  const cur = document.getElementById('cat-icon-input')?.value || 'tag';
  const prev = document.getElementById('cat-icon-preview');
  if (prev) prev.innerHTML = ICON(cur);
  el.innerHTML = ICON_PICKER_SET.map(k =>
    '<div class="cg-icon-opt' + (cur === k ? ' is-active' : '') + '" onclick="pickIcon(\'' + k + '\')">'
    + ICON(k) + '</div>'
  ).join('');
}

function pickIcon(key) {
  const inp = document.getElementById('cat-icon-input');
  if (inp) inp.value = key;
  const prev = document.getElementById('cat-icon-preview');
  if (prev) prev.innerHTML = ICON(key);
  renderIconPicker();
}

function syncIconFromInput(val) {
  const prev = document.getElementById('cat-icon-preview');
  if (prev) prev.innerHTML = ICON(legacyIconToKey(val || 'tag'));
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
    return "<option value=\"" + c.id + "\">" + c.name + "</option>";
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
  const icon  = document.getElementById('cat-icon-input')?.value?.trim() || 'tag';
  const name  = document.getElementById('cat-name-input')?.value?.trim();
  const color = document.getElementById('cat-color-input')?.value || '#e8457a';
  const type  = document.getElementById('cat-type-input')?.value || 'expense';
  if (!name) { toast('Enter a category name'); return; }
  if (LCATS.find(c => c.name.toLowerCase() === name.toLowerCase())) { toast('Category already exists'); return; }
  const id = name.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now();
  LCATS.push({ id, name, icon, color, type, subcats: [] });
  save(K.categories, LCATS);
  document.getElementById('cat-name-input').value = '';
  document.getElementById('cat-icon-input').value = 'tag';
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
  a.download = 'kelda-categories.json';
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
      // Normalise icons on import too (imports may carry legacy emoji from an older export).
      if (typeof legacyIconToKey === 'function') {
        LCATS.forEach(function(c) { c.icon = legacyIconToKey(c.icon); });
      }
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
// BANK CATEGORY COMPARISON  (Phase 7)
// ══════════════════════════════════════════════════════════════

// Mapping data: Kelda category → equivalents in each bank + HEM
// Blank string = not a distinct category in that bank
var _BANK_MAP = [
  // catId, kelda label,  CBA,                        Westpac,                NAB,                  ANZ,                  Macquarie,            Up Bank,              Amex,                 HEM
  ['home',             'Home',              'Home & Property',         'Home',                 'Home',               'Home',               'Home',               'Home',               'Home',               '04 Housing'],
  ['car_transport',    'Car & Transport',   'Transport',               'Transport',            'Transport',          'Transport',          'Transport',          'Transport',          'Transport',          '08 Transport'],
  ['health_beauty',    'Health & Beauty',    'Health & Personal Care',  'Health & Beauty',      'Health',             'Health',             'Health & Beauty',    'Health & Medical',   'Health',             '07 Health'],
  ['fitness',          'Fitness',           'Health & Personal Care',  'Health & Fitness',     'Health',             'Health',             'Health & Beauty',    'Fitness',            'Health',             '07 Health'],
  ['food_eating_out',  'Food & Eating Out', 'Groceries + Dining',      'Groceries + Dining',   'Food',               'Food & Drink',       'Food & Drink',       'Groceries + Eating Out', 'Supermarkets + Dining', '01 Food & Non-alcoholic Beverages'],
  ['children',         'Children',          'Family',                  'Family',               'Family',             'Family',             '—',                  'Family & Children',  '—',                  '10 Education (partial)'],
  ['pets',             'Pets',              'Animals & Pets',          'Pets',                 'Personal',           'Personal',           '—',                  'Pets',               '—',                  '09 Recreation (partial)'],
  ['insurance_utilities','Insurance',       'Insurance',               'Insurance',            'Insurance',          'Insurance',          'Insurance',          '—',                  'Insurance',          '12 Insurance & Financial Services'],
  ['utilities',        'Utilities',         'Home & Utilities',        'Bills & Payments',     'Bills',              'Bills & Utilities',  'Bills',              'Bills & Utilities',  '—',                  '05 Household Utilities'],
  ['tax',              'Tax Payments',      'Taxes',                   '—',                    'Tax',                '—',                  'Tax',                '—',                  '—',                  '12 Insurance & Financial Services'],
  ['entertainment',    'Entertainment',     'Entertainment',           'Entertainment',        'Entertainment',      'Entertainment',      'Entertainment',      'Entertainment',      'Entertainment',      '09 Recreation & Culture'],
  ['holidays_travel',  'Holidays & Travel',  'Travel',                  'Travel',               'Travel',             'Travel',             'Travel',             'Travel',             'Travel',             '09 Recreation & Culture'],
  ['shopping',         'Shopping',          'Shopping',                'Shopping',             'Shopping',           'Shopping',          'Shopping',            'Shopping',           'Shopping',           '03 Clothing & Footwear (partial)'],
  ['business',         'Business',          'Business',                'Business',             'Business',           'Business',           'Business',           '—',                  'Business',           '12 Insurance & Financial Services'],
  ['salary',           'Salary',            'Income',                  'Income',               'Income',             'Income',             'Income',             'Income',             'Income',             '— (Income)'],
  ['bonus',            'Bonus',             'Income',                  'Income',               'Income',             'Income',             'Income',             'Income',             'Income',             '— (Income)'],
  ['interest',         'Interest',          'Savings & Investments',   'Savings',              'Investment',         'Investment',         'Investment',         '—',                  '—',                  '— (Income)'],
  ['capital_gains',    'Capital Gains',     'Savings & Investments',   'Investments',          'Investment',         'Investment',         'Investment',         'Investment',         '—',                  '— (Income)'],
  ['transfers',        'Transfers',         'Transfers',               'Transfers',            'Transfers',          'Transfers',          'Transfers',          'Transfers',          'Transfers',          '— (Transfer)'],
  ['other',            'Other',             'Uncategorised',           'Other',                'Uncategorised',      'Uncategorised',      'Other',              'Uncategorised',      'Other',              '— (Other)'],
];

var _BANKS = ['All', 'CBA', 'Westpac', 'NAB', 'ANZ', 'Macquarie', 'Up Bank', 'Amex', 'HEM'];
var _BANK_COLORS = {
  'CBA':      { bg:'#ffed99', text:'#5a4500', dark_bg:'rgba(255,220,50,.18)', dark_text:'#f0c840' },
  'Westpac':  { bg:'#d0e8ff', text:'#003a7a', dark_bg:'rgba(50,120,255,.15)', dark_text:'#70b0ff' },
  'NAB':      { bg:'#ffe0d0', text:'#7a2000', dark_bg:'rgba(220,80,20,.15)',  dark_text:'#ff9060' },
  'ANZ':      { bg:'#d0ffec', text:'#005a30', dark_bg:'rgba(0,180,100,.15)',  dark_text:'#40d090' },
  'Macquarie':{ bg:'#ede0ff', text:'#3a0070', dark_bg:'rgba(120,60,220,.15)', dark_text:'#b080ff' },
  'Up Bank':  { bg:'#ffddf5', text:'#6a0040', dark_bg:'rgba(220,50,160,.15)', dark_text:'#ff80cc' },
  'Amex':     { bg:'#e0f0ff', text:'#003060', dark_bg:'rgba(0,80,180,.15)',   dark_text:'#6ab0ff' },
  'HEM':      { bg:'#f0f0f0', text:'#404040', dark_bg:'rgba(180,180,180,.15)','dark_text':'#b0b0b0' },
};
// Column indices in _BANK_MAP row (0=catId, 1=label, 2=CBA…9=HEM)
var _BANK_COL = { 'CBA':2,'Westpac':3,'NAB':4,'ANZ':5,'Macquarie':6,'Up Bank':7,'Amex':8,'HEM':9 };

var _bankCmpOpen    = false;
var _bankCmpFilter  = 'All';

function toggleBankComparison() {
  _bankCmpOpen = !_bankCmpOpen;
  var body     = document.getElementById('bank-comparison-body');
  var chevron  = document.getElementById('bank-cmp-chevron');
  if (!body) return;
  body.style.display = _bankCmpOpen ? 'block' : 'none';
  if (chevron) chevron.style.transform = _bankCmpOpen ? 'rotate(180deg)' : '';
  if (_bankCmpOpen) renderBankComparison();
}

function setBankFilter(bank) {
  _bankCmpFilter = bank;
  // Update pill styles
  var pills = document.querySelectorAll('.bank-filter-pill');
  pills.forEach(function(p) {
    p.classList.toggle('is-active', p.dataset.bank === bank);
  });
  renderBankComparison();
}

function renderBankComparison() {
  var pillsEl = document.getElementById('bank-filter-pills');
  var tableEl = document.getElementById('bank-cmp-table');
  if (!pillsEl || !tableEl) return;

  // Pills
  pillsEl.innerHTML = _BANKS.map(function(b) {
    var active = b === _bankCmpFilter;
    return '<button class="bank-filter-pill' + (active ? ' is-active' : '') + '" data-bank="' + b + '" onclick="setBankFilter(\'' + b + '\')">'
      + b + '</button>';
  }).join('');

  // Determine columns to show
  var showAll    = (_bankCmpFilter === 'All');
  var bankCols   = showAll
    ? Object.keys(_BANK_COL)
    : (_BANK_COL[_bankCmpFilter] !== undefined ? [_bankCmpFilter] : []);

  if (!bankCols.length) { tableEl.innerHTML = ''; return; }

  var isDark = document.documentElement.getAttribute('data-mode') !== 'light';

  // Table header
  var headerCells = '<th class="cg-bth">Kelda Category</th>';
  bankCols.forEach(function(b) {
    var c = _BANK_COLORS[b] || {};
    var bg   = isDark ? (c.dark_bg   || 'rgba(180,180,180,.1)')  : (c.bg   || '#f0f0f0');
    var col  = isDark ? (c.dark_text || 'var(--muted)')           : (c.text || '#444');
    headerCells += '<th class="cg-bth-bank" style="background:' + bg + ';color:' + col + '">'
      + b + '</th>';
  });

  // Table rows
  var rows = _BANK_MAP.map(function(row) {
    var _bmCat = LCATS.find(function(c){ return c.id === row[0]; });
    var cells = '<td class="cg-btd-cat">'
      + (_bmCat ? iconTag(_bmCat.icon) + ' ' : '') + row[1] + '</td>';
    bankCols.forEach(function(b) {
      var idx = _BANK_COL[b];
      var val = idx !== undefined ? (row[idx] || '—') : '—';
      var isEmpty = val === '—';
      cells += '<td class="cg-btd ' + (isEmpty ? 'tone-muted' : 'tone-text') + '">'
        + val + '</td>';
    });
    return '<tr>' + cells + '</tr>';
  }).join('');

  tableEl.innerHTML = '<table class="cg-btable">'
    + '<thead><tr>' + headerCells + '</tr></thead>'
    + '<tbody>' + rows + '</tbody>'
    + '</table>';
}

// ══════════════════════════════════════════════════════════════
// TRANSACTION BAR CHART
