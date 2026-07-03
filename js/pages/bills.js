// ══════════════════════════════════════════════════════════════
// BILLS — forecast & insights (no payment tracking)
// ══════════════════════════════════════════════════════════════

var BILL_FREQ_LABELS = { 'weekly':'Weekly', 'monthly':'Monthly', 'quarterly':'Quarterly', 'annual':'Annual' };
var BILL_TYPE_LABELS = { 'bill':'Bill', 'subscription':'Subscription', 'direct_debit':'Direct Debit' };
var BILL_TYPE_CLASS  = { 'bill':'btype-bill', 'subscription':'btype-sub', 'direct_debit':'btype-dd' };

var BILL_SUGGEST_KWORDS = [
  'insurance','insur','allianz','nrma','bupa','medibank','ahm','hcf','nib','frank health',
  'telstra','optus','vodafone','aldi mobile','boost mobile','amaysim','dodo mobile','belong mobile',
  'electricity','energy','gas bill','power bill','agl','origin energy','energex','alinta','ausgrid','jemena',
  'childcare','child care','kindy','kindergarten','daycare','day care','c&k','goodstart',
  'broadband','internet','iinet','aussie broadband','tpg','superloop','tangerine',
  'strata','body corporate','deft'
];
var SUBSCRIPTION_KWORDS = [
  'netflix','spotify','disney','stan','binge','kayo','apple.com/bill','apple music','google play',
  'youtube premium','amazon prime','adobe','microsoft 365','canva','chatgpt','claude.ai',
  'audible','kindle unlimited'
];
var BILL_CATEGORY_MAP = {
  bill: ['telco','phone','mobile','insurance','utilit','electricity','gas','water','energy','strata','body corporate'],
  subscription: ['streaming','apple','app store','entertainment','software','saas']
};

function billSuggestIcon(name, cat) {
  var n = (name||'').toLowerCase();
  if (/insurance|insur|bupa|medibank|nrma|allianz|ahm|hcf|nib/.test(n) || cat === 'insurance' || cat === 'insurance_utilities') return '❤️';
  if (/phone|mobile|telstra|optus|vodafone|amaysim|boost/.test(n) || cat === 'phone' || cat === 'mobile') return '📱';
  if (/electricity|energy|gas|power|agl|origin|alinta|ausgrid/.test(n) || cat === 'utilities') return '💡';
  if (/childcare|kindy|kindergarten|daycare|goodstart|c&k/.test(n) || cat === 'childcare' || cat === 'children') return '👶';
  if (/internet|broadband|iinet|aussie|tpg|superloop/.test(n) || cat === 'internet') return '📡';
  if (/strata|body corporate|deft/.test(n) || cat === 'home') return '🏠';
  if (/netflix|stan|binge|disney|kayo|foxtel|paramount/.test(n) || cat === 'entertainment') return '🎬';
  return '🧾';
}
function blPickIcon(key, catId, subcat, billType) {
  var icon = billSuggestIcon(key, catId);
  if (icon !== '🧾') return icon;
  if (billType === 'subscription' || /streaming/i.test(subcat||'')) return '🎬';
  return '🧾';
}

// ── Date / math utilities ────────────────────────────────────
function blAddDays(dateStr, n) {
  var d = new Date(dateStr + 'T00:00:00'); d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function blAddMonths(dateStr, n) {
  var d = new Date(dateStr + 'T00:00:00'); d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}
function blAddInterval(dateStr, freq, mult) {
  mult = mult || 1;
  if (freq === 'weekly') return blAddDays(dateStr, 7 * mult);
  if (freq === 'quarterly') return blAddMonths(dateStr, 3 * mult);
  if (freq === 'annual') return blAddMonths(dateStr, 12 * mult);
  return blAddMonths(dateStr, 1 * mult);
}
function blDaysBetween(a, b) {
  var da = new Date(a + 'T00:00:00'), db = new Date(b + 'T00:00:00');
  return Math.round((db - da) / 86400000);
}
function blMonthsBetween(a, b) {
  var da = new Date(a + 'T00:00:00'), db = new Date(b + 'T00:00:00');
  var months = (db.getFullYear() - da.getFullYear()) * 12 + (db.getMonth() - da.getMonth());
  if (db.getDate() < da.getDate()) months -= 1;
  return months;
}
function blMedian(arr) {
  if (!arr.length) return 0;
  var s = arr.slice().sort(function(a,b){return a-b;});
  var mid = Math.floor(s.length/2);
  return s.length % 2 ? s[mid] : (s[mid-1]+s[mid])/2;
}
function blMean(arr) {
  if (!arr.length) return 0;
  return arr.reduce(function(s,v){return s+v;},0) / arr.length;
}
function blIQR(arr) {
  if (arr.length < 2) return 0;
  var s = arr.slice().sort(function(a,b){return a-b;});
  function q(p) {
    var idx = p * (s.length - 1);
    var lo = Math.floor(idx), hi = Math.ceil(idx);
    if (lo === hi) return s[lo];
    return s[lo] + (s[hi]-s[lo]) * (idx-lo);
  }
  return q(0.75) - q(0.25);
}
function blWeightedStdev(arr, weights) {
  if (!arr.length) return 0;
  var totalW = weights.reduce(function(s,w){return s+w;},0) || 1;
  var mean = arr.reduce(function(s,v,i){return s+v*weights[i];},0) / totalW;
  var variance = arr.reduce(function(s,v,i){return s+weights[i]*Math.pow(v-mean,2);},0) / totalW;
  return Math.sqrt(variance);
}

// ── AU public holidays (business-day tolerance) ──────────────
function blEasterSunday(year) {
  var a = year % 19, b = Math.floor(year/100), c = year % 100;
  var d = Math.floor(b/4), e = b % 4, f = Math.floor((b+8)/25);
  var g = Math.floor((b-f+1)/3), h = (19*a+b-d-g+15) % 30;
  var i = Math.floor(c/4), k = c % 4, l = (32+2*e+2*i-h-k) % 7;
  var m = Math.floor((a+11*h+22*l)/451);
  var month = Math.floor((h+l-7*m+114)/31), day = ((h+l-7*m+114) % 31) + 1;
  return new Date(year, month-1, day);
}
function blAuHolidays(year) {
  var easter = blEasterSunday(year);
  var goodFriday = new Date(easter); goodFriday.setDate(easter.getDate()-2);
  var easterMonday = new Date(easter); easterMonday.setDate(easter.getDate()+1);
  function iso(d){ return d.toISOString().slice(0,10); }
  return [year+'-01-01', year+'-01-26', iso(goodFriday), iso(easterMonday), year+'-04-25', year+'-12-25', year+'-12-26'];
}
function blIsAuHoliday(dateStr) {
  if (!dateStr) return false;
  return blAuHolidays(Number(dateStr.slice(0,4))).indexOf(dateStr) !== -1;
}
function blIsWeekend(dateStr) {
  if (!dateStr) return false;
  var d = new Date(dateStr + 'T00:00:00').getDay();
  return d === 0 || d === 6;
}

// ── Bill-specific alias table (layered on top of MERCHANT_ALIASES) ──
function blResolveBillAlias(canonical) {
  if (BILL_ALIASES[canonical]) return canonical;
  var keys = Object.keys(BILL_ALIASES);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    var dist = (typeof levenshtein === 'function') ? levenshtein(canonical, k) : 99;
    if (dist <= 2) return k;
    var ta = canonical.split(' ').slice(0,2).join(' ');
    var tb = k.split(' ').slice(0,2).join(' ');
    if (ta && ta === tb) return k;
  }
  return canonical;
}
function blRecordBillAlias(merchantKey, rawDescription) {
  if (!rawDescription) return;
  if (!BILL_ALIASES[merchantKey]) BILL_ALIASES[merchantKey] = [];
  if (BILL_ALIASES[merchantKey].indexOf(rawDescription) === -1) {
    BILL_ALIASES[merchantKey].push(rawDescription);
    save(K.billAliases, BILL_ALIASES);
  }
}

// ── Category inheritance ──────────────────────────────────────
function blInheritCategory(txs) {
  var counts = {};
  txs.forEach(function(t) {
    var k = (t.catId || 'other') + '|' + (t.subcat || '');
    counts[k] = (counts[k] || 0) + 1;
  });
  var bestKey = null, bestCount = -1;
  Object.keys(counts).forEach(function(k) { if (counts[k] > bestCount) { bestCount = counts[k]; bestKey = k; } });
  if (!bestKey) { var last = txs[txs.length-1]; return { catId: last.catId || 'other', subcat: last.subcat || '', account: last.account || '' }; }
  var parts = bestKey.split('|');
  var accCounts = {};
  txs.forEach(function(t){ var a = t.account || ''; if (a) accCounts[a] = (accCounts[a]||0)+1; });
  var bestAcc = '', bestAccCount = -1;
  Object.keys(accCounts).forEach(function(a){ if (accCounts[a] > bestAccCount) { bestAccCount = accCounts[a]; bestAcc = a; } });
  return { catId: parts[0], subcat: parts[1], account: bestAcc };
}

