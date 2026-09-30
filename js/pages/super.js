// ══════════════════════════════════════════════════════════════
// SUPERANNUATION PAGE
// ══════════════════════════════════════════════════════════════

// ── Multi-account super store ─────────────────────────────────
// { brenton: [{id,fund,balance,type}], shelley: [...] }
var SUPER_ACCTS = (function(){
  var d = load(K.superAccts);
  return d || { brenton: [], shelley: [] };
})();

var _SUPER_TYPES = ['Accumulation','Defined Benefit','SMSF','Pension (Drawdown)','Other'];

function _superProfileKey(pfx) { return pfx === 'b' ? 'brenton' : 'shelley'; }

function superAcctTotal(pfx) {
  var accts = SUPER_ACCTS[_superProfileKey(pfx)] || [];
  return accts.reduce(function(s,a){ return s + (parseFloat(a.balance)||0); }, 0);
}

function superSaveAccts() {
  try { save(K.superAccts, SUPER_ACCTS); } catch(e) {}
  try{if(typeof recordNetWorthSnapshot==='function')recordNetWorthSnapshot();}catch(e){}
}

// Auto-fill balance from account total when accounts exist
function superSyncBalance(pfx) {
  var total = superAcctTotal(pfx);
  if (total > 0) {
    var el = document.getElementById((pfx==='b'?'sb':'ss') + '-balance');
    if (el && !el.matches(':focus')) { el.value = total; }
  }
}

// ── Aggregation table ─────────────────────────────────────────
function renderSuperAggTable() {
  var el = document.getElementById('super-agg-table');
  if (!el) return;

  var bName = getUserName ? (getUserName('brenton') || 'Profile 1') : 'Profile 1';
  var sName = getUserName ? (getUserName('shelley') || 'Profile 2') : 'Profile 2';

  var bAccts = SUPER_ACCTS.brenton || [];
  var sAccts = SUPER_ACCTS.shelley || [];
  var bTotal = bAccts.reduce(function(s,a){ return s+(parseFloat(a.balance)||0); },0);
  var sTotal = sAccts.reduce(function(s,a){ return s+(parseFloat(a.balance)||0); },0);
  var combined = bTotal + sTotal;

  if (!bAccts.length && !sAccts.length) {
    el.innerHTML = '<div class="sp-agg-empty">No super accounts added yet. Use the + Add Super Account button in each profile below.</div>';
    return;
  }

  var rows = '';
  var profileColor = { brenton:'var(--primary)', shelley:'#818CF8' };

  function profileRows(accts, name, total, colorKey) {
    if (!accts.length) return '';
    var r = '';
    accts.forEach(function(a, i) {
      r += '<tr>'
        + (i === 0 ? '<td rowspan="' + (accts.length+1) + '" class="sp-agg-profile" style="color:' + (colorKey==='brenton'?profileColor.brenton:profileColor.shelley) + '">' + esc(name) + '</td>' : '')
        + '<td class="sp-agg-td">' + esc(a.fund||'—') + '</td>'
        + '<td class="sp-agg-td sp-agg-td--muted">' + esc(a.type||'—') + '</td>'
        + '<td class="sp-agg-td sp-agg-td--num">' + fmt(a.balance||0) + '</td>'
        + '</tr>';
    });
    // Subtotal row
    r += '<tr class="sp-agg-sub">'
      + '<td colspan="2" class="sp-agg-sublbl">Total — ' + esc(name) + '</td>'
      + '<td class="sp-agg-subtotal" style="color:' + (colorKey==='brenton'?profileColor.brenton:profileColor.shelley) + '">' + fmt(total) + '</td>'
      + '</tr>';
    return r;
  }

  rows += profileRows(bAccts, bName, bTotal, 'brenton');
  rows += profileRows(sAccts, sName, sTotal, 'shelley');

  // Combined row
  rows += '<tr class="sp-agg-combined">'
    + '<td class="sp-agg-comb-lbl">Combined</td>'
    + '<td colspan="2" class="sp-agg-comb-count">' + (bAccts.length + sAccts.length) + ' account' + (bAccts.length+sAccts.length!==1?'s':'') + '</td>'
    + '<td class="sp-agg-comb-val">' + fmt(combined) + '</td>'
    + '</tr>';

  el.innerHTML = '<div class="sp-agg-scroll">'
    + '<table class="sp-agg-table">'
    + '<thead><tr class="sp-agg-head">'
    + '<th class="sp-agg-th sp-agg-th--first">Profile</th>'
    + '<th class="sp-agg-th">Fund</th>'
    + '<th class="sp-agg-th">Type</th>'
    + '<th class="sp-agg-th sp-agg-th--num">Balance</th>'
    + '</tr></thead>'
    + '<tbody>' + rows + '</tbody>'
    + '</table></div>';
}

