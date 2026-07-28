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
  if (/insurance|insur|bupa|medibank|nrma|allianz|ahm|hcf|nib/.test(n) || cat === 'insurance' || cat === 'insurance_utilities') return 'heart';
  if (/phone|mobile|telstra|optus|vodafone|amaysim|boost/.test(n) || cat === 'phone' || cat === 'mobile') return 'device-mobile';
  if (/electricity|energy|gas|power|agl|origin|alinta|ausgrid/.test(n) || cat === 'utilities') return 'bulb';
  if (/childcare|kindy|kindergarten|daycare|goodstart|c&k/.test(n) || cat === 'childcare' || cat === 'children') return 'baby-carriage';
  if (/internet|broadband|iinet|aussie|tpg|superloop/.test(n) || cat === 'internet') return 'antenna';
  if (/strata|body corporate|deft/.test(n) || cat === 'home') return 'home';
  if (/netflix|stan|binge|disney|kayo|foxtel|paramount/.test(n) || cat === 'entertainment') return 'movie';
  return 'receipt';
}
function blPickIcon(key, catId, subcat, billType) {
  var icon = billSuggestIcon(key, catId);
  if (icon !== 'receipt') return icon;
  if (billType === 'subscription' || /streaming/i.test(subcat||'')) return 'movie';
  return 'receipt';
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
        // A future-dated due date the user typed (manual bill, or a detected bill
        // they've edited) is authoritative — don't overwrite it with the projection.
        var keepDue = (existing.source === 'manual' || existing._userEdited) && existing.nextDueDate > today();
        existing.nextDueDate = keepDue ? existing.nextDueDate : c.nextDueDate;
        if (existing.confidence !== null) existing.confidence = c.confidence;
        // Once a user has hand-edited a bill, their figures are the source of truth —
        // don't nag them with auto price-change prompts against their own number.
        if (!existing._userEdited && c.amount && existing.amount && Math.abs(c.amount - existing.amount) / existing.amount > 0.05 && !existing.pendingAmountUpdate) {
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
        merchantKey: mkey, displayName: name, icon: legacyIconToKey(b.icon || 'receipt'),
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
var blTypeFilter = 'all'; // all | bill | subscription | direct_debit
var blSearch     = '';
var blPage       = 1;
var blPageSize   = 15;
var blSankeyDrill = null;
var blCashChart  = null;
var blYoyChart   = null;
var blTab        = 'overview'; // overview | list | calendar | subs
var blCalRef     = (function(){ var d = new Date(); return { y:d.getFullYear(), m:d.getMonth() }; })();
var _blNotifiedThisSession = false;

// ── Chart period ──────────────────────────────────────────────
// Drives the three overview charts (Cash Demand, Bill Category Flow, Year on
// Year) + the Upcoming list. Either a rolling window from today, or an absolute
// month / year — mirroring the month filter on the Transactions page.
function blLoadPeriod() {
  var v = load(K.billsHorizon);
  if (v && typeof v === 'object' && v.mode) return v;
  if (typeof v === 'number') return { mode:'rolling', days:v };
  return { mode:'rolling', days:365 };
}
var blPeriod = blLoadPeriod();
function blSavePeriod() { try { save(K.billsHorizon, blPeriod); } catch(e) {} }
function blSetRolling(days) { blPeriod = { mode:'rolling', days:days }; blSavePeriod(); blRenderOverview(); }
function blSetPeriodMonth(ym) { if (!ym) { blSetRolling(365); return; } blPeriod = { mode:'month', ym:ym }; blSavePeriod(); blRenderOverview(); }
function blSetPeriodYear(y) { if (!y) { blSetRolling(365); return; } blPeriod = { mode:'year', y:String(y) }; blSavePeriod(); blRenderOverview(); }
function blClearPeriod() { blSetRolling(365); }
function blPeriodRange() {
  var p = blPeriod;
  if (p.mode === 'month') {
    var yy = Number(p.ym.slice(0,4)), mm = Number(p.ym.slice(5,7)) - 1;
    var last = new Date(yy, mm+1, 0).getDate();
    return { start:p.ym+'-01', end:p.ym+'-'+String(last).padStart(2,'0'), bucket:'week',
             label:new Date(p.ym+'-02').toLocaleString('en-AU', {month:'long', year:'numeric'}) };
  }
  if (p.mode === 'year') {
    return { start:p.y+'-01-01', end:p.y+'-12-31', bucket:'month', label:String(p.y) };
  }
  var days = p.days || 365;
  return { start:today(), end:blAddDays(today(), days), bucket:(days > 92 ? 'month' : 'week'),
           label:(days === 30 ? 'Next 30 days' : days === 90 ? 'Next 90 days' : 'Next 12 months') };
}
function blMondayOf(dateStr) {
  var d = new Date(dateStr + 'T00:00:00');
  var day = d.getDay();
  d.setDate(d.getDate() + ((day === 0 ? -6 : 1) - day));
  return d.toISOString().slice(0, 10);
}
// Amount of a bill occurring within the selected period (for the sankey).
function blPeriodAmount(b) {
  var R = blPeriodRange(), s = 0;
  blOccurrencesInRange(b, R.start, R.end).forEach(function(ds){ s += blOccurrenceAmount(b, ds); });
  return s;
}
function blOverviewEmptyHtml() {
  return '<div class="card" style="text-align:center;padding:40px 22px">'
    + '<div class="ei" style="font-size:2rem;margin-bottom:10px;color:var(--muted)">' + ICON('receipt') + '</div>'
    + '<div style="font-family:var(--font-display);font-size:1.15rem;font-weight:700;margin-bottom:6px">No bills yet</div>'
    + '<div class="bl-muted" style="font-size:.82rem;max-width:440px;margin:0 auto 18px;line-height:1.5">Kelda finds recurring bills and subscriptions automatically from your transactions. Import or add some transactions, or add a bill manually to get started.</div>'
    + '<button class="btn btn-primary btn-sm" onclick="blOpenAddModal()">＋ Add your first bill</button>'
    + '</div>';
}
function blRenderOverview() {
  var body = document.getElementById('bl-overview-body');
  var emptyEl = document.getElementById('bl-overview-empty');
  var hasBills = BILLS.some(function(b){ return b.status === 'confirmed' || b.status === 'pending_review'; });
  if (emptyEl && body) {
    if (!hasBills) {
      emptyEl.innerHTML = blOverviewEmptyHtml();
      emptyEl.style.display = '';
      body.style.display = 'none';
      return;
    }
    emptyEl.style.display = 'none';
    body.style.display = '';
  }
  blRenderPeriodControls();
  blRenderCashChart();
  blRenderSankey();
  blRenderYoyChart();
}
function blRenderPeriodControls() {
  var p = blPeriod;
  ['30','90','365'].forEach(function(dd){
    var b = document.getElementById('bl-p-' + dd);
    if (b) b.classList.toggle('active', p.mode === 'rolling' && (p.days||365) === Number(dd));
  });
  var msel = document.getElementById('bl-period-month');
  if (msel) {
    var months = [], base = new Date(); base.setDate(1);
    for (var i = 12; i >= -12; i--) { var dm = new Date(base.getFullYear(), base.getMonth() - i, 1); months.push(dm.getFullYear()+'-'+String(dm.getMonth()+1).padStart(2,'0')); }
    months = months.filter(function(m,ix){ return months.indexOf(m) === ix; }).sort().reverse();
    msel.innerHTML = '<option value="">Month…</option>' + months.map(function(m){
      return '<option value="'+m+'"'+(p.mode==='month'&&p.ym===m?' selected':'')+'>'+new Date(m+'-02').toLocaleString('en-AU',{month:'short',year:'numeric'})+'</option>';
    }).join('');
    msel.classList.toggle('on', p.mode === 'month');
  }
  var ysel = document.getElementById('bl-period-year');
  if (ysel) {
    var yNow = new Date().getFullYear(), years = [yNow+1, yNow, yNow-1, yNow-2];
    ysel.innerHTML = '<option value="">Year…</option>' + years.map(function(y){
      return '<option value="'+y+'"'+(p.mode==='year'&&p.y===String(y)?' selected':'')+'>'+y+'</option>';
    }).join('');
    ysel.classList.toggle('on', p.mode === 'year');
  }
  var clr = document.getElementById('bl-clear-period');
  if (clr) clr.style.display = (p.mode === 'rolling') ? 'none' : '';
}
function blSetTypeFilter(t) {
  blTypeFilter = t; blPage = 1;
  renderBills();
}
// Confirmed bills, ignoring the list-tab type filter — overview analytics
// should always show the whole picture.
function blConfirmed() { return BILLS.filter(function(b){ return b.status === 'confirmed'; }); }
function blFilteredBills(scopeConfirmedOnly) {
  var list = BILLS.filter(function(b){ return scopeConfirmedOnly ? b.status === 'confirmed' : true; });
  if (blTypeFilter !== 'all') list = list.filter(function(b){ return b.billType === blTypeFilter; });
  return list;
}

function blSetTab(t) {
  blTab = t;
  ['overview','list','calendar','subs'].forEach(function(k){
    var panel = document.getElementById('bl-panel-' + k);
    var tab = document.getElementById('bl-tab-' + k);
    if (panel) panel.style.display = (k === t) ? '' : 'none';
    if (tab) { tab.classList.toggle('active', k === t); tab.setAttribute('aria-selected', k === t ? 'true' : 'false'); }
  });
  blRenderTabPanel();
}

// ══════════════════════════════════════════════════════════════
// MAIN RENDER
// ══════════════════════════════════════════════════════════════
function renderBills() {
  blEnsureBillsReady();
  blRenderReviewButton();
  blRenderDueSoonBanner();
  blRenderTabPanel();
}

function blRenderTabPanel() {
  if (blTab === 'overview') {
    blRenderKPIs();
    blRenderOverview();
    blRenderAnnualSpotlight();
  } else if (blTab === 'list') {
    blRenderFilters();
    blRenderTable();
    blRenderDismissedBar();
  } else if (blTab === 'calendar') {
    blRenderCalendar();
  } else if (blTab === 'subs') {
    blRenderSubscriptions();
  }
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
// Normalise every frequency to a monthly figure so the total is comparable.
function blMonthlyEquivalent(b) { return (Number(b.amount) || 0) * blFreqMultiplier(b.frequency) / 12; }
function blMoneyShort(v) {
  v = Math.abs(v);
  if (v >= 1000) return '$' + (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1) + 'k';
  return '$' + Math.round(v);
}
function blRenderKPIs() {
  var el = document.getElementById('bl-kpis');
  if (!el) return;
  var confirmed = blConfirmed();
  var due30 = 0, due30Count = 0;
  confirmed.forEach(function(b) {
    var occs = blProjectOccurrences(b, 30);
    if (occs.length) { due30 += Number(b.amount) * occs.length; due30Count++; }
  });
  var monthly = confirmed.reduce(function(s,b){ return s + blMonthlyEquivalent(b); }, 0);
  var annualBills = confirmed.filter(function(b){ return b.isAnnual || b.frequency === 'annual'; });
  var annualTotal = annualBills.reduce(function(s,b){ return s + (Number(b.amount)||0); }, 0);
  var buffer = blTotalAnnualBuffer();
  el.innerHTML =
    '<div class="kpi"><div class="kpi-label">Monthly Commitment</div>' +
    '<div class="kpi-value mono" style="color:var(--primary)">' + fmt(monthly) + '<span style="font-size:.68rem;font-weight:400">/mo</span></div>' +
    '<div class="kpi-sub">' + confirmed.length + ' recurring payment' + (confirmed.length === 1 ? '' : 's') + '</div></div>' +
    '<div class="kpi"><div class="kpi-label">Due Next 30 Days</div>' +
    '<div class="kpi-value mono">' + fmt(due30) + '</div>' +
    '<div class="kpi-sub">' + due30Count + ' bill' + (due30Count === 1 ? '' : 's') + ' due</div></div>' +
    '<div class="kpi"><div class="kpi-label">Annual Buffer</div>' +
    '<div class="kpi-value mono" style="color:var(--purple)">' + fmt(buffer) + '<span style="font-size:.68rem;font-weight:400">/mo</span></div>' +
    (annualBills.length ? '<button class="kpi-cta" onclick="blCreateBufferGoal()">' + ICON('target') + ' Set aside</button>' : '<div class="kpi-sub">to set aside now</div>') + '</div>' +
    '<div class="kpi"><div class="kpi-label">Annual Bills</div>' +
    '<div class="kpi-value mono">' + fmt(annualTotal) + '</div>' +
    '<div class="kpi-sub">across ' + annualBills.length + ' bill' + (annualBills.length === 1 ? '' : 's') + '</div></div>';
}

function blRenderFilters() {
  ['all','bill','subscription','direct_debit'].forEach(function(t) {
    var b = document.getElementById('bl-t-' + t);
    if (b) b.classList.toggle('active', t === blTypeFilter);
  });
}

function blToken(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || ''; }

// ── 4.1 Cash demand distribution chart ──────────────────────────
function blRenderCashChart() {
  var card = document.getElementById('bl-chart-card');
  var canvas = document.getElementById('bl-cash-chart');
  var legend = document.getElementById('bl-chart-legend');
  var sub = document.getElementById('bl-cash-sub');
  if (!card || !canvas) return;
  if (blCashChart) { blCashChart.destroy(); blCashChart = null; }

  var confirmed = blConfirmed();
  if (!confirmed.length) { card.style.display = 'none'; return; }
  card.style.display = '';
  var R = blPeriodRange();
  if (sub) sub.textContent = R.label + ' · projected';
  var monthly = R.bucket === 'month';

  var bucketKeys = [];
  if (monthly) {
    var s0 = new Date(R.start + 'T00:00:00'); s0.setDate(1);
    var e0 = new Date(R.end + 'T00:00:00');
    var curM = new Date(s0.getFullYear(), s0.getMonth(), 1);
    while (curM <= e0) { bucketKeys.push(curM.getFullYear() + '-' + String(curM.getMonth()+1).padStart(2,'0')); curM.setMonth(curM.getMonth()+1); }
  } else {
    var cw = blMondayOf(R.start), guard = 0;
    while (cw <= R.end && guard < 60) { bucketKeys.push(cw); cw = blAddDays(cw, 7); guard++; }
  }
  function keyOf(ds) { return monthly ? ds.slice(0,7) : blMondayOf(ds); }
  function labelOf(k) { return monthly ? new Date(k + '-02').toLocaleString('en-AU', { month:'short' }) : new Date(k + 'T00:00:00').toLocaleString('en-AU', { day:'numeric', month:'short' }); }

  var buckets = {};
  bucketKeys.forEach(function(k){ buckets[k] = { total:0, hasAnnual:false, names:[] }; });
  confirmed.forEach(function(b) {
    blOccurrencesInRange(b, R.start, R.end).forEach(function(dateStr) {
      var key = keyOf(dateStr);
      if (!buckets[key]) return;
      buckets[key].total += blOccurrenceAmount(b, dateStr);
      if (b.isAnnual || b.frequency === 'annual') buckets[key].hasAnnual = true;
      if (buckets[key].names.indexOf(b.displayName) === -1) buckets[key].names.push(b.displayName);
    });
  });

  var maxTotal = 0, peakKey = null;
  bucketKeys.forEach(function(k){ if (buckets[k].total > maxTotal) { maxTotal = buckets[k].total; peakKey = k; } });

  var cardTok = blToken('--card3'), purpleTok = blToken('--purple'), warnTok = blToken('--warn');
  var colors = bucketKeys.map(function(k) {
    if (k === peakKey && maxTotal > 0) return warnTok;
    if (buckets[k].hasAnnual) return purpleTok;
    return cardTok;
  });
  var labels = bucketKeys.map(labelOf);
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
             callback: function(v){ return blMoneyShort(v); } } }
      }
    }
  });

  if (legend) {
    legend.innerHTML =
      '<div class="legend-item"><div class="legend-dot" style="background:var(--card3)"></div>Regular bills</div>' +
      '<div class="legend-item"><div class="legend-dot" style="background:var(--purple)"></div>Contains annual bill</div>' +
      '<div class="legend-item"><div class="legend-dot" style="background:var(--warn)"></div>Heaviest period</div>';
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
  var R = blPeriodRange();
  var sankSub = document.getElementById('bl-sankey-sub');
  if (sankSub) sankSub.textContent = R.label + ' · confirmed bills';
  var confirmed = blConfirmed();
  if (!confirmed.length) { el.innerHTML = '<div class="empty" style="min-height:120px;padding:20px"><div class="ei">' + ICON('chart-bar') + '</div><p style="font-size:.78rem">No confirmed bills yet.</p></div>'; return; }

  var nodes, srcLabel, srcAmt, backLink = '', drillHint = '';
  if (blSankeyDrill) {
    var inCat = confirmed.filter(function(b){ return (b.category || 'other') === blSankeyDrill; });
    var subTotals = {};
    inCat.forEach(function(b){ var s = b.subcategory || 'Other'; subTotals[s] = (subTotals[s]||0) + blPeriodAmount(b); });
    var catObj = LCATS.find(function(c){ return c.id === blSankeyDrill; });
    srcLabel = catObj ? catObj.name : blSankeyDrill;
    srcAmt = Object.keys(subTotals).reduce(function(s,k){ return s + subTotals[k]; }, 0);
    nodes = Object.keys(subTotals).sort(function(a,b2){ return subTotals[b2]-subTotals[a]; }).map(function(s,i) {
      return { label: s, amt: subTotals[s], color: BL_SANKEY_PALETTE[i % BL_SANKEY_PALETTE.length] };
    });
    backLink = '<div style="font-size:.7rem;color:var(--primary);cursor:pointer;margin-bottom:8px;font-weight:600" onclick="blSankeyDrill=null;blRenderSankey()">← Back to categories</div>';
  } else {
    var catTotals = {};
    confirmed.forEach(function(b){ var c = b.category || 'other'; catTotals[c] = (catTotals[c]||0) + blPeriodAmount(b); });
    srcLabel = 'Total Bills';
    srcAmt = Object.keys(catTotals).reduce(function(s,k){ return s + catTotals[k]; }, 0);
    nodes = Object.keys(catTotals).filter(function(c){ return catTotals[c] > 0; }).sort(function(a,b2){ return catTotals[b2]-catTotals[a]; }).map(function(c,i) {
      var cat = LCATS.find(function(x){ return x.id === c; });
      return { id: c, label: cat ? cat.name : c, amt: catTotals[c], color: cat && cat.color ? cat.color : BL_SANKEY_PALETTE[i % BL_SANKEY_PALETTE.length] };
    });
    drillHint = '<div style="font-size:.6rem;color:var(--muted);margin-top:10px">Tap a category to explore subcategories →</div>';
  }
  if (!srcAmt) { el.innerHTML = '<div class="empty" style="min-height:120px;padding:20px"><div class="ei">' + ICON('chart-bar') + '</div><p style="font-size:.78rem">No bills fall in ' + esc(R.label.toLowerCase()) + '.</p></div>'; return; }

  // Full-width geometry — a right-hand gutter reserves room for node labels so
  // nothing spills outside the viewBox as the tile grows.
  var W = 760, nodeW = 14, leftPad = 132, rightPad = 12, labelGutter = 178, gap = 11, incomeY = 10;
  var MIN_H = 20, MAX_H = 52;
  var textTok = blToken('--text') || '#d0cce8';
  var n = nodes.length;
  var maxAmt = nodes.reduce(function(mx,nd){ return Math.max(mx, nd.amt); }, 1);
  var scaleH = Math.min(MAX_H, Math.max(MIN_H, Math.floor(300 / n)));
  var curY = incomeY;
  nodes.forEach(function(nd) {
    nd.h = Math.max(MIN_H, Math.round((nd.amt / maxAmt) * scaleH));
    nd.y = curY;
    curY += nd.h + gap;
  });
  var H = Math.max(150, curY - gap + 14);
  var colX1 = leftPad, colX2 = W - rightPad - labelGutter - nodeW;

  var srcH = Math.min(curY - gap, H - 16);
  var paths = '', rects = '', labels = '';
  var lY = incomeY;
  nodes.forEach(function(nd, idx) {
    var frac = nd.amt / srcAmt;
    var flowH = Math.max(3, Math.round(srcH * frac));
    var srcY1 = lY, srcY2 = lY + flowH;
    var tgtY1 = nd.y, tgtY2 = nd.y + nd.h;
    var cx = Math.round((colX1 + nodeW + colX2) / 2);
    var clickAttr = blSankeyDrill ? '' : (' onclick="blSankeyDrill=\'' + nd.id + '\';blRenderSankey()" style="cursor:pointer"');
    paths += '<path d="M' + (colX1+nodeW) + ',' + srcY1 + ' C' + cx + ',' + srcY1 + ' ' + cx + ',' + tgtY1 + ' ' + colX2 + ',' + tgtY1
      + ' L' + colX2 + ',' + tgtY2 + ' C' + cx + ',' + tgtY2 + ' ' + cx + ',' + srcY2 + ' ' + (colX1+nodeW) + ',' + srcY2 + ' Z"'
      + ' fill="' + nd.color + '" opacity="0.34"/>';
    rects += '<rect x="' + colX2 + '" y="' + nd.y + '" width="' + nodeW + '" height="' + nd.h + '" rx="3" fill="' + nd.color + '"' + clickAttr + '/>';
    var labelY = nd.y + Math.round(nd.h/2) + 4;
    labels += '<text x="' + (colX2+nodeW+9) + '" y="' + labelY + '" font-size="12" fill="' + textTok + '">' + esc(nd.label).slice(0,26) + '</text>'
      + '<text x="' + (colX2+nodeW+9) + '" y="' + (labelY+13) + '" font-size="10" fill="' + blToken('--muted') + '">' + fmt(nd.amt) + '</text>';
    lY = srcY2;
  });
  var midY = incomeY + Math.round(srcH/2);
  var incSVG = '<rect x="0" y="' + incomeY + '" width="' + nodeW + '" height="' + srcH + '" rx="3" fill="' + blToken('--primary') + '"/>'
    + '<text x="' + (nodeW+8) + '" y="' + (midY-5) + '" font-size="12" fill="' + textTok + '">' + esc(srcLabel).slice(0,18) + '</text>'
    + '<text x="' + (nodeW+8) + '" y="' + (midY+12) + '" font-size="13" font-weight="700" fill="' + blToken('--primary') + '">' + fmt(srcAmt) + '</text>';

  el.innerHTML = backLink
    + '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" style="width:100%;height:auto;display:block">' + paths + rects + incSVG + labels + '</svg>'
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
function blYoyRef() {
  var p = blPeriod;
  if (p.mode === 'year') return { year:Number(p.y), month:null };
  if (p.mode === 'month') return { year:Number(p.ym.slice(0,4)), month:p.ym.slice(5,7) };
  return { year:new Date().getFullYear(), month:null };
}
function blYoyData(refYear, refMonth) {
  var confirmed = blConfirmed();
  var prevYear = refYear - 1;
  var cutoff = prevYear + '-01-01';
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
      if (refMonth) {
        var ym = t.date.slice(0,7);
        if (ym === refYear + '-' + refMonth) byCat[cat].curr += Number(t.amount) || 0;
        else if (ym === prevYear + '-' + refMonth) { byCat[cat].prev += Number(t.amount) || 0; byCat[cat].hasPrev = true; }
      } else {
        var yr = Number(t.date.slice(0,4));
        if (yr === refYear) byCat[cat].curr += Number(t.amount) || 0;
        else if (yr === prevYear) { byCat[cat].prev += Number(t.amount) || 0; byCat[cat].hasPrev = true; }
      }
    });
  });
  Object.keys(byCat).forEach(function(c){ if (!byCat[c].curr && !byCat[c].prev) delete byCat[c]; });
  return byCat;
}
function blRenderYoyChart() {
  var canvas = document.getElementById('bl-yoy-chart');
  var deltasEl = document.getElementById('bl-yoy-deltas');
  var card = document.getElementById('bl-yoy-card');
  if (!canvas) return;
  if (blYoyChart) { blYoyChart.destroy(); blYoyChart = null; }
  var ref = blYoyRef();
  var thisYear = ref.year, prevYear = ref.year - 1;
  var monthPfx = ref.month ? (new Date('2000-' + ref.month + '-02').toLocaleString('en-AU', { month:'short' }) + ' ') : '';
  var yoySub = document.getElementById('bl-yoy-sub');
  if (yoySub) yoySub.textContent = monthPfx + thisYear + ' vs ' + monthPfx + prevYear + ' · by category';
  var data = blYoyData(thisYear, ref.month);
  var cats = Object.keys(data);
  if (!cats.length) { if (card) card.style.display = 'none'; return; }
  if (card) card.style.display = '';

  var labels = cats.map(function(c){ var cat = LCATS.find(function(x){ return x.id===c; }); return cat ? cat.name : c; });
  var prevData = cats.map(function(c){ return data[c].hasPrev ? data[c].prev : null; });
  var currData = cats.map(function(c){ return data[c].curr; });

  blYoyChart = safeChart(canvas, {
    type: 'bar',
    data: { labels: labels, datasets: [
      { label: monthPfx + String(prevYear), data: prevData, backgroundColor: 'rgba(232,69,122,.28)', borderColor: 'rgba(232,69,122,.7)', borderWidth: 1.5, borderRadius: 5 },
      { label: monthPfx + String(thisYear), data: currData, backgroundColor: 'rgba(232,69,122,.85)', borderColor: '#e8457a', borderWidth: 1.5, borderRadius: 5 }
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
    var typeCls = BILL_TYPE_CLASS[b.billType] || 'btype-dd';
    var typeLbl = BILL_TYPE_LABELS[b.billType] || 'Direct Debit';
    var conf = b.confidence === null || typeof b.confidence === 'undefined' ? null : Math.round(b.confidence*100);

    // Match column: attention only where action is needed (pending); confirmed
    // rows show a quiet "auto-tracked" tick, manual rows a plain label.
    var matchCell;
    if (pending) {
      matchCell = '<div style="display:inline-flex;flex-direction:column;align-items:center;gap:3px">' +
        '<div role="progressbar" aria-valuenow="' + conf + '" aria-valuemin="0" aria-valuemax="100" aria-label="Match confidence ' + conf + '% — pending review" style="width:48px;height:5px;background:var(--card3);border-radius:99px;overflow:hidden">' +
        '<div style="width:' + conf + '%;height:100%;background:var(--warn);border-radius:99px"></div></div>' +
        '<div style="font-size:.62rem;color:var(--warn);font-weight:600" aria-hidden="true">' + conf + '%</div></div>';
    } else if (conf === null) {
      matchCell = '<span class="bl-muted" style="font-size:.68rem" title="Added manually">Manual</span>';
    } else {
      matchCell = '<span class="bl-muted" style="font-size:.9rem" title="Auto-tracked from your transactions (' + conf + '% match)" aria-label="Auto-tracked, ' + conf + '% match">' + ICON('circle-check') + '</span>';
    }

    var actionCell;
    if (pending) {
      actionCell = '<button class="btn btn-primary btn-sm" onclick="blOpenReviewModal()" style="white-space:nowrap;font-size:.68rem;padding:7px 11px">Review →</button>';
    } else {
      var priceChip = b.pendingAmountUpdate
        ? '<span style="font-size:.68rem;color:var(--warn);font-weight:600;background:rgba(245,158,11,.1);padding:7px 8px;border-radius:99px;white-space:nowrap;cursor:pointer" onclick="event.stopPropagation();blOpenReviewModal()" title="Price change detected — review">' + ICON('trending-up') + '</span>'
        : '';
      actionCell = '<div class="bl-row-actions">' + priceChip +
        '<button class="bl-icon-btn" title="Edit bill" aria-label="Edit ' + esc(b.displayName||'bill') + '" onclick="blOpenEditModal(\'' + b.id + '\')">' + ICON('pencil') + '</button>' +
        '<button class="bl-icon-btn danger" title="Delete bill" aria-label="Delete ' + esc(b.displayName||'bill') + '" onclick="blOpenEditModal(\'' + b.id + '\',true)">' + ICON('trash') + '</button>' +
        '</div>';
    }

    var firstTdStyle = pending ? ' style="border-left:3px solid var(--warn)"' : '';
    return '<tr class="bl-clickable' + (pending ? ' bl-row-pending' : '') + '" onclick="blOpenDetail(\'' + b.id + '\')" title="View details">' +
      '<td class="bl-td-first" data-label="Biller"' + firstTdStyle + '>' +
        '<div class="bl-biller-cell">' +
        '<div class="bl-biller-ico">' + iconTag(b.icon) + '</div>' +
        '<div><div style="font-weight:600">' + esc(b.displayName||'Bill') + blPaidByBadge(b) + '</div>' +
        '<div class="bl-muted" style="font-size:.68rem">' + esc(blFreqAmountLabel(b)) + '</div></div></div></td>' +
      '<td class="bl-td" data-label="Type" style="position:relative">' +
        '<button class="btype-btn ' + typeCls + '" onclick="event.stopPropagation();blToggleTypeMenu(\'' + rowId + '\')">' + typeLbl + '</button>' +
        '<div class="type-dropdown" id="' + rowId + '_dd" onclick="event.stopPropagation()">' +
        '<button class="type-option" onclick="event.stopPropagation();blSelectType(\'' + b.id + '\',\'bill\',\'' + rowId + '\')">Bill</button>' +
        '<button class="type-option" onclick="event.stopPropagation();blSelectType(\'' + b.id + '\',\'subscription\',\'' + rowId + '\')">Subscription</button>' +
        '<button class="type-option" onclick="event.stopPropagation();blSelectType(\'' + b.id + '\',\'direct_debit\',\'' + rowId + '\')">Direct Debit</button>' +
        '</div><div class="bl-muted" style="font-size:.7rem;margin-top:3px">' + esc(blSubcatOrCatLabel(b)) + '</div></td>' +
      '<td class="bl-td bl-muted" data-label="Account" style="font-size:.76rem">' + esc(b.account || '—') + '</td>' +
      '<td class="bl-td mono" data-label="Amount" style="text-align:right;font-weight:600">' + (b.amountType === 'variable' ? '~' : '') + fmt(b.amount) + '</td>' +
      '<td class="bl-td mono" data-label="Next due" style="font-size:.76rem">' + (pending ? '<span class="bl-muted">—</span>' : blDateLabel(b.nextDueDate)) + '</td>' +
      '<td class="bl-td" data-label="Match" style="text-align:center">' + matchCell + '</td>' +
      '<td class="bl-td bl-th-actions" data-label="" onclick="event.stopPropagation()">' + actionCell + '</td>' +
      '</tr>';
  }).join('');

  if (pag) {
    if (totalPages <= 1) { pag.innerHTML = ''; }
    else {
      var showing = 'Showing ' + pageList.length + ' of ' + list.length + ' · Page ' + blPage + ' of ' + totalPages;
      var btns = '<button class="bl-page-btn" onclick="blSetPage(' + Math.max(1,blPage-1) + ')" ' + (blPage===1?'disabled':'') + ' aria-label="Previous page">‹</button>';
      for (var p = 1; p <= totalPages; p++) {
        btns += '<button class="bl-page-btn' + (p===blPage?' active':'') + '" onclick="blSetPage(' + p + ')" aria-label="Page ' + p + '"' + (p===blPage?' aria-current="page"':'') + '>' + p + '</button>';
      }
      btns += '<button class="bl-page-btn" onclick="blSetPage(' + Math.min(totalPages,blPage+1) + ')" ' + (blPage===totalPages?'disabled':'') + ' aria-label="Next page">›</button>';
      pag.innerHTML = '<div class="bl-muted" style="font-size:.72rem">' + showing + '</div><div style="display:flex;gap:6px;flex-wrap:wrap">' + btns + '</div>';
    }
  }

  var legEl = document.getElementById('bl-paidby-legend');
  if (legEl) {
    var anyPaid = list.some(function(b){ return b.paidBy; });
    if (anyPaid) {
      var p1 = (typeof getUserName === 'function' ? getUserName('brenton') : 'Person 1') || 'Person 1';
      var p2 = (typeof getUserName === 'function' ? getUserName('shelley') : 'Person 2') || 'Person 2';
      legEl.innerHTML = '<span class="bl-muted" style="font-weight:700;letter-spacing:.04em">PAID BY</span>'
        + '<span class="bl-paidby p1">' + esc(p1.charAt(0).toUpperCase()) + '</span>' + esc(p1)
        + '<span class="bl-paidby p2">' + esc(p2.charAt(0).toUpperCase()) + '</span>' + esc(p2)
        + '<span class="bl-paidby joint">Joint</span>shared';
    } else { legEl.innerHTML = ''; }
  }
}

// ── Household split (paid by) ─────────────────────────────────
function blPaidByOptions(selected) {
  var p1 = (typeof getUserName === 'function' ? getUserName('brenton') : 'Person 1') || 'Person 1';
  var p2 = (typeof getUserName === 'function' ? getUserName('shelley') : 'Person 2') || 'Person 2';
  var opts = [['','Unassigned'], ['brenton', p1], ['shelley', p2], ['joint', 'Joint / shared']];
  return opts.map(function(o){ return '<option value="' + o[0] + '"' + (o[0] === (selected||'') ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('');
}
function blPaidByBadge(b) {
  if (!b.paidBy) return '';
  if (b.paidBy === 'joint') return '<span class="bl-paidby joint" title="Joint / shared">Joint</span>';
  var cls = b.paidBy === 'brenton' ? 'p1' : 'p2';
  var name = (typeof getUserName === 'function' ? getUserName(b.paidBy) : b.paidBy) || b.paidBy;
  return '<span class="bl-paidby ' + cls + '" title="Paid by ' + esc(name) + '">' + esc(name.charAt(0).toUpperCase()) + '</span>';
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
  blRenderCashChart(); blRenderSankey(); blRenderYoyChart();
}
document.addEventListener('click', function(e) {
  if (!e.target.closest('.btype-btn') && !e.target.closest('.type-dropdown')) {
    document.querySelectorAll('.type-dropdown.open').forEach(function(el){ el.classList.remove('open'); });
  }
});

// Arrow-key navigation across the Bills sub-tabs (WAI-ARIA tabs pattern).
document.addEventListener('keydown', function(e) {
  var tab = e.target.closest ? e.target.closest('.bl-tab') : null;
  if (!tab) return;
  if (['ArrowRight','ArrowLeft','Home','End'].indexOf(e.key) === -1) return;
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.bl-tabs .bl-tab'));
  var i = tabs.indexOf(tab);
  if (i === -1) return;
  e.preventDefault();
  var ni = e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1
         : e.key === 'ArrowRight' ? (i + 1) % tabs.length : (i - 1 + tabs.length) % tabs.length;
  tabs[ni].focus();
  tabs[ni].click();
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
  if (!total) { el.innerHTML = '<div class="empty"><div class="ei">' + ICON('circle-check-filled') + '</div><p>All caught up!</p></div>'; return; }

  var html = '';
  newDetections.forEach(function(b) {
    var rowId = 'rv_' + b.id;
    var typeCls = BILL_TYPE_CLASS[b.billType] || 'btype-dd';
    var typeLbl = BILL_TYPE_LABELS[b.billType] || 'Direct Debit';
    var occText = Math.round((b.confidence||0)*100) + '%';
    html += '<div class="review-row" id="' + rowId + '">' +
      '<div class="review-icon">' + iconTag(b.icon) + '</div>' +
      '<div class="review-main">' +
      '<div class="review-kind review-kind-new">' + ICON('sparkles') + ' New detection</div>' +
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
      '<div class="review-icon">' + iconTag(b.icon) + '</div>' +
      '<div class="review-main">' +
      '<div class="review-kind review-kind-price">' + ICON('trending-up') + ' Price change detected</div>' +
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
  var annual = blConfirmed().filter(function(b){ return b.isAnnual || b.frequency === 'annual'; })
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
  var confirmed = blConfirmed();
  var R = blPeriodRange();
  if (label) label.textContent = (blPeriod.mode === 'rolling' ? 'Upcoming — ' : 'Bills in ') + R.label;
  if (!confirmed.length) { el.innerHTML = '<div class="empty"><div class="ei">' + ICON('receipt') + '</div><p>No confirmed bills yet.</p></div>'; return; }

  var rows = [];
  confirmed.forEach(function(b) {
    var occs = blOccurrencesInRange(b, R.start, R.end);
    if (occs.length) rows.push({ bill: b, date: occs[0] });
  });
  rows.sort(function(a,b){ return a.date < b.date ? -1 : 1; });

  if (!rows.length) { el.innerHTML = '<div class="empty"><div class="ei">' + ICON('receipt') + '</div><p>Nothing due in this window.</p></div>'; return; }

  el.innerHTML = rows.map(function(r) {
    var b = r.bill;
    var typeCls = BILL_TYPE_CLASS[b.billType] || 'btype-dd';
    var typeLbl = BILL_TYPE_LABELS[b.billType] || 'Direct Debit';
    var dueSoon = blDaysBetween(today(), r.date) <= 7;
    var badges = ' <span class="badge ' + typeCls + '" style="margin-left:5px">' + typeLbl + '</span>';
    if (b.isAnnual || b.frequency === 'annual') badges += ' <span class="badge b-annual" style="margin-left:3px">Annual</span>';
    if (dueSoon) badges += ' <span class="badge b-soon" style="margin-left:3px">Due Soon</span>';
    return '<div class="bill-row">' +
      '<div class="bill-icon">' + iconTag(b.icon) + '</div>' +
      '<div class="bill-main"><div class="bill-name">' + esc(b.displayName||'Bill') + badges + '</div>' +
      '<div class="bill-meta">' + blDateLabel(r.date) + ' · ' + esc(BILL_FREQ_LABELS[b.frequency]||'Monthly') + '</div></div>' +
      '<div class="bill-amt mono">' + (b.amountType === 'variable' ? '~' : '') + fmt(blOccurrenceAmount(b, r.date)) + '</div></div>';
  }).join('');
}

// ══════════════════════════════════════════════════════════════
// 5 — MANUAL / FUTURE-DATED BILL ENTRY MODAL
// ══════════════════════════════════════════════════════════════
function blOpenAddModal() {
  var form = document.getElementById('bill-add-form');
  if (form) form.reset();
  blPopulateBillCatSelect();
  var pb = document.getElementById('bill-paidby-input');
  if (pb) pb.innerHTML = blPaidByOptions('');
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
  catSel.innerHTML = filtered.map(function(c){ return '<option value="' + c.id + '">' + c.name + '</option>'; }).join('');
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
  var paidBy = (document.getElementById('bill-paidby-input') || {}).value || '';
  if (!name || !amount || amount <= 0 || !nextDue) { toast('⚠️ Fill in name, amount and due date'); return; }

  var merchantKey = (typeof preprocessMerchantString === 'function' ? preprocessMerchantString(name) : name.toLowerCase()) || name.toLowerCase();
  merchantKey = (typeof resolveAlias === 'function') ? resolveAlias(merchantKey) : merchantKey;

  var existing = BILLS.find(function(b){ return b.merchantKey === merchantKey; });
  if (existing) { toast('⚠️ A bill matching "' + name + '" already exists'); return; }

  BILLS.push({
    id: 'bd_manual_' + Date.now(),
    merchantKey: merchantKey, displayName: name,
    icon: blPickIcon(merchantKey, catId, subcat, billType),
    category: catId, subcategory: subcat, account: '', paidBy: paidBy,
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

// ══════════════════════════════════════════════════════════════
// 5.1 — EDIT / DELETE EXISTING BILL
// ══════════════════════════════════════════════════════════════
var _blEditId = null;

function blPopulateEditCatSelect() {
  var catSel = document.getElementById('bill-edit-cat');
  if (!catSel) return;
  var filtered = LCATS.filter(function(c){ return !c.type || c.type === 'both' || c.type === 'expense'; });
  catSel.innerHTML = filtered.map(function(c){ return '<option value="' + c.id + '">' + esc(c.name) + '</option>'; }).join('');
}
function blRefreshEditSubcatSelect() {
  var catSel = document.getElementById('bill-edit-cat');
  var subSel = document.getElementById('bill-edit-subcat');
  if (!catSel || !subSel) return;
  var subs = getSubcats(catSel.value);
  subSel.innerHTML = '<option value="">No subcategory</option>' + subs.map(function(s){ return '<option value="' + esc(s) + '">' + esc(s) + '</option>'; }).join('');
}
function blOpenEditModal(billId, showDelete) {
  var b = BILLS.find(function(x){ return x.id === billId; });
  if (!b) return;
  _blEditId = billId;
  var idEl = document.getElementById('bill-edit-id'); if (idEl) idEl.value = billId;
  blPopulateEditCatSelect();
  var set = function(id, val){ var e = document.getElementById(id); if (e) e.value = val; };
  set('bill-edit-name', b.displayName || '');
  set('bill-edit-cat', b.category || 'other');
  blRefreshEditSubcatSelect();
  set('bill-edit-subcat', b.subcategory || '');
  set('bill-edit-amount', (b.amount != null ? b.amount : ''));
  set('bill-edit-due', b.nextDueDate || '');
  set('bill-edit-frequency', b.frequency || 'monthly');
  set('bill-edit-type', b.billType || 'bill');
  var pb = document.getElementById('bill-edit-paidby');
  if (pb) pb.innerHTML = blPaidByOptions(b.paidBy || '');
  var sub = document.getElementById('bill-edit-sub');
  if (sub) sub.textContent = b.source === 'detected'
    ? 'Auto-detected bill. Your edits become the source of truth from here on.'
    : 'Update this bill’s details. Saved to this device only.';
  var dnote = document.getElementById('bl-edit-delete-note');
  if (dnote) dnote.textContent = b.source === 'detected'
    ? 'We won’t re-detect this biller from your transactions.'
    : 'This manual bill will be removed.';
  blHideEditDelete();
  var m = document.getElementById('bill-edit-modal');
  if (m) m.classList.add('open');
  if (showDelete) blShowEditDelete();
}
function blCloseEditModal() {
  var m = document.getElementById('bill-edit-modal');
  if (m) m.classList.remove('open');
  _blEditId = null;
}
function blShowEditDelete() {
  var a = document.getElementById('bill-edit-actions');
  var d = document.getElementById('bill-edit-delete-confirm');
  if (a) a.style.display = 'none';
  if (d) d.style.display = 'flex';
}
function blHideEditDelete() {
  var a = document.getElementById('bill-edit-actions');
  var d = document.getElementById('bill-edit-delete-confirm');
  if (a) a.style.display = '';
  if (d) d.style.display = 'none';
}
function blSaveEditBill() {
  var b = BILLS.find(function(x){ return x.id === _blEditId; });
  if (!b) { blCloseEditModal(); return; }
  var name = (document.getElementById('bill-edit-name').value || '').trim();
  var catId = document.getElementById('bill-edit-cat').value;
  var subcat = document.getElementById('bill-edit-subcat').value;
  var amount = parseFloat(document.getElementById('bill-edit-amount').value);
  var frequency = document.getElementById('bill-edit-frequency').value || 'monthly';
  var nextDue = document.getElementById('bill-edit-due').value;
  var billType = document.getElementById('bill-edit-type').value || 'bill';
  var paidBy = (document.getElementById('bill-edit-paidby') || {}).value || '';
  if (!name || isNaN(amount) || amount <= 0 || !nextDue) { toast('⚠️ Fill in name, amount and due date'); return; }

  b.displayName = name;
  b.category = catId; b.subcategory = subcat; b.paidBy = paidBy;
  b.amount = Math.round(amount * 100) / 100;
  b.frequency = frequency; b.nextDueDate = nextDue;
  b.billType = billType; b._userSetType = true; b._userEdited = true;
  b.isAnnual = frequency === 'annual';
  b.icon = blPickIcon(b.merchantKey, catId, subcat, billType);
  // A manual edit is the user's stated ground truth — clear any pending
  // price-change prompt so we don't immediately re-flag their own number.
  b.pendingAmountUpdate = null; b.amountTrend = 'stable';

  try { save(K.bills, BILLS); } catch(e) { toast('⚠️ Could not save'); return; }
  blCloseEditModal();
  renderBills();
  toast('✅ ' + name + ' updated');
}
function blDeleteBillConfirmed() {
  var b = BILLS.find(function(x){ return x.id === _blEditId; });
  if (!b) { blCloseEditModal(); return; }
  var nm = b.displayName || 'Bill';
  // Detected bills must be remembered as dismissed, or the engine re-adds them
  // on the next detection pass. Manual bills just get removed.
  if (b.source === 'detected' && b.merchantKey && BILLS_DISMISSED.indexOf(b.merchantKey) === -1) {
    BILLS_DISMISSED.push(b.merchantKey);
    try { save(K.billsDismissed, BILLS_DISMISSED); } catch(e) {}
  }
  BILLS = BILLS.filter(function(x){ return x.id !== _blEditId; });
  try { save(K.bills, BILLS); } catch(e) {}
  blCloseEditModal();
  renderBills();
  toast('🗑️ ' + nm + ' deleted');
}

// ══════════════════════════════════════════════════════════════
// 6 — OCCURRENCE HELPERS
// ══════════════════════════════════════════════════════════════
function blOccurrenceAmount(bill, ds) {
  if (bill.occurrenceOverrides && bill.occurrenceOverrides[ds] != null) return Number(bill.occurrenceOverrides[ds]);
  return Number(bill.amount) || 0;
}
// Occurrences within an arbitrary [start,end] window (steps back from nextDueDate
// so the current month shows dates that have already passed this cycle).
function blOccurrencesInRange(bill, startStr, endStr) {
  var occs = [];
  if (!bill.nextDueDate || !bill.frequency) return occs;
  var d = bill.nextDueDate, guard = 0;
  while (d > startStr && guard < 500) {
    var prev = blAddInterval(d, bill.frequency, -1);
    if (!prev || prev >= d) break;
    d = prev; guard++;
  }
  guard = 0;
  while (d <= endStr && guard < 800) {
    if (d >= startStr) occs.push(d);
    d = blAddInterval(d, bill.frequency, 1);
    guard++;
  }
  return occs;
}

// ══════════════════════════════════════════════════════════════
// 7 — PER-BILL DETAIL DRAWER
// ══════════════════════════════════════════════════════════════
var _blDetailId = null;
function blSparkline(values, w, h) {
  if (!values || values.length < 2) return '';
  var min = Math.min.apply(null, values), max = Math.max.apply(null, values), range = (max - min) || 1;
  var stepX = w / (values.length - 1);
  var pts = values.map(function(v,i){ var x = i*stepX, y = h-4-((v-min)/range)*(h-8); return x.toFixed(1)+','+y.toFixed(1); }).join(' ');
  var lx = (values.length-1)*stepX, ly = h-4-((values[values.length-1]-min)/range)*(h-8);
  var col = blToken('--primary');
  return '<svg class="bl-spark" viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none">'
    + '<polyline points="'+pts+'" fill="none" stroke="'+col+'" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>'
    + '<circle cx="'+lx.toFixed(1)+'" cy="'+ly.toFixed(1)+'" r="3" fill="'+col+'"/></svg>';
}
function blOpenDetail(id) {
  var b = BILLS.find(function(x){ return x.id === id; });
  if (!b) return;
  _blDetailId = id;
  var box = document.getElementById('bl-detail-box');
  if (!box) return;
  var typeCls = BILL_TYPE_CLASS[b.billType] || 'btype-dd', typeLbl = BILL_TYPE_LABELS[b.billType] || 'Direct Debit';
  var txs = (TX || []).filter(function(t){ return t.date && blMatchesBillKey(t, b.merchantKey); }).sort(function(a,c){ return a.date < c.date ? -1 : 1; });
  var amts = txs.map(function(t){ return Math.abs(Number(t.amount)); });
  var occ = blProjectOccurrences(b, 365).slice(0, 6);
  var nextDs = occ[0] || b.nextDueDate;
  var overrideVal = (b.occurrenceOverrides && nextDs && b.occurrenceOverrides[nextDs] != null) ? b.occurrenceOverrides[nextDs] : '';
  var spark = amts.length >= 2 ? blSparkline(amts, 180, 52) : '';
  var paidLabel = b.paidBy ? (b.paidBy === 'joint' ? 'Joint / shared' : ((typeof getUserName === 'function' ? getUserName(b.paidBy) : b.paidBy) || b.paidBy)) : '—';

  var html = '<div class="modal-header"><div class="modal-title" style="display:flex;align-items:center;gap:10px"><span class="bl-biller-ico">' + iconTag(b.icon) + '</span>' + esc(b.displayName || 'Bill') + '</div>'
    + '<button class="modal-close" aria-label="Close" onclick="blCloseDetail()"><i class="ti ti-x"></i></button></div>'
    + '<div style="margin-bottom:14px"><span class="badge ' + typeCls + '">' + typeLbl + '</span> '
    + ((b.isAnnual || b.frequency === 'annual') ? '<span class="badge b-annual">Annual</span> ' : '')
    + '<span class="badge btype-dd">' + (b.source === 'manual' ? 'Manual' : 'Auto-detected') + '</span></div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">'
    + '<div class="bl-detail-stat"><div class="l">Amount</div><div class="v">' + (b.amountType === 'variable' ? '~' : '') + fmt(b.amount) + '</div></div>'
    + '<div class="bl-detail-stat"><div class="l">Frequency</div><div class="v" style="font-size:.86rem">' + (BILL_FREQ_LABELS[b.frequency] || 'Monthly') + '</div></div>'
    + '<div class="bl-detail-stat"><div class="l">Next due</div><div class="v" style="font-size:.86rem">' + blDateLabel(b.nextDueDate) + '</div></div>'
    + '<div class="bl-detail-stat"><div class="l">Per month</div><div class="v">' + fmt(blMonthlyEquivalent(b)) + '</div></div>'
    + '<div class="bl-detail-stat"><div class="l">Category</div><div class="v" style="font-size:.82rem">' + esc(blSubcatOrCatLabel(b)) + '</div></div>'
    + '<div class="bl-detail-stat"><div class="l">Paid by</div><div class="v" style="font-size:.82rem">' + esc(paidLabel) + '</div></div>'
    + '</div>';

  if (spark) {
    html += '<div class="section-label" style="margin-bottom:6px">Amount history</div>' + spark
      + '<div class="bl-muted" style="font-size:.68rem;margin:4px 0 14px">' + amts.length + ' charges · ' + fmt(Math.min.apply(null, amts)) + ' – ' + fmt(Math.max.apply(null, amts)) + '</div>';
  }
  if (nextDs) {
    html += '<div class="section-label" style="margin-bottom:6px">This occurrence (' + blDateLabel(nextDs) + ')</div>'
      + '<div style="display:flex;gap:8px;align-items:center;margin-bottom:16px">'
      + '<input type="number" id="bl-occ-override" placeholder="' + (Number(b.amount) || 0) + '" value="' + overrideVal + '" step="0.01" inputmode="decimal" class="bl-search-input" style="flex:1;width:auto" aria-label="One-off amount for this occurrence"/>'
      + '<button class="btn btn-ghost btn-sm" onclick="blSaveOccurrenceOverride(\'' + b.id + '\',\'' + nextDs + '\')">Set one-off</button></div>';
  }
  if (txs.length) {
    var recent = txs.slice(-8).reverse();
    html += '<div class="section-label" style="margin-bottom:6px">Detected charges</div>'
      + recent.map(function(t){ return '<div class="bl-txrow"><span class="bl-muted">' + blDateLabel(t.date) + '</span><span class="mono" style="font-weight:600">' + fmt(Math.abs(Number(t.amount))) + '</span></div>'; }).join('');
  }
  if (occ.length) {
    html += '<div class="section-label" style="margin:16px 0 6px">Upcoming</div>'
      + occ.map(function(ds){ return '<div class="bl-txrow"><span>' + blDateLabel(ds) + '</span><span class="mono">' + (b.amountType === 'variable' ? '~' : '') + fmt(blOccurrenceAmount(b, ds)) + '</span></div>'; }).join('');
  }
  html += '<div class="modal-actions" style="margin-top:18px">'
    + '<button class="btn-danger-ghost" onclick="blCloseDetail();blOpenEditModal(\'' + b.id + '\',true)" style="margin-right:auto"><i class="ti ti-trash"></i> Delete</button>'
    + '<button class="btn btn-ghost" onclick="blCloseDetail()">Close</button>'
    + '<button class="btn btn-primary" onclick="blCloseDetail();blOpenEditModal(\'' + b.id + '\')"><i class="ti ti-pencil"></i> Edit</button></div>';

  box.innerHTML = html;
  document.getElementById('bill-detail-modal').classList.add('open');
}
function blCloseDetail() {
  var m = document.getElementById('bill-detail-modal');
  if (m) m.classList.remove('open');
  _blDetailId = null;
}
function blSaveOccurrenceOverride(id, ds) {
  var b = BILLS.find(function(x){ return x.id === id; });
  if (!b) return;
  var inp = document.getElementById('bl-occ-override');
  if (!inp) return;
  var v = parseFloat(inp.value);
  b.occurrenceOverrides = b.occurrenceOverrides || {};
  if (isNaN(v) || v < 0) { delete b.occurrenceOverrides[ds]; toast('Cleared one-off amount'); }
  else { b.occurrenceOverrides[ds] = Math.round(v * 100) / 100; toast('✅ One-off amount set for ' + blDateLabel(ds)); }
  try { save(K.bills, BILLS); } catch(e) {}
  blRenderTabPanel();
  blOpenDetail(id);
}

// ══════════════════════════════════════════════════════════════
// 8 — CALENDAR MONTH VIEW
// ══════════════════════════════════════════════════════════════
function blMonthLabel(y, m) { return new Date(y, m, 1).toLocaleString('en-AU', { month:'long', year:'numeric' }); }
function blRenderCalendar() {
  var grid = document.getElementById('bl-calendar-grid');
  var title = document.getElementById('bl-cal-title');
  if (!grid) return;
  var y = blCalRef.y, m = blCalRef.m;
  if (title) title.textContent = blMonthLabel(y, m);
  var first = new Date(y, m, 1);
  var startDow = (first.getDay() + 6) % 7; // Monday-first
  var daysIn = new Date(y, m + 1, 0).getDate();
  var mm = String(m + 1).padStart(2, '0');
  var monthStart = y + '-' + mm + '-01';
  var monthEnd = y + '-' + mm + '-' + String(daysIn).padStart(2, '0');
  var byDay = {};
  blConfirmed().forEach(function(b) {
    blOccurrencesInRange(b, monthStart, monthEnd).forEach(function(d){ (byDay[d] = byDay[d] || []).push(b); });
  });
  var wd = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  var html = '<div class="bl-cal-weekdays">' + wd.map(function(w){ return '<div class="bl-cal-wd">' + w + '</div>'; }).join('') + '</div><div class="bl-cal-grid">';
  var i;
  for (i = 0; i < startDow; i++) html += '<div class="bl-cal-cell empty"></div>';
  for (var day = 1; day <= daysIn; day++) {
    var ds = y + '-' + mm + '-' + String(day).padStart(2, '0');
    var bills = byDay[ds] || [];
    var isToday = ds === today();
    var total = bills.reduce(function(s,b){ return s + blOccurrenceAmount(b, ds); }, 0);
    var dots = bills.slice(0, 4).map(function(){ return '<span></span>'; }).join('');
    html += '<div class="bl-cal-cell' + (bills.length ? ' has-bills' : '') + (isToday ? ' today' : '') + '" data-ds="' + ds + '"'
      + (bills.length ? ' onclick="blShowCalDay(\'' + ds + '\')" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();blShowCalDay(\'' + ds + '\');}" role="button" tabindex="0" aria-label="' + blDateLabel(ds) + ', ' + bills.length + ' bill' + (bills.length===1?'':'s') + '"' : '') + '>'
      + '<div class="bl-cal-daynum">' + day + '</div>'
      + (bills.length ? '<div class="bl-cal-dot">' + dots + '</div><div class="bl-cal-amt">' + blMoneyShort(total) + '</div>' : '') + '</div>';
  }
  html += '</div>';
  grid.innerHTML = html;
  var dl = document.getElementById('bl-cal-daylist');
  if (dl) dl.innerHTML = '';
}
function blCalShift(delta) {
  var m = blCalRef.m + delta, y = blCalRef.y;
  while (m < 0) { m += 12; y--; }
  while (m > 11) { m -= 12; y++; }
  blCalRef = { y:y, m:m };
  blRenderCalendar();
}
function blShowCalDay(ds) {
  var dl = document.getElementById('bl-cal-daylist');
  if (!dl) return;
  // Highlight the selected day cell
  var grid = document.getElementById('bl-calendar-grid');
  if (grid) {
    grid.querySelectorAll('.bl-cal-cell.selected').forEach(function(c){ c.classList.remove('selected'); });
    var cell = grid.querySelector('.bl-cal-cell[data-ds="' + ds + '"]');
    if (cell) cell.classList.add('selected');
  }
  var bills = blConfirmed().filter(function(b){ return blOccurrencesInRange(b, ds, ds).length; });
  if (!bills.length) { dl.innerHTML = ''; return; }
  var total = bills.reduce(function(s,b){ return s + blOccurrenceAmount(b, ds); }, 0);
  dl.innerHTML = '<div class="bl-cal-daypanel" style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border)">'
    + '<div class="section-label" style="margin-bottom:10px">' + blDateLabel(ds) + ' · ' + fmt(total) + '</div>'
    + bills.map(function(b) {
        return '<div class="bl-txrow bl-clickable" onclick="blOpenDetail(\'' + b.id + '\')">'
          + '<div style="display:flex;align-items:center;gap:9px"><span class="bl-biller-ico">' + iconTag(b.icon) + '</span><div><div style="font-weight:600">' + esc(b.displayName || 'Bill') + blPaidByBadge(b) + '</div><div class="bl-muted" style="font-size:.68rem">' + esc(BILL_FREQ_LABELS[b.frequency] || 'Monthly') + '</div></div></div>'
          + '<div class="mono" style="font-weight:600">' + (b.amountType === 'variable' ? '~' : '') + fmt(blOccurrenceAmount(b, ds)) + '</div></div>';
      }).join('') + '</div>';
  var panel = dl.querySelector('.bl-cal-daypanel');
  if (panel && panel.scrollIntoView) panel.scrollIntoView({ behavior:'smooth', block:'nearest' });
}
function blIcsEsc(s) { return String(s).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n'); }
function blExportIcs() {
  var lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Kelda Finance//Bills//EN','CALSCALE:GREGORIAN'];
  var endStr = blAddDays(today(), 365), count = 0;
  blConfirmed().forEach(function(b) {
    blOccurrencesInRange(b, today(), endStr).forEach(function(ds) {
      var dt = ds.replace(/-/g, '');
      lines.push('BEGIN:VEVENT', 'UID:kelda-' + b.id + '-' + dt + '@local', 'DTSTART;VALUE=DATE:' + dt,
        'SUMMARY:' + blIcsEsc((b.displayName || 'Bill') + ' — ' + fmt(blOccurrenceAmount(b, ds))),
        'DESCRIPTION:' + blIcsEsc((BILL_FREQ_LABELS[b.frequency] || '') + ' bill'), 'END:VEVENT');
      count++;
    });
  });
  lines.push('END:VCALENDAR');
  if (!count) { toast('No upcoming bills to export'); return; }
  try {
    var blob = new Blob([lines.join('\r\n')], { type:'text/calendar' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = 'kelda-bills.ics';
    document.body.appendChild(a); a.click();
    setTimeout(function(){ document.body.removeChild(a); URL.revokeObjectURL(url); }, 120);
    toast('📅 Exported ' + count + ' bill date' + (count === 1 ? '' : 's'));
  } catch(e) { toast('⚠️ Could not export'); }
}

// ══════════════════════════════════════════════════════════════
// 9 — SUBSCRIPTIONS AUDIT
// ══════════════════════════════════════════════════════════════
function blSubFlag(b) {
  if (b.pendingAmountUpdate || b.amountTrend === 'increasing') return 'creep';
  if (b.lastSeenDate && blRecencyGateTriggered([{ date:b.lastSeenDate }], b.frequency)) return 'dormant';
  return 'ok';
}
function blRenderSubscriptions() {
  var el = document.getElementById('bl-subs-content');
  if (!el) return;
  var subs = blConfirmed().filter(function(b){ return b.billType === 'subscription'; });
  if (!subs.length) {
    el.innerHTML = '<div class="empty"><div class="ei">' + ICON('movie') + '</div><p>No subscriptions tracked yet. Switch a bill’s type to “Subscription” on the All Bills tab, or add one.</p></div>';
    return;
  }
  var monthly = subs.reduce(function(s,b){ return s + blMonthlyEquivalent(b); }, 0);
  var annual = subs.reduce(function(s,b){ return s + blAnnualizedAmount(b); }, 0);
  var creep = subs.filter(function(b){ return blSubFlag(b) === 'creep'; }).length;
  var dormant = subs.filter(function(b){ return blSubFlag(b) === 'dormant'; }).length;
  var head = '<div class="kpi-row" style="grid-template-columns:repeat(3,1fr)">'
    + '<div class="kpi"><div class="kpi-label">Per Month</div><div class="kpi-value mono" style="color:var(--primary)">' + fmt(monthly) + '</div><div class="kpi-sub">' + subs.length + ' subscription' + (subs.length===1?'':'s') + '</div></div>'
    + '<div class="kpi"><div class="kpi-label">Per Year</div><div class="kpi-value mono">' + fmt(annual) + '</div><div class="kpi-sub">annualised</div></div>'
    + '<div class="kpi"><div class="kpi-label">Needs a Look</div><div class="kpi-value mono" style="color:' + ((creep+dormant) ? 'var(--warn)' : 'var(--success)') + '">' + (creep + dormant) + '</div><div class="kpi-sub">' + creep + ' price rise · ' + dormant + ' dormant</div></div>'
    + '</div>';
  var rows = subs.slice().sort(function(a,b){ return blMonthlyEquivalent(b) - blMonthlyEquivalent(a); }).map(function(b) {
    var f = blSubFlag(b);
    var flagLbl = { creep:'Price rise', dormant:'Not seen recently', ok:'On track' }[f];
    var flagCls = { creep:'bl-flag-creep', dormant:'bl-flag-dormant', ok:'bl-flag-ok' }[f];
    return '<div class="bl-sub-card">'
      + '<span class="bl-biller-ico">' + iconTag(b.icon) + '</span>'
      + '<div style="flex:1;min-width:0"><div style="font-weight:600">' + esc(b.displayName || 'Subscription') + blPaidByBadge(b) + '</div>'
      + '<div class="bl-muted" style="font-size:.72rem">' + esc(BILL_FREQ_LABELS[b.frequency] || 'Monthly') + ' · ' + fmt(b.amount) + ' · ' + fmt(blMonthlyEquivalent(b)) + '/mo</div></div>'
      + '<span class="bl-sub-flag ' + flagCls + '">' + flagLbl + '</span>'
      + '<button class="bl-icon-btn" title="View details" aria-label="View ' + esc(b.displayName || '') + '" onclick="blOpenDetail(\'' + b.id + '\')">' + ICON('eye') + '</button>'
      + '<button class="bl-icon-btn danger" title="Cancel / delete" aria-label="Delete ' + esc(b.displayName || '') + '" onclick="blOpenEditModal(\'' + b.id + '\',true)">' + ICON('trash') + '</button>'
      + '</div>';
  }).join('');
  el.innerHTML = head + '<div style="margin-top:4px">' + rows + '</div>';
}

// ══════════════════════════════════════════════════════════════
// 10 — ANNUAL BUFFER → SAVINGS GOAL
// ══════════════════════════════════════════════════════════════
function blCreateBufferGoal() {
  if (typeof GOALS === 'undefined' || !GOALS) { toast('⚠️ Goals are unavailable'); return; }
  var annual = blConfirmed().filter(function(b){ return b.isAnnual || b.frequency === 'annual'; });
  if (!annual.length) { toast('No annual bills to buffer yet'); return; }
  var target = Math.round(annual.reduce(function(s,b){ return s + (Number(b.amount) || 0); }, 0));
  var due = annual.map(function(b){ return b.nextDueDate; }).filter(Boolean).sort()[0] || '';
  var existing = GOALS.find(function(g){ return g._source === 'bills_buffer'; });
  if (existing) {
    existing.targetAmount = target;
    if (due) existing.targetDate = due;
    try { save(K.goals, GOALS); } catch(e) {}
    toast('✅ Updated “Annual Bills Buffer” goal to ' + fmt(target));
  } else {
    GOALS.push({ id:Date.now(), name:'Annual Bills Buffer', icon:'target', targetAmount:target, currentAmount:0, targetDate:due, linkedAccount:'', createdAt:new Date().toISOString().split('T')[0], _source:'bills_buffer' });
    try { save(K.goals, GOALS); } catch(e) {}
    toast('✅ Created “Annual Bills Buffer” savings goal');
  }
  if (typeof renderGoals === 'function') { try { renderGoals(); } catch(e) {} }
  if (typeof dbRenderGoals === 'function') { try { dbRenderGoals(); } catch(e) {} }
}

// ══════════════════════════════════════════════════════════════
// 11 — REMINDERS (local-first) + DUE-SOON BANNER
// ══════════════════════════════════════════════════════════════
function blNotifyPrefs() {
  var p = load(K.billsNotify) || {};
  return { banner: p.banner !== false, notify: !!p.notify, days: Number(p.days) || 7, dismissedOn: p.dismissedOn || '' };
}
function blDueSoonBills() {
  var p = blNotifyPrefs();
  var cutoff = blAddDays(today(), p.days);
  return blConfirmed().map(function(b) {
    var occ = blProjectOccurrences(b, p.days)[0];
    return occ ? { bill:b, date:occ } : null;
  }).filter(function(r){ return r && r.date >= today() && r.date <= cutoff; })
    .sort(function(a,b){ return a.date < b.date ? -1 : 1; });
}
function blRenderDueSoonBanner() {
  var el = document.getElementById('bl-duesoon-banner');
  if (!el) return;
  var p = blNotifyPrefs();
  if (!p.banner || p.dismissedOn === today()) { el.innerHTML = ''; return; }
  var due = blDueSoonBills();
  if (!due.length) { el.innerHTML = ''; return; }
  var total = due.reduce(function(s,r){ return s + blOccurrenceAmount(r.bill, r.date); }, 0);
  var soon = due[0];
  var extra = due.length > 1 ? ' · +' + (due.length - 1) + ' more' : '';
  el.innerHTML = '<div class="bl-duesoon">' + ICON('bell')
    + '<div style="flex:1"><div style="font-weight:600;font-size:.86rem">' + due.length + ' bill' + (due.length===1?'':'s') + ' due in the next ' + p.days + ' days · ' + fmt(total) + '</div>'
    + '<div class="bl-muted" style="font-size:.72rem">Next: ' + esc(soon.bill.displayName || 'Bill') + ' on ' + blDateLabel(soon.date) + ' — ' + fmt(blOccurrenceAmount(soon.bill, soon.date)) + extra + '</div></div>'
    + '<button class="bl-duesoon-x" aria-label="Dismiss reminder" onclick="blDismissDueSoon()">' + ICON('x') + '</button></div>';
  blMaybeNotify();
}
function blDismissDueSoon() {
  var p = blNotifyPrefs();
  p.dismissedOn = today();
  try { save(K.billsNotify, p); } catch(e) {}
  blRenderDueSoonBanner();
}
function blMaybeNotify() {
  if (_blNotifiedThisSession) return;
  var p = blNotifyPrefs();
  if (!p.notify || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  var due = blDueSoonBills();
  if (!due.length) return;
  _blNotifiedThisSession = true;
  try {
    var total = due.reduce(function(s,r){ return s + blOccurrenceAmount(r.bill, r.date); }, 0);
    new Notification('Bills due soon', { body: due.length + ' bill' + (due.length===1?'':'s') + ' totalling ' + fmt(total) + ' due in the next ' + p.days + ' days.' });
  } catch(e) {}
}
function blOpenRemindersModal() {
  var p = blNotifyPrefs();
  var bn = document.getElementById('bl-remind-banner'); if (bn) bn.checked = p.banner;
  var nt = document.getElementById('bl-remind-notify'); if (nt) nt.checked = p.notify && (typeof Notification !== 'undefined' && Notification.permission === 'granted');
  var dd = document.getElementById('bl-remind-days'); if (dd) dd.value = String(p.days);
  blUpdateRemindStatus();
  var m = document.getElementById('bill-reminders-modal'); if (m) m.classList.add('open');
}
function blCloseRemindersModal() {
  var m = document.getElementById('bill-reminders-modal'); if (m) m.classList.remove('open');
}
function blSaveReminderPrefs() {
  var p = blNotifyPrefs();
  var bn = document.getElementById('bl-remind-banner'); if (bn) p.banner = bn.checked;
  var dd = document.getElementById('bl-remind-days'); if (dd) p.days = Number(dd.value) || 7;
  p.dismissedOn = '';
  try { save(K.billsNotify, p); } catch(e) {}
  blUpdateRemindStatus();
  blRenderDueSoonBanner();
}
function blToggleBrowserNotify(checked) {
  var p = blNotifyPrefs();
  var el = document.getElementById('bl-remind-notify');
  if (!checked) { p.notify = false; try { save(K.billsNotify, p); } catch(e) {} blUpdateRemindStatus(); return; }
  if (typeof Notification === 'undefined') { toast('This browser can’t show notifications'); if (el) el.checked = false; return; }
  if (Notification.permission === 'granted') { p.notify = true; try { save(K.billsNotify, p); } catch(e) {} blUpdateRemindStatus(); blMaybeNotify(); return; }
  if (Notification.permission === 'denied') { toast('Notifications are blocked in your browser settings'); if (el) el.checked = false; blUpdateRemindStatus(); return; }
  Notification.requestPermission().then(function(res) {
    var granted = res === 'granted';
    var pp = blNotifyPrefs(); pp.notify = granted; try { save(K.billsNotify, pp); } catch(e) {}
    if (el) el.checked = granted;
    blUpdateRemindStatus();
    if (granted) blMaybeNotify(); else toast('Notification permission not granted');
  });
}
function blUpdateRemindStatus() {
  var el = document.getElementById('bl-remind-status');
  if (!el) return;
  var perm = (typeof Notification !== 'undefined') ? Notification.permission : 'unsupported';
  el.textContent = {
    granted: 'Browser notifications are allowed.',
    denied: 'Notifications are blocked — enable them in your browser’s site settings.',
    'default': 'Your browser will ask permission when you enable notifications.',
    unsupported: 'This browser doesn’t support notifications.'
  }[perm] || '';
}

// ══════════════════════════════════════════════════════════════
// 12 — DISMISSED BILLERS MANAGER
// ══════════════════════════════════════════════════════════════
function blRenderDismissedBar() {
  var el = document.getElementById('bl-dismissed-bar');
  if (!el) return;
  if (!BILLS_DISMISSED.length) { el.innerHTML = ''; return; }
  var chips = BILLS_DISMISSED.map(function(k, i) {
    var name = (typeof makeDisplayMerchant === 'function') ? makeDisplayMerchant(k) : k;
    return '<span class="bl-chip">' + esc(name) + '<button title="Restore" aria-label="Restore ' + esc(name) + '" onclick="blRestoreDismissedIdx(' + i + ')">' + ICON('rotate') + '</button></span>';
  }).join('');
  el.innerHTML = '<div class="bl-dismissed-inner"><div class="bl-muted" style="font-size:.66rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Dismissed billers — won’t be detected</div>' + chips + '</div>';
}
function blRestoreDismissedIdx(i) {
  var key = BILLS_DISMISSED[i];
  if (key == null) return;
  BILLS_DISMISSED.splice(i, 1);
  try { save(K.billsDismissed, BILLS_DISMISSED); } catch(e) {}
  runBillDetection();
  toast('Restored — “' + key + '” will be detected again');
  renderBills();
}