// ── Frequency detection (business-day aware, tolerant) ────────
function blGapTolerance(freq) { return { weekly:2, monthly:5, quarterly:10, annual:21 }[freq]; }
function blExpectedGap(freq)  { return { weekly:7, monthly:30, quarterly:91, annual:365 }[freq]; }
function blIsOffSchedule(gap, freq, priorDateStr) {
  var expected = blExpectedGap(freq), tol = blGapTolerance(freq);
  var diff = Math.abs(gap - expected);
  if (diff <= tol) return false;
  if (diff <= tol + 3 && (blIsWeekend(priorDateStr) || blIsAuHoliday(priorDateStr))) return false;
  return true;
}
function blClassifyFrequency(txs) {
  var dates = txs.map(function(t){ return t.date; });
  var gaps = [];
  for (var i = 1; i < dates.length; i++) gaps.push(blDaysBetween(dates[i-1], dates[i]));
  if (!gaps.length) return { passed:false };
  var med = blMedian(gaps);
  var bands = [['weekly',7],['monthly',30],['quarterly',91],['annual',365]];
  var freq = bands.reduce(function(best,b){ return Math.abs(med-b[1]) < Math.abs(med-best[1]) ? b : best; }, bands[0])[0];
  var tol = blGapTolerance(freq);
  var last5 = gaps.slice(-5);
  var offCount = 0;
  for (var j = 0; j < last5.length; j++) {
    var priorDate = dates[dates.length - last5.length - 1 + j];
    if (blIsOffSchedule(last5[j], freq, priorDate)) offCount++;
  }
  if (offCount > 1) return { passed:false };
  var weights = gaps.map(function(g,i2){ return i2 >= gaps.length-2 ? 2 : 1; });
  var stdev = blWeightedStdev(gaps, weights);
  var gapConsistency = Math.max(0, Math.min(1, 1 - (stdev / tol)));
  var sameDayBonus = 0, sameDayBonusApplied = false;
  if (freq === 'monthly') {
    var days = dates.map(function(d){ return Number(d.split('-')[2]); });
    var refDay = days[days.length-1];
    var within = days.filter(function(d){ return Math.abs(d-refDay) <= 2; }).length;
    if (within / days.length >= 0.75) { sameDayBonus = 0.10; sameDayBonusApplied = true; }
  }
  return { passed:true, frequency:freq, gapConsistency:gapConsistency, sameDayBonus:sameDayBonus, sameDayBonusApplied:sameDayBonusApplied };
}

// ── Amount stability & trend detection ─────────────────────────
function blClassifyAmount(txs) {
  var amounts = txs.map(function(t){ return Math.abs(Number(t.amount)); });
  var med = blMedian(amounts);
  var withinTolerance = amounts.map(function(a){ return Math.abs(a-med) <= Math.max(med*0.10, 10); });
  var failCount = withinTolerance.filter(function(ok){ return !ok; }).length;
  if (failCount > 1) return { rejected:true };
  var iqr = blIQR(amounts);
  var ratio = med ? iqr/med : 0;
  var amountType;
  if (ratio <= 0.05) { amountType = 'fixed'; }
  else if (ratio <= 0.30) { amountType = 'variable'; }
  else if (failCount <= 1) {
    var outlierIdx = amounts.reduce(function(bi,a,i){ return Math.abs(a-med) > Math.abs(amounts[bi]-med) ? i : bi; }, 0);
    var without = amounts.slice(); without.splice(outlierIdx,1);
    var medWithout = blMedian(without);
    var ratio2 = medWithout ? blIQR(without)/medWithout : 0;
    if (ratio2 <= 0.30) { amountType = 'variable'; ratio = ratio2; }
    else return { rejected:true };
  } else return { rejected:true };
  var stability = Math.max(0, Math.min(1, 1-ratio));
  var rollingAmt = amountType === 'fixed' ? med : blMean(amounts.slice(-3));
  return { rejected:false, amountType:amountType, amount: Math.round(rollingAmt*100)/100, stability:stability, medianAmount: med };
}
function blDetectTrend(txs, amtResult) {
  if (txs.length < 2) return { trend:'stable', pendingUpdate:null };
  var last = Math.abs(Number(txs[txs.length-1].amount));
  var priorRef = amtResult.amountType === 'variable'
    ? blMean(txs.slice(-4,-1).map(function(t){ return Math.abs(Number(t.amount)); }))
    : Math.abs(Number(txs[txs.length-2].amount));
  if (!priorRef) return { trend:'stable', pendingUpdate:null };
  var change = (last - priorRef) / priorRef;
  if (Math.abs(change) > 0.05) {
    return { trend: change > 0 ? 'increasing' : 'decreasing', pendingUpdate: { newAmount: last, detectedAt: today() } };
  }
  return { trend:'stable', pendingUpdate:null };
}
function blRecencyGateTriggered(txs, freq) {
  var last = txs[txs.length-1].date;
  return blDaysBetween(last, today()) > blExpectedGap(freq) * 2;
}

// ── Bill type classification ────────────────────────────────────
function blClassifyBillType(catId, subcat, merchantKey, sameDayBonusApplied, medianAmount, rawSamples) {
  var catObj = LCATS.find(function(c){ return c.id === catId; });
  var haystack = ((catObj ? catObj.name : catId || '') + ' ' + (subcat || '')).toLowerCase();
  var i;
  for (i = 0; i < BILL_CATEGORY_MAP.bill.length; i++) { if (haystack.indexOf(BILL_CATEGORY_MAP.bill[i]) !== -1) return 'bill'; }
  for (i = 0; i < BILL_CATEGORY_MAP.subscription.length; i++) { if (haystack.indexOf(BILL_CATEGORY_MAP.subscription[i]) !== -1) return 'subscription'; }
  var mk = (merchantKey || '').toLowerCase();
  if (BILL_SUGGEST_KWORDS.some(function(k){ return mk.indexOf(k) !== -1; })) return 'bill';
  if (SUBSCRIPTION_KWORDS.some(function(k){ return mk.indexOf(k) !== -1; })) return 'subscription';
  var signals = 0;
  if (sameDayBonusApplied) signals++;
  var rounded = Math.round(medianAmount * 2) / 2;
  if (Math.abs(medianAmount - Math.round(medianAmount)) < 0.001 || Math.abs(medianAmount - rounded) <= 0.5) signals++;
  var prefixMatch = (rawSamples || []).some(function(r){ return /^\s*(direct debit|ddr|dd |becs|ezidebit)/i.test(r || ''); });
  if (prefixMatch) signals++;
  return 'direct_debit';
}

function blComputeNextDueDate(lastDate, freq) {
  var next = blAddInterval(lastDate, freq, 1);
  var guard = 0;
  while (next < today() && guard < 60) { next = blAddInterval(next, freq, 1); guard++; }
  return next;
}