// ── Account list renderer for each profile card ───────────────
function renderSuperAcctList(pfx) {
  var el = document.getElementById('super-acct-list-' + pfx);
  if (!el) return;
  var key   = _superProfileKey(pfx);
  var accts = SUPER_ACCTS[key] || [];

  if (!accts.length) {
    el.innerHTML = '<div class="sp-list-empty">No accounts added yet.</div>';
    return;
  }
  el.innerHTML = accts.map(function(a) {
    return '<div class="sp-acct-row" id="super-acct-row-' + pfx + '-' + a.id + '">'
      + '<div class="sp-acct-main">'
      + '<div class="sp-acct-fund">' + esc(a.fund||'Unknown Fund') + '</div>'
      + '<div class="sp-acct-type">' + esc(a.type||'Accumulation') + '</div>'
      + '</div>'
      + '<div class="sp-acct-bal">' + fmt(a.balance||0) + '</div>'
      + '<div class="sp-acct-actions">'
      + '<button class="btn btn-ghost btn-sm" onclick="superEditAcct(\'' + pfx + '\',\'' + a.id + '\')">Edit</button>'
      + '<button class="del-btn" onclick="superDeleteAcct(\'' + pfx + '\',\'' + a.id + '\')">' + ICON('trash') + '</button>'
      + '</div>'
      + '</div>';
  }).join('');
}

// ── Show inline add form ───────────────────────────────────────
function superShowAddForm(pfx) {
  var el = document.getElementById('super-add-form-' + pfx);
  if (el) { el.style.display = 'block'; el.scrollIntoView({ behavior:'smooth', block:'nearest' }); }
}
function superHideAddForm(pfx) {
  var el = document.getElementById('super-add-form-' + pfx);
  if (el) el.style.display = 'none';
}

function superAddAcct(pfx) {
  var key  = _superProfileKey(pfx);
  var fund = (document.getElementById('super-new-fund-' + pfx) || {}).value.trim();
  var bal  = parseFloat((document.getElementById('super-new-bal-' + pfx) || {}).value) || 0;
  var type = (document.getElementById('super-new-type-' + pfx) || {}).value || 'Accumulation';
  var mo   = (document.getElementById('super-new-mo-' + pfx) || {}).value || _nwCurrentMonth();
  if (!fund) { toast('Please enter a fund name'); return; }
  if (!SUPER_ACCTS[key]) SUPER_ACCTS[key] = [];
  var id = 'sa_' + Date.now().toString(36);
  SUPER_ACCTS[key].push({ id: id, fund: fund, balance: bal, type: type });
  superSaveAccts();
  _superRecordMonthHistory(mo);
  superHideAddForm(pfx);
  _superRefresh(pfx);
  toast('✅ Super account added — ' + fund);
}

function superDeleteAcct(pfx, id) {
  var key   = _superProfileKey(pfx);
  var accts = SUPER_ACCTS[key] || [];
  var a     = accts.find(function(x){ return x.id === id; });
  if (!a || !confirm('Remove "' + a.fund + '" from super accounts?')) return;
  SUPER_ACCTS[key] = accts.filter(function(x){ return x.id !== id; });
  superSaveAccts();
  _superRefresh(pfx);
  toast('🗑️ Removed — ' + a.fund);
}

function superEditAcct(pfx, id) {
  var key  = _superProfileKey(pfx);
  var a    = (SUPER_ACCTS[key] || []).find(function(x){ return x.id === id; });
  if (!a) return;
  var rowEl = document.getElementById('super-acct-row-' + pfx + '-' + id);
  if (!rowEl) return;
  var curMo = _nwCurrentMonth ? _nwCurrentMonth() : '';
  rowEl.innerHTML = '<div class="sp-edit">'
    + '<div class="sp-field"><label class="lbl lbl--sm">Fund Name</label><input type="text" id="super-edit-fund-' + pfx + '-' + id + '" value="' + esc(a.fund||'') + '" class="sp-input-16"/></div>'
    + '<div class="sp-field sp-field--sm"><label class="lbl lbl--sm">Balance (AUD)</label><input type="number" id="super-edit-bal-' + pfx + '-' + id + '" value="' + (a.balance||0) + '" step="1000" inputmode="decimal"/></div>'
    + '<div class="sp-field"><label class="lbl lbl--sm">Type</label><select id="super-edit-type-' + pfx + '-' + id + '">'
    + _SUPER_TYPES.map(function(t){ return '<option value="' + t + '"' + (t===a.type?' selected':'') + '>' + t + '</option>'; }).join('')
    + '</select></div>'
    + '<div class="sp-field sp-field--sm"><label class="lbl lbl--sm">Balance as of</label><input type="month" id="super-edit-mo-' + pfx + '-' + id + '" value="' + curMo + '"/></div>'
    + '<div class="sp-edit-actions">'
    + '<button class="btn btn-primary btn-sm" onclick="superSaveEdit(\'' + pfx + '\',\'' + id + '\')">Save</button>'
    + '<button class="btn btn-ghost btn-sm" onclick="renderSuperAcctList(\'' + pfx + '\')">Cancel</button>'
    + '</div></div>';
}

function superSaveEdit(pfx, id) {
  var key  = _superProfileKey(pfx);
  var a    = (SUPER_ACCTS[key] || []).find(function(x){ return x.id === id; });
  if (!a) return;
  a.fund    = (document.getElementById('super-edit-fund-' + pfx + '-' + id) || {}).value.trim() || a.fund;
  a.balance = parseFloat((document.getElementById('super-edit-bal-' + pfx + '-' + id) || {}).value) || 0;
  a.type    = (document.getElementById('super-edit-type-' + pfx + '-' + id) || {}).value || a.type;
  var mo    = (document.getElementById('super-edit-mo-' + pfx + '-' + id) || {}).value || _nwCurrentMonth();
  superSaveAccts();
  _superRecordMonthHistory(mo);
  _superRefresh(pfx);
  toast('✅ Updated — ' + a.fund);
}

// Record the total super balance for both profiles into monthly history
function _superRecordMonthHistory(mo) {
  try {
    if (typeof nwRecordSuperMonth !== 'function') return;
    var bTotal = (SUPER_ACCTS.brenton || []).reduce(function(s,a){ return s+(parseFloat(a.balance)||0); }, 0);
    var sTotal = (SUPER_ACCTS.shelley || []).reduce(function(s,a){ return s+(parseFloat(a.balance)||0); }, 0);
    nwRecordSuperMonth(mo, bTotal, sTotal);
  } catch(e) {}
}

function _superRefresh(pfx) {
  renderSuperAcctList(pfx);
  superSyncBalance(pfx);
  renderSuperAggTable();
  calcSuper();
  renderSuperMonthlyGrid();
}