// ── Detection engine — pure function ────────────────────────────
function detectRecurringBills(txList, existingBills, dismissedKeys, aliases) {
  var groups = {};
  var cutoff = blAddMonths(today(), -13);
  (txList || []).forEach(function(t) {
    if (t.type !== 'expense' || !t.amount || !t.date || t.date < cutoff) return;
    var raw = t.rawDescription || t.name || t.description || '';
    var pre = (typeof preprocessMerchantString === 'function') ? preprocessMerchantString(raw) : raw.toLowerCase();
    if (!pre) return;
    var canon = (typeof resolveAlias === 'function') ? resolveAlias(pre) : pre;
    var key = blResolveBillAlias(canon);
    if ((dismissedKeys || []).indexOf(key) !== -1) return;
    if (!groups[key]) groups[key] = { key: key, txs: [], raws: [] };
    groups[key].txs.push(t);
    groups[key].raws.push(raw);
  });

  var results = [];
  Object.keys(groups).forEach(function(key) {
    var g = groups[key];
    if (g.txs.length < 3) return;
    g.txs.sort(function(a,b){ return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0); });

    var freqResult = blClassifyFrequency(g.txs);
    if (!freqResult.passed) return;
    var amtResult = blClassifyAmount(g.txs);
    if (amtResult.rejected) return;

    var occWeight = g.txs.length >= 5 ? 1.0 : (g.txs.length === 4 ? 0.8 : 0.6);
    var score = occWeight*0.3 + freqResult.gapConsistency*0.4 + amtResult.stability*0.3 + freqResult.sameDayBonus;
    score = Math.min(1, score);
    if (blRecencyGateTriggered(g.txs, freqResult.frequency)) score = Math.min(score, 0.44);

    var status = score >= 0.75 ? 'confirmed' : (score >= 0.45 ? 'pending_review' : null);
    if (!status) return;

    var trend = blDetectTrend(g.txs, amtResult);
    var catInfo = blInheritCategory(g.txs);
    var last = g.txs[g.txs.length - 1];
    var nextDue = blComputeNextDueDate(last.date, freqResult.frequency);
    var billType = blClassifyBillType(catInfo.catId, catInfo.subcat, key, freqResult.sameDayBonusApplied, amtResult.medianAmount, g.raws);
    var displayName = (typeof makeDisplayMerchant === 'function') ? makeDisplayMerchant(key) : key;

    results.push({
      id: 'bd_' + key.replace(/[^a-z0-9]/g, '').slice(0, 24) + '_' + g.txs.length,
      merchantKey: key,
      displayName: displayName,
      icon: blPickIcon(key, catInfo.catId, catInfo.subcat, billType),
      category: catInfo.catId,
      subcategory: catInfo.subcat,
      account: catInfo.account || '',
      billType: billType,
      frequency: freqResult.frequency,
      amountType: amtResult.amountType,
      amount: amtResult.amount,
      amountTrend: trend.trend,
      // Fresh candidates never carry a pending price-change — their `amount` is
      // already the current rolling avg/median. Price-change confirmations are
      // raised by runBillDetection() only when an EXISTING confirmed bill drifts,
      // keeping the accept/confirm flow idempotent (no re-flag loop).
      pendingAmountUpdate: null,
      nextDueDate: nextDue,
      lastSeenDate: last.date,
      confidence: Math.round(score * 100) / 100,
      source: 'detected',
      status: status,
      isAnnual: freqResult.frequency === 'annual',
      _rawSample: g.raws[g.raws.length - 1]
    });
  });
  return results;
}

// ── Merge fresh detection results into stored BILLS ──────────────
function runBillDetection() {
  try {
    var candidates = detectRecurringBills(TX, BILLS, BILLS_DISMISSED, BILL_ALIASES);
    var changed = false;
    candidates.forEach(function(c) {
      if (BILLS_DISMISSED.indexOf(c.merchantKey) !== -1) return;
      var existing = BILLS.find(function(b){ return b.merchantKey === c.merchantKey; });
      if (!existing) { BILLS.push(c); changed = true; return; }
      if (existing.status === 'confirmed') {
        existing.lastSeenDate = c.lastSeenDate;
        existing.nextDueDate = existing.source === 'manual' && existing.nextDueDate > today() ? existing.nextDueDate : c.nextDueDate;
        if (existing.confidence !== null) existing.confidence = c.confidence;
        if (c.amount && existing.amount && Math.abs(c.amount - existing.amount) / existing.amount > 0.05 && !existing.pendingAmountUpdate) {
          existing.amountTrend = c.amount > existing.amount ? 'increasing' : 'decreasing';
          existing.pendingAmountUpdate = { newAmount: c.amount, detectedAt: today() };
          changed = true;
        }
      } else if (existing.status === 'pending_review') {
        existing.amount = c.amount; existing.amountType = c.amountType;
        existing.billType = existing._userSetType ? existing.billType : c.billType;
        existing.category = c.category; existing.subcategory = c.subcategory;
        existing.nextDueDate = c.nextDueDate; existing.lastSeenDate = c.lastSeenDate;
        existing.confidence = c.confidence; existing.frequency = c.frequency;
        changed = true;
      }
    });
    if (changed) save(K.bills, BILLS);
  } catch(e) { console.warn('Kelda: bill detection failed', e); }
}

// ── Migration from old {due,paid} schema ──────────────────────
function migrateBillsSchema() {
  var needsMigration = BILLS.some(function(b){ return typeof b.due === 'number' || typeof b.paid === 'boolean'; });
  if (!needsMigration) return;
  try {
    BILLS = BILLS.map(function(b) {
      if (!(typeof b.due === 'number' || typeof b.paid === 'boolean')) return b;
      var name = b.name || 'Bill';
      var mkey = ((typeof preprocessMerchantString === 'function' ? preprocessMerchantString(name) : name.toLowerCase()) || name.toLowerCase());
      mkey = (typeof resolveAlias === 'function') ? resolveAlias(mkey) : mkey;
      var freqRaw = (b.frequency || 'monthly').toLowerCase();
      var freq = freqRaw === 'yearly' ? 'annual' : (['weekly','monthly','quarterly','annual'].indexOf(freqRaw) !== -1 ? freqRaw : 'monthly');
      var dueDay = Number(b.due) || 1;
      var d = new Date();
      var lastDayOfMonth = new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
      d.setDate(Math.min(dueDay, lastDayOfMonth));
      var nextDue = d.toISOString().slice(0,10);
      if (nextDue < today()) nextDue = blComputeNextDueDate(nextDue, freq);
      // Migrated records were already user-curated bills, so the conservative
      // default is 'bill' rather than the fresh-detection 'direct_debit' catch-all.
      var billType = blClassifyBillType(b.category || 'other', '', mkey, false, Number(b.amount)||0, [name]);
      if (billType === 'direct_debit') billType = 'bill';
      return {
        id: b.id || ('bd_migrated_' + Date.now() + '_' + Math.random().toString(36).slice(2,8)),
        merchantKey: mkey, displayName: name, icon: b.icon || '🧾',
        category: b.category || 'other', subcategory: '', account: '',
        billType: billType || 'bill', frequency: freq,
        amountType: 'fixed', amount: Number(b.amount) || 0,
        amountTrend: 'stable', pendingAmountUpdate: null,
        nextDueDate: nextDue, lastSeenDate: '', confidence: null,
        source: 'manual', status: 'confirmed', isAnnual: freq === 'annual'
      };
    });
    save(K.bills, BILLS);
  } catch(e) { console.warn('Kelda: bill migration failed', e); }
}

var _blReadyDone = false;
function blEnsureBillsReady() {
  try {
    migrateBillsSchema();
    runBillDetection();
    _blReadyDone = true;
  } catch(e) { console.warn('Kelda: blEnsureBillsReady failed', e); }
}

// ── Annual bill buffer ─────────────────────────────────────────
function blAnnualBuffer(bill) {
  var months = Math.max(1, blMonthsBetween(today(), bill.nextDueDate));
  return (Number(bill.amount) || 0) / months;
}
function blTotalAnnualBuffer() {
  return BILLS.filter(function(b){ return b.status === 'confirmed' && (b.isAnnual || b.frequency === 'annual'); })
    .reduce(function(s,b){ return s + blAnnualBuffer(b); }, 0);
}

// ── Occurrence projection (for the cash-demand chart / KPIs) ──
function blProjectOccurrences(bill, horizonDays) {
  var occs = [];
  if (!bill.nextDueDate) return occs;
  var endDate = blAddDays(today(), horizonDays);
  var d = bill.nextDueDate;
  var guard = 0;
  while (d && d <= endDate && guard < 260) {
    occs.push(d);
    d = blAddInterval(d, bill.frequency, 1);
    guard++;
  }
  return occs;
}

// ══════════════════════════════════════════════════════════════
// UI STATE
// ══════════════════════════════════════════════════════════════
var blHorizon    = Number(load(K.billsHorizon)) || 30; // 30 | 90 | 365
var blTypeFilter = 'all'; // all | bill | subscription | direct_debit
var blSearch     = '';
var blPage       = 1;
var blPageSize   = 7;
var blSankeyDrill = null;
var blCashChart  = null;
var blYoyChart   = null;

function blSetHorizon(h) {
  blHorizon = h; blPage = 1;
  try { save(K.billsHorizon, h); } catch(e) {}
  renderBills();
}
function blSetTypeFilter(t) {
  blTypeFilter = t; blPage = 1;
  renderBills();
}
function blFilteredBills(scopeConfirmedOnly) {
  var list = BILLS.filter(function(b){ return scopeConfirmedOnly ? b.status === 'confirmed' : true; });
  if (blTypeFilter !== 'all') list = list.filter(function(b){ return b.billType === blTypeFilter; });
  return list;
}