// ══════════════════════════════════════════════════════════════
// SUPER MONTHLY CLOSING BALANCE GRID (Cash Tracker-style)
// ══════════════════════════════════════════════════════════════

function _superMonthlyMonthOpts(sel) {
  var now = new Date();
  var o = '';
  for (var i = 0; i < 36; i++) {
    var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    var v = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    var l = d.toLocaleString('en-AU', { month: 'long', year: 'numeric' });
    o += '<option value="' + v + '"' + (v === sel ? ' selected' : '') + '>' + l + '</option>';
  }
  return o;
}

function _superMonthlyUpdateNW(mo) {
  try {
    if (typeof nwRecordSuperMonth !== 'function') return;
    var bTotal = 0, sTotal = 0;
    var bAccts = SUPER_ACCTS.brenton || [];
    var sAccts = SUPER_ACCTS.shelley || [];
    bAccts.forEach(function(a) {
      var hist = SUPER_MONTHLY[a.id] || {};
      bTotal += hist[mo] !== undefined ? hist[mo] : (parseFloat(a.balance) || 0);
    });
    sAccts.forEach(function(a) {
      var hist = SUPER_MONTHLY[a.id] || {};
      sTotal += hist[mo] !== undefined ? hist[mo] : (parseFloat(a.balance) || 0);
    });
    nwRecordSuperMonth(mo, bTotal, sTotal);
    if (typeof recordNetWorthSnapshot === 'function') recordNetWorthSnapshot();
  } catch(e) {}
}

function superMonthSave(acctId) {
  var mo  = (document.getElementById('super-mo-inp-' + acctId) || {}).value;
  var bal = parseFloat((document.getElementById('super-mo-bal-' + acctId) || {}).value);
  if (!mo || isNaN(bal)) { toast('⚠️ Select month and enter balance'); return; }
  if (!SUPER_MONTHLY[acctId]) SUPER_MONTHLY[acctId] = {};
  SUPER_MONTHLY[acctId][mo] = bal;
  save(K.superMonthly, SUPER_MONTHLY);
  _superMonthlyUpdateNW(mo);
  renderSuperMonthlyGrid();
  var balInp = document.getElementById('super-mo-bal-' + acctId);
  if (balInp) balInp.value = '';
  toast('✅ Balance saved');
}

function superMonthUpdate(acctId, mo, value) {
  var v = parseFloat(value);
  if (!SUPER_MONTHLY[acctId]) SUPER_MONTHLY[acctId] = {};
  if (!isNaN(v)) {
    SUPER_MONTHLY[acctId][mo] = v;
  } else {
    delete SUPER_MONTHLY[acctId][mo];
  }
  save(K.superMonthly, SUPER_MONTHLY);
  _superMonthlyUpdateNW(mo);
}

function superMonthDel(acctId, mo) {
  if (SUPER_MONTHLY[acctId]) delete SUPER_MONTHLY[acctId][mo];
  save(K.superMonthly, SUPER_MONTHLY);
  _superMonthlyUpdateNW(mo);
  renderSuperMonthlyGrid();
}