// ══════════════════════════════════════════════════════════════
// MAIN RENDER
// ══════════════════════════════════════════════════════════════
function renderBills() {
  blEnsureBillsReady();
  blRenderReviewButton();
  blRenderKPIs();
  blRenderCashChart();
  blRenderSankey();
  blRenderYoyChart();
  blRenderFilters();
  blRenderTable();
  blRenderAnnualSpotlight();
  blRenderTimeline();
}

function blRenderReviewButton() {
  var btn = document.getElementById('bl-review-btn');
  var dot = document.getElementById('bl-review-dot');
  if (!btn || !dot) return;
  var pending = BILLS.filter(function(b){ return b.status === 'pending_review' || (b.status === 'confirmed' && b.pendingAmountUpdate); });
  if (pending.length) {
    btn.style.display = '';
    dot.textContent = pending.length;
    btn.classList.add('notif-pulse');
  } else {
    btn.style.display = 'none';
  }
}

// ── KPIs ─────────────────────────────────────────────────────
function blRenderKPIs() {
  var el = document.getElementById('bl-kpis');
  if (!el) return;
  var confirmed = BILLS.filter(function(b){ return b.status === 'confirmed'; });
  var due30 = 0, due30Count = 0;
  confirmed.forEach(function(b) {
    var occs = blProjectOccurrences(b, 30);
    if (occs.length) { due30 += Number(b.amount) * occs.length; due30Count++; }
  });
  var annualBills = confirmed.filter(function(b){ return b.isAnnual || b.frequency === 'annual'; });
  var annualTotal = annualBills.reduce(function(s,b){ return s + (Number(b.amount)||0); }, 0);
  var buffer = blTotalAnnualBuffer();
  el.innerHTML =
    '<div class="kpi"><div class="kpi-label">Due Next 30 Days</div>' +
    '<div class="kpi-value mono" style="color:var(--primary)">' + fmt(due30) + '</div>' +
    '<div class="kpi-sub">' + due30Count + ' bill' + (due30Count === 1 ? '' : 's') + ' confirmed</div></div>' +
    '<div class="kpi"><div class="kpi-label">Annual Buffer</div>' +
    '<div class="kpi-value mono" style="color:var(--purple)">' + fmt(buffer) + '<span style="font-size:.68rem;font-weight:400">/mo</span></div>' +
    '<div class="kpi-sub">to set aside now</div></div>' +
    '<div class="kpi"><div class="kpi-label">Annual Bills</div>' +
    '<div class="kpi-value mono" style="color:var(--warn)">' + fmt(annualTotal) + '</div>' +
    '<div class="kpi-sub">across ' + annualBills.length + ' bill' + (annualBills.length === 1 ? '' : 's') + '</div></div>';
}

function blRenderFilters() {
  ['30','90','365'].forEach(function(h) {
    var b = document.getElementById('bl-h-' + h);
    if (b) b.classList.toggle('active', Number(h) === blHorizon);
  });
  ['all','bill','subscription','direct_debit'].forEach(function(t) {
    var b = document.getElementById('bl-t-' + t);
    if (b) b.classList.toggle('active', t === blTypeFilter);
  });
}

function blToken(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || ''; }

function blBucketKey(dateStr) {
  if (blHorizon === 365) return dateStr.slice(0, 7);
  var d = new Date(dateStr + 'T00:00:00');
  var day = d.getDay();
  var diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}
function blBucketLabel(key) {
  if (blHorizon === 365) return new Date(key + '-02').toLocaleString('en-AU', { month:'short' });
  return new Date(key + 'T00:00:00').toLocaleString('en-AU', { day:'numeric', month:'short' });
}

// ── 4.1 Cash demand distribution chart ──────────────────────────
function blRenderCashChart() {
  var card = document.getElementById('bl-chart-card');
  var canvas = document.getElementById('bl-cash-chart');
  var legend = document.getElementById('bl-chart-legend');
  if (!card || !canvas) return;
  if (blCashChart) { blCashChart.destroy(); blCashChart = null; }

  var confirmed = blFilteredBills(true);
  if (!confirmed.length) { card.style.display = 'none'; return; }
  card.style.display = '';

  var bucketKeys = [];
  if (blHorizon === 365) {
    var d0 = new Date(); d0.setDate(1);
    for (var m = 0; m < 12; m++) {
      var dd = new Date(d0.getFullYear(), d0.getMonth() + m, 1);
      bucketKeys.push(dd.getFullYear() + '-' + String(dd.getMonth()+1).padStart(2,'0'));
    }
  } else {
    var weeks = Math.ceil(blHorizon / 7);
    var startKey = blBucketKey(today());
    var cur = startKey;
    for (var w = 0; w < weeks; w++) {
      bucketKeys.push(cur);
      cur = blAddDays(cur, 7);
    }
  }

  var buckets = {};
  bucketKeys.forEach(function(k){ buckets[k] = { total:0, hasAnnual:false, names:[] }; });
  confirmed.forEach(function(b) {
    var occs = blProjectOccurrences(b, blHorizon);
    occs.forEach(function(dateStr) {
      var key = blBucketKey(dateStr);
      if (!buckets[key]) return;
      buckets[key].total += Number(b.amount) || 0;
      if (b.isAnnual || b.frequency === 'annual') buckets[key].hasAnnual = true;
      if (buckets[key].names.indexOf(b.displayName) === -1) buckets[key].names.push(b.displayName);
    });
  });

  var maxTotal = 0, peakKey = null;
  bucketKeys.forEach(function(k){ if (buckets[k].total > maxTotal) { maxTotal = buckets[k].total; peakKey = k; } });

  var cardTok = blToken('--card3'), purpleTok = blToken('--purple'), primaryTok = blToken('--primary');
  var colors = bucketKeys.map(function(k) {
    if (k === peakKey && maxTotal > 0) return primaryTok;
    if (buckets[k].hasAnnual) return purpleTok;
    return cardTok;
  });
  var labels = bucketKeys.map(blBucketLabel);
  var data = bucketKeys.map(function(k){ return buckets[k].total; });
  var names = bucketKeys.map(function(k){ return buckets[k].names; });

  blCashChart = safeChart(canvas, {
    type: 'bar',
    data: { labels: labels, datasets: [{ data: data, backgroundColor: colors, borderRadius: 4, maxBarThickness: 34 }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: {
          label: function(c) {
            var billNames = names[c.dataIndex] || [];
            var lines = [' ' + fmt(c.parsed.y)];
            billNames.slice(0, 6).forEach(function(n){ lines.push(' • ' + n); });
            return lines;
          }
        }}
      },
      scales: {
        x: { grid: { display:false }, ticks: { color: blToken('--muted'), font: { size:10 } } },
        y: { grid: { color: blToken('--card3') }, ticks: { color: blToken('--muted'), font: { size:10 },
             callback: function(v){ return '$' + Math.round(v/1000) + 'k'; } } }
      }
    }
  });

  if (legend) {
    legend.innerHTML =
      '<div class="legend-item"><div class="legend-dot" style="background:var(--card3)"></div>Regular bills</div>' +
      '<div class="legend-item"><div class="legend-dot" style="background:var(--purple)"></div>Contains annual bill</div>' +
      '<div class="legend-item"><div class="legend-dot" style="background:var(--primary)"></div>Heaviest period</div>';
  }
}

// ── 4.6 Bill category flow (hand-rolled SVG, same technique as insights.js sankey) ──
var BL_SANKEY_PALETTE = [
  '#F0538A','#818CF8','#00C896','#F59E0B','#38BDF8',
  '#FB7185','#34D399','#FBBF24','#A78BFA','#22D3EE'
];
function blFreqMultiplier(freq) { return { weekly:52, monthly:12, quarterly:4, annual:1 }[freq] || 12; }
function blAnnualizedAmount(b) { return (Number(b.amount) || 0) * blFreqMultiplier(b.frequency); }