function renderSuperMonthlyGrid() {
  var el = document.getElementById('super-monthly-grid');
  if (!el) return;

  var bAccts = SUPER_ACCTS.brenton || [];
  var sAccts = SUPER_ACCTS.shelley || [];
  var allAccts = [];
  var bName = (typeof getUserName === 'function') ? (getUserName('brenton') || 'Profile 1') : 'Profile 1';
  var sName = (typeof getUserName === 'function') ? (getUserName('shelley') || 'Profile 2') : 'Profile 2';
  bAccts.forEach(function(a) { allAccts.push({ acct: a, profileLabel: bName, color: 'var(--primary)' }); });
  sAccts.forEach(function(a) { allAccts.push({ acct: a, profileLabel: sName, color: '#818CF8' }); });

  if (!allAccts.length) {
    el.innerHTML = '<div class="card mb sp-mo-empty">Add super accounts above to start tracking monthly balances.</div>';
    return;
  }

  var curMo = typeof _nwCurrentMonth === 'function' ? _nwCurrentMonth() : new Date().toISOString().slice(0, 7);
  var html = '<div class="section-label sp-sl-12">' + ICON('calendar') + ' Monthly Super Balances</div>'
    + '<div class="sp-mo-desc">Record each account\'s closing balance by month — tracks changes in super over time and links to Net Worth history.</div>';

  allAccts.forEach(function(item) {
    var a = item.acct;
    var data = SUPER_MONTHLY[a.id] || {};
    var months = Object.keys(data).sort();
    var rows = '';
    if (!months.length) {
      rows = '<div class="sp-mo-none">No entries yet.</div>';
    } else {
      months.forEach(function(m, i) {
        var bal = data[m];
        var prev = i > 0 ? data[months[i - 1]] : null;
        var diff = prev !== null ? bal - prev : null;
        var diffStr = diff === null ? '' : (diff >= 0 ? '+' : '') + fmt(diff);
        var diffTone = diff === null ? '' : diff >= 0 ? 'tone-green' : 'tone-danger';
        var ml = new Date(m + '-02').toLocaleString('en-AU', { month: 'short', year: 'numeric' });
        rows += '<div class="sp-mo-row">'
          + '<div class="sp-mo-month">' + ml + '</div>'
          + '<input type="number" step="1000" value="' + bal + '" inputmode="decimal"'
          + ' onchange="superMonthUpdate(\'' + a.id + '\',\'' + m + '\',this.value)"'
          + ' class="sp-mo-input"/>'
          + (diffStr ? '<div class="sp-mo-diff ' + diffTone + '">' + diffStr + '</div>' : '<div class="sp-mo-diff-empty"></div>')
          + '<button onclick="superMonthDel(\'' + a.id + '\',\'' + m + '\')" class="sp-mo-del">' + ICON('trash') + '</button>'
          + '</div>';
      });
    }

    html += '<div class="sp-mo-card">'
      + '<div class="sp-mo-hd">'
      + '<div class="sp-mo-dot" style="background:' + item.color + '"></div>'
      + '<div class="sp-mo-main">'
      + '<div class="sp-mo-fund">' + esc(a.fund || 'Unknown Fund') + '</div>'
      + '<div class="sp-mo-type">' + item.profileLabel + ' · ' + esc(a.type || 'Accumulation') + '</div>'
      + '</div>'
      + '<div class="sp-mo-cur">Current: <span class="sp-mo-cur-val" style="color:' + item.color + '">' + fmt(parseFloat(a.balance) || 0) + '</span></div>'
      + '</div>'
      + rows
      + '<div class="sp-mo-add">'
      + '<div class="sp-field"><label class="sp-mo-lbl">Month</label>'
      + '<select id="super-mo-inp-' + a.id + '" class="sp-mo-sel">' + _superMonthlyMonthOpts(curMo) + '</select></div>'
      + '<div class="sp-field sp-field--sm"><label class="sp-mo-lbl">Closing Balance (AUD)</label>'
      + '<input type="number" id="super-mo-bal-' + a.id + '" placeholder="0" step="1000" inputmode="decimal" class="sp-input-16"/></div>'
      + '<button class="btn btn-primary btn-sm sp-mo-save" onclick="superMonthSave(\'' + a.id + '\')">Save</button>'
      + '</div>'
      + '</div>';
  });

  el.innerHTML = '<div class="card mb">' + html + '</div>';
}

// ASFA-aligned growth scenarios (net return after fees shown; fees split separately)
var SUPER_SCENARIOS = {
  conservative: { ret: 4.7,  fees: 1.2,  label: 'Conservative' },
  balanced:     { ret: 6.4,  fees: 0.9,  label: 'Balanced' },
  growth:       { ret: 7.7,  fees: 0.7,  label: 'Growth' },
  highgrowth:   { ret: 9.2,  fees: 0.7,  label: 'High Growth' }
};

function superApplyScenario(profile, scenario) {
  if (!scenario || !SUPER_SCENARIOS[scenario]) return;
  var s   = SUPER_SCENARIOS[scenario];
  var pfx = profile === 'b' ? 'sb' : 'ss';
  var retEl  = document.getElementById(pfx + '-return');
  var feesEl = document.getElementById(pfx + '-fees');
  if (retEl)  retEl.value  = s.ret;
  if (feesEl) feesEl.value = s.fees;
  calcSuper();
}

function renderSuperPage(){
  const fill=(id,v)=>{const e=document.getElementById(id);if(e&&v!==undefined&&v!==null&&!e.matches(':focus'))e.value=v;};
  const d=SUPER;
  if(d.b){
    ['balance','age','retire','salary','sgc','extra'].forEach(f=>fill('sb-'+f,d.b[f]));
    fill('sb-inflation',d.b.inflation);
    fill('sb-return', d.b.ret !== undefined ? d.b.ret : 7);
    fill('sb-fees',   d.b.fees !== undefined ? d.b.fees : 0.8);
  }
  if(d.s){
    ['balance','age','retire','salary','sgc','extra'].forEach(f=>fill('ss-'+f,d.s[f]));
    fill('ss-return',d.s.ret);fill('ss-fees',d.s.fees);fill('ss-inflation',d.s.inflation);
  }
  // Render multi-account lists, sync totals, then render table
  renderSuperAcctList('b');
  renderSuperAcctList('s');
  superSyncBalance('b');
  superSyncBalance('s');
  renderSuperAggTable();
  renderSuperMonthlyGrid();
  showSuperResults();renderSuperChart();renderD293Section();
}

// ══════════════════════════════════════════════════════════════
// ART LIFECYCLE SUPER PROJECTION FOR BRENTON
// ══════════════════════════════════════════════════════════════

// ART Lifecycle return rates by age band (net of fees approx)
// Source: ART 10yr returns, High Growth ~8.77%, Balanced ~7.5%, transitioning blended
function artLifecycleReturn(age){
  if(age<50) return{ret:8.5,fees:0.67,label:'High Growth Pool (~85% growth)'};
  if(age<53) return{ret:7.5,fees:0.67,label:'Transitioning to Balanced'};
  if(age<56) return{ret:6.5,fees:0.67,label:'Mixed High Growth / Balanced'};
  if(age<60) return{ret:5.5,fees:0.67,label:'Mostly Balanced Pool'};
  return{ret:4.5,fees:0.67,label:'Balanced / Cash Pool'};
}

// Override projectSuper for profile 1 to use ART lifecycle year-by-year
function projectSuperLifecycle(d){
  const yrs=Math.max(0,(d.retire||67)-(d.age||40));
  const infl=(d.inflation||2.5)/100;
  let bal=d.balance||0,sal=d.salary||0,cumInfl=1;
  const rows=[{age:d.age,nominal:bal,real:bal,pool:artLifecycleReturn(d.age).label}];
  for(let y=1;y<=yrs;y++){
    const currentAge=(d.age||40)+y-1;
    const{ret,fees}=artLifecycleReturn(currentAge);
    const r=(ret-fees)/100;
    const contrib=sal*(d.sgc||11.5)/100+(d.extra||0);
    bal=bal*(1+r)+contrib;sal*=1.03;cumInfl*=(1+infl);
    rows.push({age:currentAge+1,nominal:bal,real:bal/cumInfl,pool:artLifecycleReturn(currentAge+1).label});
  }
  return rows;
}



// ══════════════════════════════════════════════════════════════
// LIFE INSURANCE NEEDS ANALYSIS
// All three methods: DIME, 10x Income, Needs (PV). IP: 90d/age65. TPD independent.
// ══════════════════════════════════════════════════════════════