function blRenderSankey() {
  var el = document.getElementById('bl-sankey');
  if (!el) return;
  var confirmed = blFilteredBills(true);
  if (!confirmed.length) { el.innerHTML = '<div class="empty" style="min-height:120px;padding:20px"><div class="ei">📊</div><p style="font-size:.78rem">No confirmed bills yet.</p></div>'; return; }

  var nodes, srcLabel, srcAmt, backLink = '', drillHint = '';
  if (blSankeyDrill) {
    var inCat = confirmed.filter(function(b){ return (b.category || 'other') === blSankeyDrill; });
    var subTotals = {};
    inCat.forEach(function(b){ var s = b.subcategory || 'Other'; subTotals[s] = (subTotals[s]||0) + blAnnualizedAmount(b); });
    var catObj = LCATS.find(function(c){ return c.id === blSankeyDrill; });
    srcLabel = catObj ? (catObj.icon + ' ' + catObj.name) : blSankeyDrill;
    srcAmt = Object.keys(subTotals).reduce(function(s,k){ return s + subTotals[k]; }, 0);
    nodes = Object.keys(subTotals).sort(function(a,b2){ return subTotals[b2]-subTotals[a]; }).map(function(s,i) {
      return { label: s, amt: subTotals[s], color: BL_SANKEY_PALETTE[i % BL_SANKEY_PALETTE.length] };
    });
    backLink = '<div style="font-size:.7rem;color:var(--primary);cursor:pointer;margin-bottom:8px;font-weight:600" onclick="blSankeyDrill=null;blRenderSankey()">← Back to categories</div>';
  } else {
    var catTotals = {};
    confirmed.forEach(function(b){ var c = b.category || 'other'; catTotals[c] = (catTotals[c]||0) + blAnnualizedAmount(b); });
    srcLabel = 'Total Bills';
    srcAmt = Object.keys(catTotals).reduce(function(s,k){ return s + catTotals[k]; }, 0);
    nodes = Object.keys(catTotals).sort(function(a,b2){ return catTotals[b2]-catTotals[a]; }).map(function(c,i) {
      var cat = LCATS.find(function(x){ return x.id === c; });
      return { id: c, label: cat ? (cat.icon + ' ' + cat.name) : c, amt: catTotals[c], color: cat && cat.color ? cat.color : BL_SANKEY_PALETTE[i % BL_SANKEY_PALETTE.length] };
    });
    drillHint = '<div style="font-size:.6rem;color:var(--muted);margin-top:10px">Tap a category to explore subcategories →</div>';
  }
  if (!srcAmt) { el.innerHTML = '<div class="empty" style="min-height:120px;padding:20px"><div class="ei">📊</div><p style="font-size:.78rem">No confirmed bills yet.</p></div>'; return; }

  var W = 320, nodeW = 12, leftPad = 78, rightPad = 8, gap = 6, incomeY = 6;
  var MIN_H = 12, MAX_H = 26;
  var n = nodes.length;
  var maxAmt = nodes.reduce(function(mx,nd){ return Math.max(mx, nd.amt); }, 1);
  var scaleH = Math.min(MAX_H, Math.max(MIN_H, Math.floor(140 / n)));
  var curY = incomeY;
  nodes.forEach(function(nd) {
    nd.h = Math.max(MIN_H, Math.round((nd.amt / maxAmt) * scaleH));
    nd.y = curY;
    curY += nd.h + gap;
  });
  var H = Math.max(80, curY - gap + 10);
  var colX1 = leftPad, colX2 = W - rightPad - nodeW;

  var srcH = Math.min(curY - gap, H - 12);
  var paths = '', rects = '', labels = '';
  var lY = incomeY;
  nodes.forEach(function(nd, idx) {
    var frac = nd.amt / srcAmt;
    var flowH = Math.max(2, Math.round(srcH * frac));
    var srcY1 = lY, srcY2 = lY + flowH;
    var tgtY1 = nd.y, tgtY2 = nd.y + nd.h;
    var cx = Math.round((colX1 + nodeW + colX2) / 2);
    var clickAttr = blSankeyDrill ? '' : (' onclick="blSankeyDrill=\'' + nd.id + '\';blRenderSankey()" style="cursor:pointer"');
    paths += '<path d="M' + (colX1+nodeW) + ',' + srcY1 + ' C' + cx + ',' + srcY1 + ' ' + cx + ',' + tgtY1 + ' ' + colX2 + ',' + tgtY1
      + ' L' + colX2 + ',' + tgtY2 + ' C' + cx + ',' + tgtY2 + ' ' + cx + ',' + srcY2 + ' ' + (colX1+nodeW) + ',' + srcY2 + ' Z"'
      + ' fill="' + nd.color + '" opacity="0.32"/>';
    rects += '<rect x="' + colX2 + '" y="' + nd.y + '" width="' + nodeW + '" height="' + nd.h + '" rx="3" fill="' + nd.color + '"' + clickAttr + '/>';
    var labelY = nd.y + Math.round(nd.h/2) + 3;
    labels += '<text x="' + (colX2+nodeW+7) + '" y="' + labelY + '" font-size="9" fill="#d0cce8">' + esc(nd.label).slice(0,20) + '</text>';
    lY = srcY2;
  });
  var midY = incomeY + Math.round(srcH/2);
  var incSVG = '<rect x="0" y="' + incomeY + '" width="' + nodeW + '" height="' + srcH + '" rx="3" fill="' + blToken('--primary') + '"/>'
    + '<text x="' + (nodeW+6) + '" y="' + (midY-4) + '" font-size="9" fill="#d0cce8">' + esc(srcLabel).slice(0,16) + '</text>'
    + '<text x="' + (nodeW+6) + '" y="' + (midY+9) + '" font-size="9" font-weight="700" fill="' + blToken('--primary') + '">' + fmt(srcAmt) + '</text>';

  el.innerHTML = backLink
    + '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;display:block">' + paths + rects + incSVG + labels + '</svg>'
    + drillHint;
}

// ── 4.7 Year-on-year bill category comparison ────────────────────
function blMatchesBillKey(t, merchantKey) {
  if (t.type !== 'expense') return false;
  var raw = t.rawDescription || t.name || t.description || '';
  var pre = (typeof preprocessMerchantString === 'function') ? preprocessMerchantString(raw) : raw.toLowerCase();
  var canon = (typeof resolveAlias === 'function') ? resolveAlias(pre) : pre;
  var key = blResolveBillAlias(canon);
  return key === merchantKey;
}
function blYoyData() {
  var confirmed = blFilteredBills(true);
  var thisYear = new Date().getFullYear(), prevYear = thisYear - 1;
  var cutoff = blAddMonths(today(), -24);
  var byCat = {};
  var seenKeys = {};
  confirmed.forEach(function(b) {
    if (seenKeys[b.merchantKey]) return;
    seenKeys[b.merchantKey] = true;
    var cat = b.category || 'other';
    if (!byCat[cat]) byCat[cat] = { curr:0, prev:0, hasPrev:false };
    TX.forEach(function(t) {
      if (!t.date || t.date < cutoff) return;
      if (!blMatchesBillKey(t, b.merchantKey)) return;
      var yr = Number(t.date.slice(0,4));
      if (yr === thisYear) byCat[cat].curr += Number(t.amount) || 0;
      else if (yr === prevYear) { byCat[cat].prev += Number(t.amount) || 0; byCat[cat].hasPrev = true; }
    });
  });
  return byCat;
}
function blRenderYoyChart() {
  var canvas = document.getElementById('bl-yoy-chart');
  var deltasEl = document.getElementById('bl-yoy-deltas');
  var card = document.getElementById('bl-yoy-card');
  if (!canvas) return;
  if (blYoyChart) { blYoyChart.destroy(); blYoyChart = null; }
  var data = blYoyData();
  var cats = Object.keys(data);
  if (!cats.length) { if (card) card.style.display = 'none'; return; }
  if (card) card.style.display = '';

  var labels = cats.map(function(c){ var cat = LCATS.find(function(x){ return x.id===c; }); return cat ? cat.name : c; });
  var prevData = cats.map(function(c){ return data[c].hasPrev ? data[c].prev : null; });
  var currData = cats.map(function(c){ return data[c].curr; });
  var prevYear = new Date().getFullYear() - 1, thisYear = new Date().getFullYear();

  blYoyChart = safeChart(canvas, {
    type: 'bar',
    data: { labels: labels, datasets: [
      { label: String(prevYear), data: prevData, backgroundColor: 'rgba(232,69,122,.28)', borderColor: 'rgba(232,69,122,.7)', borderWidth: 1.5, borderRadius: 5 },
      { label: String(thisYear), data: currData, backgroundColor: 'rgba(232,69,122,.85)', borderColor: '#e8457a', borderWidth: 1.5, borderRadius: 5 }
    ]},
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { position:'bottom', labels: { color: blToken('--muted'), font:{size:10} } },
        tooltip: { callbacks: { label: function(c) {
          if (c.parsed.y === null) return ' ' + c.dataset.label + ': no data for prior year';
          return ' ' + c.dataset.label + ': ' + fmt(c.parsed.y);
        }}}
      },
      scales: {
        x: { grid: { display:false }, ticks: { color: blToken('--muted'), font:{size:10} } },
        y: { grid: { color: blToken('--card3') }, ticks: { color: blToken('--muted'), font:{size:10}, callback: function(v){ return '$'+Math.round(v); } } }
      }
    }
  });

  if (deltasEl) {
    deltasEl.innerHTML = cats.map(function(c, i) {
      var d = data[c];
      if (!d.hasPrev) return '';
      var delta = d.curr - d.prev;
      var pct = d.prev ? ((delta/d.prev)*100).toFixed(1) : '0.0';
      var up = delta > 0;
      var color = up ? 'var(--danger)' : 'var(--success)';
      var arrow = up ? '▲' : '▼';
      return '<div class="yoy-chip"><div class="yoy-chip-lbl">' + esc(labels[i]) + '</div>'
        + '<div class="yoy-chip-val" style="color:' + color + '">' + arrow + ' ' + Math.abs(pct) + '%</div></div>';
    }).join('');
  }
}

// ══════════════════════════════════════════════════════════════
// 4 / 7.1-7.3 — RECURRING PAYMENTS TABLE
// ══════════════════════════════════════════════════════════════
function blTableSearch(v) { blSearch = (v||'').toLowerCase(); blPage = 1; blRenderTable(); }
function blTableTypeSelect(v) { blSetTypeFilter(v); }
function blSetPage(p) { blPage = p; blRenderTable(); }

function blFreqAmountLabel(b) {
  return (BILL_FREQ_LABELS[b.frequency] || 'Monthly') + ' · ' + (b.amountType === 'variable' ? 'variable' : 'fixed');
}
function blDateLabel(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr + 'T00:00:00').toLocaleString('en-AU', { day:'numeric', month:'short' });
}

function blRenderTable() {
  var tbody = document.getElementById('bl-table-body');
  var meta = document.getElementById('bl-table-meta');
  var pag = document.getElementById('bl-pagination');
  if (!tbody) return;

  var all = BILLS.slice();
  var confirmedCount = all.filter(function(b){ return b.status === 'confirmed'; }).length;
  var pendingCount = all.filter(function(b){ return b.status === 'pending_review'; }).length;
  var dismissedCount = BILLS_DISMISSED.length;

  var list = all.filter(function(b){ return b.status === 'confirmed' || b.status === 'pending_review'; });
  if (blTypeFilter !== 'all') list = list.filter(function(b){ return b.billType === blTypeFilter; });
  if (blSearch) list = list.filter(function(b){ return (b.displayName||'').toLowerCase().indexOf(blSearch) !== -1; });
  list.sort(function(a,b){
    if (a.status !== b.status) return a.status === 'pending_review' ? -1 : 1;
    return (a.nextDueDate||'9999') < (b.nextDueDate||'9999') ? -1 : 1;
  });

  if (meta) meta.textContent = all.length + ' identified · ' + confirmedCount + ' confirmed · ' + pendingCount + ' pending review · ' + dismissedCount + ' dismissed';

  if (!list.length) {
    tbody.innerHTML = '';
    var emptyRow = document.getElementById('bl-table-empty');
    if (emptyRow) emptyRow.style.display = '';
    if (pag) pag.innerHTML = '';
    return;
  }
  var emptyRow2 = document.getElementById('bl-table-empty');
  if (emptyRow2) emptyRow2.style.display = 'none';

  var totalPages = Math.max(1, Math.ceil(list.length / blPageSize));
  if (blPage > totalPages) blPage = totalPages;
  var pageList = list.slice((blPage-1)*blPageSize, blPage*blPageSize);

  tbody.innerHTML = pageList.map(function(b) {
    var rowId = 'blrow_' + b.id;
    var pending = b.status === 'pending_review';
    var trCls = pending ? ' class="row-pending"' : '';
    var firstTdStyle = pending ? ' style="border-left:3px solid var(--warn);padding-left:15px"' : '';
    var typeCls = BILL_TYPE_CLASS[b.billType] || 'btype-dd';
    var typeLbl = BILL_TYPE_LABELS[b.billType] || 'Direct Debit';
    var conf = b.confidence === null || typeof b.confidence === 'undefined' ? null : Math.round(b.confidence*100);
    var confBarColor = pending ? 'var(--warn)' : 'var(--success)';
    var confLabel = conf === null ? '—' : (conf + '%');
    var ariaLabel = conf === null ? 'Manual entry' : ('Confidence: ' + conf + '%' + (pending ? ' — pending review' : ''));
    var actionCell = '<span style="font-size:.7rem;color:var(--muted)">—</span>';
    if (pending) {
      actionCell = '<button class="btn btn-primary btn-sm" onclick="blOpenReviewModal()" style="white-space:nowrap;font-size:.68rem;padding:5px 10px">Review →</button>';
    } else if (b.pendingAmountUpdate) {
      actionCell = '<span style="font-size:.68rem;color:var(--warn);font-weight:600;background:rgba(245,158,11,.1);padding:2px 7px;border-radius:99px;white-space:nowrap;cursor:pointer" onclick="blOpenReviewModal()">↑ Price change</span>';
    }
    return '<tr' + trCls + '>' +
      '<td style="padding:11px 18px' + (pending ? ';border-left:3px solid var(--warn);padding-left:15px' : '') + '">' +
        '<div style="display:flex;align-items:center;gap:9px">' +
        '<div style="width:30px;height:30px;border-radius:7px;background:var(--card2);display:flex;align-items:center;justify-content:center;font-size:.9rem;flex-shrink:0">' + esc(b.icon||'🧾') + '</div>' +
        '<div><div style="font-weight:600">' + esc(b.displayName||'Bill') + '</div>' +
        '<div style="font-size:.68rem;color:var(--muted)">' + esc(blFreqAmountLabel(b)) + '</div></div></div></td>' +
      '<td style="padding:11px 12px;position:relative">' +
        '<button class="btype-btn ' + typeCls + '" onclick="blToggleTypeMenu(\'' + rowId + '\')">' + typeLbl + '</button>' +
        '<div class="type-dropdown" id="' + rowId + '_dd">' +
        '<button class="type-option" onclick="blSelectType(\'' + b.id + '\',\'bill\',\'' + rowId + '\')">Bill</button>' +
        '<button class="type-option" onclick="blSelectType(\'' + b.id + '\',\'subscription\',\'' + rowId + '\')">Subscription</button>' +
        '<button class="type-option" onclick="blSelectType(\'' + b.id + '\',\'direct_debit\',\'' + rowId + '\')">Direct Debit</button>' +
        '</div><div style="font-size:.7rem;color:var(--muted);margin-top:2px">' + esc(blSubcatOrCatLabel(b)) + '</div></td>' +
      '<td style="padding:11px 12px;font-size:.76rem;color:var(--muted)">' + esc(b.account || '—') + '</td>' +
      '<td class="mono" style="padding:11px 12px;text-align:right;font-weight:600">' + (b.amountType === 'variable' ? '~' : '') + fmt(b.amount) + '</td>' +
      '<td style="padding:11px 12px;font-size:.76rem" class="mono">' + (pending ? '<span style="color:var(--muted)">—</span>' : blDateLabel(b.nextDueDate)) + '</td>' +
      '<td style="padding:11px 12px;text-align:center">' +
        (conf === null ? '<span style="font-size:.7rem;color:var(--muted)">—</span>' :
        '<div style="display:inline-flex;flex-direction:column;align-items:center;gap:3px">' +
        '<div role="progressbar" aria-valuenow="' + conf + '" aria-valuemin="0" aria-valuemax="100" aria-label="' + esc(ariaLabel) + '" style="width:48px;height:5px;background:var(--card3);border-radius:99px;overflow:hidden">' +
        '<div style="width:' + conf + '%;height:100%;background:' + confBarColor + ';border-radius:99px"></div></div>' +
        '<div style="font-size:.62rem;color:' + confBarColor + ';font-weight:600" aria-hidden="true">' + confLabel + '</div></div>') + '</td>' +
      '<td style="padding:11px 18px 11px 12px">' + actionCell + '</td>' +
      '</tr>';
  }).join('');

  if (pag) {
    if (totalPages <= 1) { pag.innerHTML = ''; }
    else {
      var showing = 'Showing ' + pageList.length + ' of ' + list.length + ' · Page ' + blPage + ' of ' + totalPages;
      var btns = '<button style="width:30px;height:30px;border-radius:7px;border:1.5px solid var(--border);background:transparent;color:var(--muted);cursor:pointer" onclick="blSetPage(' + Math.max(1,blPage-1) + ')" ' + (blPage===1?'disabled':'') + '>‹</button>';
      for (var p = 1; p <= totalPages; p++) {
        var active = p === blPage;
        btns += '<button style="width:30px;height:30px;border-radius:7px;border:1.5px solid ' + (active?'var(--primary)':'var(--border)') + ';background:' + (active?'var(--primary)':'transparent') + ';color:' + (active?'#fff':'var(--muted)') + ';font-weight:' + (active?'700':'400') + ';cursor:pointer" onclick="blSetPage(' + p + ')">' + p + '</button>';
      }
      btns += '<button style="width:30px;height:30px;border-radius:7px;border:1.5px solid var(--border);background:transparent;color:var(--muted);cursor:pointer" onclick="blSetPage(' + Math.min(totalPages,blPage+1) + ')" ' + (blPage===totalPages?'disabled':'') + '>›</button>';
      pag.innerHTML = '<div style="font-size:.72rem;color:var(--muted)">' + showing + '</div><div style="display:flex;gap:6px">' + btns + '</div>';
    }
  }
}
function blSubcatOrCatLabel(b) {
  if (b.subcategory) return b.subcategory;
  var cat = LCATS.find(function(c){ return c.id === b.category; });
  return cat ? cat.name : (b.category || '');
}

function blToggleTypeMenu(rowId) {
  var dd = document.getElementById(rowId + '_dd');
  if (!dd) return;
  var isOpen = dd.classList.contains('open');
  document.querySelectorAll('.type-dropdown.open').forEach(function(el){ el.classList.remove('open'); });
  if (!isOpen) dd.classList.add('open');
}
function blSelectType(billId, type, rowId) {
  var b = BILLS.find(function(x){ return x.id === billId; });
  if (!b) return;
  b.billType = type; b._userSetType = true;
  try { save(K.bills, BILLS); } catch(e) {}
  var dd = document.getElementById(rowId + '_dd');
  if (dd) {
    var btn = dd.previousElementSibling;
    if (btn) { btn.textContent = BILL_TYPE_LABELS[type]; btn.className = 'btype-btn ' + BILL_TYPE_CLASS[type]; }
    dd.classList.remove('open');
  }
  toast((b.displayName || 'Bill') + ' → ' + BILL_TYPE_LABELS[type]);
  blRenderCashChart(); blRenderSankey(); blRenderYoyChart(); blRenderTimeline();
}
document.addEventListener('click', function(e) {
  if (!e.target.closest('.btype-btn') && !e.target.closest('.type-dropdown')) {
    document.querySelectorAll('.type-dropdown.open').forEach(function(el){ el.classList.remove('open'); });
  }
});

// ══════════════════════════════════════════════════════════════
// 4.3 / 7.4 — NEEDS REVIEW MODAL
// ══════════════════════════════════════════════════════════════
function blOpenReviewModal() {
  blRenderReviewModal();
  var m = document.getElementById('bill-review-modal');
  if (m) m.classList.add('open');
}
function blCloseReviewModal() {
  var m = document.getElementById('bill-review-modal');
  if (m) m.classList.remove('open');
}
function blRenderReviewModal() {
  var el = document.getElementById('bl-review-list');
  var sub = document.getElementById('bl-review-sub');
  if (!el) return;
  var newDetections = BILLS.filter(function(b){ return b.status === 'pending_review'; });
  var priceChanges = BILLS.filter(function(b){ return b.status === 'confirmed' && b.pendingAmountUpdate; });
  var total = newDetections.length + priceChanges.length;
  if (sub) sub.textContent = total ? (total + ' bill' + (total===1?' needs':'s need') + ' your review — confirm to add, or dismiss permanently.') : 'Nothing needs review right now.';
  if (!total) { el.innerHTML = '<div class="empty"><div class="ei">✅</div><p>All caught up!</p></div>'; return; }

  var html = '';
  newDetections.forEach(function(b) {
    var rowId = 'rv_' + b.id;
    var typeCls = BILL_TYPE_CLASS[b.billType] || 'btype-dd';
    var typeLbl = BILL_TYPE_LABELS[b.billType] || 'Direct Debit';
    var occText = Math.round((b.confidence||0)*100) + '%';
    html += '<div class="review-row" id="' + rowId + '">' +
      '<div class="review-icon">' + esc(b.icon||'🧾') + '</div>' +
      '<div class="review-main">' +
      '<div class="review-kind review-kind-new">✦ New detection</div>' +
      '<div class="review-name">' + esc(b.displayName||'Bill') + ' <span class="badge ' + typeCls + '">' + typeLbl + '</span></div>' +
      '<div class="review-meta">' + esc(BILL_FREQ_LABELS[b.frequency]||'Monthly') + ' · ~' + fmt(b.amount) + ' · confidence ' + occText + '</div>' +
      '</div>' +
      '<div class="review-actions">' +
      '<div class="dismiss-default" style="display:flex;gap:5px">' +
      '<button class="btn-danger-ghost" onclick="blShowDismissConfirm(\'' + rowId + '\')">Dismiss</button>' +
      '<button class="btn btn-primary btn-sm" onclick="blConfirmDetection(\'' + b.id + '\')">Confirm</button>' +
      '</div>' +
      '<div class="dismiss-confirm" id="' + rowId + '_dc">' +
      '<div style="font-size:.7rem;color:var(--danger);font-weight:600;white-space:nowrap">Dismiss permanently?</div>' +
      '<div style="display:flex;gap:5px">' +
      '<button class="btn btn-ghost btn-sm" onclick="blCancelDismiss(\'' + rowId + '\')">Cancel</button>' +
      '<button class="btn-danger-ghost" onclick="blDismissDetection(\'' + b.id + '\',\'' + rowId + '\')">Yes, dismiss</button>' +
      '</div></div>' +
      '</div></div>';
  });
  priceChanges.forEach(function(b) {
    var rowId = 'rv_' + b.id;
    var typeCls = BILL_TYPE_CLASS[b.billType] || 'btype-dd';
    var typeLbl = BILL_TYPE_LABELS[b.billType] || 'Direct Debit';
    var oldAmt = b.amount, newAmt = b.pendingAmountUpdate.newAmount;
    var pct = oldAmt ? Math.abs(((newAmt-oldAmt)/oldAmt)*100).toFixed(1) : '0.0';
    var dir = newAmt > oldAmt ? 'increase' : 'decrease';
    html += '<div class="review-row" id="' + rowId + '">' +
      '<div class="review-icon">' + esc(b.icon||'🧾') + '</div>' +
      '<div class="review-main">' +
      '<div class="review-kind review-kind-price">↑ Price change detected</div>' +
      '<div class="review-name">' + esc(b.displayName||'Bill') + ' <span class="badge ' + typeCls + '">' + typeLbl + '</span></div>' +
      '<div class="review-meta">Was ' + fmt(oldAmt) + ' · Now ' + fmt(newAmt) + ' · ' + pct + '% ' + dir + '</div>' +
      '</div>' +
      '<div class="review-actions"><div style="display:flex;gap:5px">' +
      '<button class="btn btn-ghost btn-sm" onclick="blKeepOldAmount(\'' + b.id + '\')">Keep old amount</button>' +
      '<button class="btn btn-primary btn-sm" onclick="blAcceptNewAmount(\'' + b.id + '\')">Accept ' + fmt(newAmt) + '</button>' +
      '</div></div></div>';
  });
  el.innerHTML = html;
}
function blShowDismissConfirm(rowId) {
  var row = document.getElementById(rowId);
  if (!row) return;
  row.querySelector('.dismiss-default').style.display = 'none';
  var dc = document.getElementById(rowId + '_dc');
  if (dc) dc.style.display = 'flex';
}
function blCancelDismiss(rowId) {
  var row = document.getElementById(rowId);
  if (!row) return;
  row.querySelector('.dismiss-default').style.display = 'flex';
  var dc = document.getElementById(rowId + '_dc');
  if (dc) dc.style.display = 'none';
}
function blConfirmDetection(billId) {
  var b = BILLS.find(function(x){ return x.id === billId; });
  if (!b) return;
  b.status = 'confirmed';
  blRecordBillAlias(b.merchantKey, b._rawSample || b.displayName);
  save(K.bills, BILLS);
  toast('✅ ' + (b.displayName||'Bill') + ' confirmed');
  blRenderReviewModal(); renderBills();
}
function blDismissDetection(billId, rowId) {
  var b = BILLS.find(function(x){ return x.id === billId; });
  if (!b) return;
  if (BILLS_DISMISSED.indexOf(b.merchantKey) === -1) BILLS_DISMISSED.push(b.merchantKey);
  BILLS = BILLS.filter(function(x){ return x.id !== billId; });
  save(K.bills, BILLS); save(K.billsDismissed, BILLS_DISMISSED);
  toast('🗑️ ' + (b.displayName||'Bill') + ' dismissed');
  blRenderReviewModal(); renderBills();
}
function blKeepOldAmount(billId) {
  var b = BILLS.find(function(x){ return x.id === billId; });
  if (!b) return;
  b.pendingAmountUpdate = null; b.amountTrend = 'stable';
  save(K.bills, BILLS);
  toast('Kept previous amount for ' + (b.displayName||'bill'));
  blRenderReviewModal(); renderBills();
}
function blAcceptNewAmount(billId) {
  var b = BILLS.find(function(x){ return x.id === billId; });
  if (!b) return;
  b.amount = b.pendingAmountUpdate.newAmount;
  b.pendingAmountUpdate = null; b.amountTrend = 'stable';
  save(K.bills, BILLS);
  toast('✅ Updated ' + (b.displayName||'bill') + ' to ' + fmt(b.amount));
  blRenderReviewModal(); renderBills();
}

// ══════════════════════════════════════════════════════════════
// 4.4 — ANNUAL BILLS SPOTLIGHT
// ══════════════════════════════════════════════════════════════
function blRenderAnnualSpotlight() {
  var card = document.getElementById('bl-annual-card');
  var el = document.getElementById('bl-annual-list');
  if (!card || !el) return;
  var annual = blFilteredBills(true).filter(function(b){ return b.isAnnual || b.frequency === 'annual'; })
    .sort(function(a,b){ return (a.nextDueDate||'') < (b.nextDueDate||'') ? -1 : 1; });
  if (!annual.length) { card.style.display = 'none'; return; }
  card.style.display = '';
  el.innerHTML = annual.map(function(b) {
    var days = blDaysBetween(today(), b.nextDueDate);
    var monthsElapsed = Math.max(0, 12 - Math.max(1, blMonthsBetween(today(), b.nextDueDate)));
    var pct = Math.max(0, Math.min(100, Math.round((monthsElapsed/12)*100)));
    var typeCls = BILL_TYPE_CLASS[b.billType] || 'btype-dd';
    var typeLbl = BILL_TYPE_LABELS[b.billType] || 'Direct Debit';
    var priceBadge = b.pendingAmountUpdate ? ' <span class="badge" style="background:rgba(245,158,11,.15);color:var(--warn);cursor:pointer" onclick="blOpenReviewModal()">↑ price increase detected</span>' : '';
    return '<div class="annual-item">' +
      '<div style="flex:1"><div style="font-weight:600;font-size:.84rem">' + esc(b.displayName||'Bill') + '</div>' +
      '<div style="font-size:.7rem;color:var(--muted)">Due ' + blDateLabel(b.nextDueDate) + ' · ' + days + ' days · <span class="badge ' + typeCls + '">' + typeLbl + '</span>' + priceBadge + '</div>' +
      '<div class="buffer-bar" style="width:160px;margin-top:5px"><div class="buffer-fill" style="width:' + pct + '%"></div></div></div>' +
      '<div class="mono" style="font-size:.86rem;font-weight:600;margin-left:12px">' + fmt(b.amount) + '</div></div>';
  }).join('');
}

// ══════════════════════════════════════════════════════════════
// 4.5 — UPCOMING TIMELINE
// ══════════════════════════════════════════════════════════════
function blRenderTimeline() {
  var card = document.getElementById('bl-timeline-card');
  var el = document.getElementById('bl-timeline-list');
  var label = document.getElementById('bl-timeline-label');
  if (!card || !el) return;
  var confirmed = blFilteredBills(true);
  if (label) label.textContent = 'Upcoming — Next ' + (blHorizon === 365 ? '12 Months' : blHorizon + ' Days');
  if (!confirmed.length) { el.innerHTML = '<div class="empty"><div class="ei">🧾</div><p>No confirmed bills yet.</p></div>'; return; }

  var rows = [];
  confirmed.forEach(function(b) {
    var occs = blProjectOccurrences(b, blHorizon);
    if (occs.length) rows.push({ bill: b, date: occs[0] });
  });
  rows.sort(function(a,b){ return a.date < b.date ? -1 : 1; });

  if (!rows.length) { el.innerHTML = '<div class="empty"><div class="ei">🧾</div><p>Nothing due in this window.</p></div>'; return; }

  el.innerHTML = rows.map(function(r) {
    var b = r.bill;
    var typeCls = BILL_TYPE_CLASS[b.billType] || 'btype-dd';
    var typeLbl = BILL_TYPE_LABELS[b.billType] || 'Direct Debit';
    var dueSoon = blDaysBetween(today(), r.date) <= 7;
    var badges = ' <span class="badge ' + typeCls + '" style="margin-left:5px">' + typeLbl + '</span>';
    if (b.isAnnual || b.frequency === 'annual') badges += ' <span class="badge b-annual" style="margin-left:3px">Annual</span>';
    if (dueSoon) badges += ' <span class="badge b-soon" style="margin-left:3px">Due Soon</span>';
    return '<div class="bill-row">' +
      '<div class="bill-icon">' + esc(b.icon||'🧾') + '</div>' +
      '<div class="bill-main"><div class="bill-name">' + esc(b.displayName||'Bill') + badges + '</div>' +
      '<div class="bill-meta">' + blDateLabel(r.date) + ' · ' + esc(BILL_FREQ_LABELS[b.frequency]||'Monthly') + '</div></div>' +
      '<div class="bill-amt mono">' + (b.amountType === 'variable' ? '~' : '') + fmt(b.amount) + '</div></div>';
  }).join('');
}

// ══════════════════════════════════════════════════════════════
// 5 — MANUAL / FUTURE-DATED BILL ENTRY MODAL
// ══════════════════════════════════════════════════════════════
function blOpenAddModal() {
  var form = document.getElementById('bill-add-form');
  if (form) form.reset();
  blPopulateBillCatSelect();
  var m = document.getElementById('bill-modal');
  if (m) m.classList.add('open');
}
function blCloseAddModal() {
  var m = document.getElementById('bill-modal');
  if (m) m.classList.remove('open');
}
function blPopulateBillCatSelect() {
  var catSel = document.getElementById('bill-cat');
  if (!catSel) return;
  var filtered = LCATS.filter(function(c){ return !c.type || c.type === 'both' || c.type === 'expense'; });
  catSel.innerHTML = filtered.map(function(c){ return '<option value="' + c.id + '">' + c.icon + ' ' + c.name + '</option>'; }).join('');
  blRefreshBillSubcatSelect();
}
function blRefreshBillSubcatSelect() {
  var catSel = document.getElementById('bill-cat');
  var subSel = document.getElementById('bill-subcat');
  if (!catSel || !subSel) return;
  var subs = getSubcats(catSel.value);
  subSel.innerHTML = '<option value="">No subcategory</option>' + subs.map(function(s){ return '<option value="' + s + '">' + s + '</option>'; }).join('');
}
function blSaveManualBill() {
  var name = (document.getElementById('bill-name-input').value || '').trim();
  var catId = document.getElementById('bill-cat').value;
  var subcat = document.getElementById('bill-subcat').value;
  var amount = parseFloat(document.getElementById('bill-amount-input').value);
  var frequency = document.getElementById('bill-frequency-input').value || 'monthly';
  var nextDue = document.getElementById('bill-due-input').value;
  var billType = document.getElementById('bill-type-input').value || 'bill';
  if (!name || !amount || amount <= 0 || !nextDue) { toast('⚠️ Fill in name, amount and due date'); return; }

  var merchantKey = (typeof preprocessMerchantString === 'function' ? preprocessMerchantString(name) : name.toLowerCase()) || name.toLowerCase();
  merchantKey = (typeof resolveAlias === 'function') ? resolveAlias(merchantKey) : merchantKey;

  var existing = BILLS.find(function(b){ return b.merchantKey === merchantKey; });
  if (existing) { toast('⚠️ A bill matching "' + name + '" already exists'); return; }

  BILLS.push({
    id: 'bd_manual_' + Date.now(),
    merchantKey: merchantKey, displayName: name,
    icon: blPickIcon(merchantKey, catId, subcat, billType),
    category: catId, subcategory: subcat, account: '',
    billType: billType, frequency: frequency,
    amountType: 'fixed', amount: amount, amountTrend: 'stable', pendingAmountUpdate: null,
    nextDueDate: nextDue, lastSeenDate: '', confidence: null,
    source: 'manual', status: 'confirmed', isAnnual: frequency === 'annual', _userSetType: true
  });
  try { save(K.bills, BILLS); } catch(e) { toast('⚠️ Could not save'); return; }
  blCloseAddModal();
  renderBills();
  toast('✅ ' + name + ' added');
  if (typeof qsCheckAndAutoComplete === 'function') qsCheckAndAutoComplete();
}
