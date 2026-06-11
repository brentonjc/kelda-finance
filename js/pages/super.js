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
    el.innerHTML = '<div style="font-size:.8rem;color:var(--muted);text-align:center;padding:12px 0">No super accounts added yet. Use the + Add Super Account button in each profile below.</div>';
    return;
  }

  var rows = '';
  var profileColor = { brenton:'var(--primary)', shelley:'#818CF8' };

  function profileRows(accts, name, total, colorKey) {
    if (!accts.length) return '';
    var r = '';
    accts.forEach(function(a, i) {
      r += '<tr>'
        + (i === 0 ? '<td rowspan="' + (accts.length+1) + '" style="font-weight:700;color:' + (colorKey==='brenton'?profileColor.brenton:profileColor.shelley) + ';vertical-align:top;padding:8px 12px 8px 0;border-bottom:1px solid var(--border);white-space:nowrap">' + esc(name) + '</td>' : '')
        + '<td style="padding:6px 12px;font-size:.83rem;color:var(--text)">' + esc(a.fund||'—') + '</td>'
        + '<td style="padding:6px 12px;font-size:.83rem;color:var(--muted)">' + esc(a.type||'—') + '</td>'
        + '<td style="padding:6px 12px;font-family:var(--font-mono);font-size:.83rem;text-align:right;color:var(--text)">' + fmt(a.balance||0) + '</td>'
        + '</tr>';
    });
    // Subtotal row
    r += '<tr style="border-top:1px solid var(--border)">'
      + '<td colspan="2" style="padding:6px 12px;font-size:.78rem;font-weight:700;color:var(--muted)">Total — ' + esc(name) + '</td>'
      + '<td style="padding:6px 12px;font-family:var(--font-mono);font-weight:700;font-size:.88rem;text-align:right;color:' + (colorKey==='brenton'?profileColor.brenton:profileColor.shelley) + ';border-bottom:2px solid var(--border)">' + fmt(total) + '</td>'
      + '</tr>';
    return r;
  }

  rows += profileRows(bAccts, bName, bTotal, 'brenton');
  rows += profileRows(sAccts, sName, sTotal, 'shelley');

  // Combined row
  rows += '<tr style="background:rgba(240,83,138,.06)">'
    + '<td style="padding:8px 12px 8px 0;font-weight:700;font-size:.88rem;color:var(--text)">Combined</td>'
    + '<td colspan="2" style="padding:8px 12px;font-size:.78rem;color:var(--muted)">' + (bAccts.length + sAccts.length) + ' account' + (bAccts.length+sAccts.length!==1?'s':'') + '</td>'
    + '<td style="padding:8px 12px;font-family:var(--font-mono);font-weight:700;font-size:1rem;text-align:right;color:var(--success)">' + fmt(combined) + '</td>'
    + '</tr>';

  el.innerHTML = '<div style="overflow-x:auto;-webkit-overflow-scrolling:touch">'
    + '<table style="width:100%;border-collapse:collapse;min-width:360px">'
    + '<thead><tr style="border-bottom:2px solid var(--border)">'
    + '<th style="text-align:left;padding:6px 12px 8px 0;font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)">Profile</th>'
    + '<th style="text-align:left;padding:6px 12px;font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)">Fund</th>'
    + '<th style="text-align:left;padding:6px 12px;font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)">Type</th>'
    + '<th style="text-align:right;padding:6px 12px;font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)">Balance</th>'
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
    el.innerHTML = '<div style="font-size:.78rem;color:var(--muted);padding:6px 0">No accounts added yet.</div>';
    return;
  }
  el.innerHTML = accts.map(function(a) {
    return '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);flex-wrap:wrap" id="super-acct-row-' + pfx + '-' + a.id + '">'
      + '<div style="flex:1;min-width:120px">'
      + '<div style="font-weight:700;font-size:.85rem">' + esc(a.fund||'Unknown Fund') + '</div>'
      + '<div style="font-size:.72rem;color:var(--muted)">' + esc(a.type||'Accumulation') + '</div>'
      + '</div>'
      + '<div style="font-family:var(--font-mono);font-weight:700;font-size:.9rem;color:var(--primary)">' + fmt(a.balance||0) + '</div>'
      + '<div style="display:flex;gap:4px;flex-shrink:0">'
      + '<button class="btn btn-ghost btn-sm" onclick="superEditAcct(\'' + pfx + '\',\'' + a.id + '\')">Edit</button>'
      + '<button class="del-btn" onclick="superDeleteAcct(\'' + pfx + '\',\'' + a.id + '\')">🗑</button>'
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
  if (!fund) { toast('Please enter a fund name'); return; }
  if (!SUPER_ACCTS[key]) SUPER_ACCTS[key] = [];
  var id = 'sa_' + Date.now().toString(36);
  SUPER_ACCTS[key].push({ id: id, fund: fund, balance: bal, type: type });
  superSaveAccts();
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
  rowEl.innerHTML = '<div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;width:100%;padding:4px 0">'
    + '<div style="flex:1;min-width:140px"><label class="lbl" style="font-size:.7rem">Fund Name</label><input type="text" id="super-edit-fund-' + pfx + '-' + id + '" value="' + esc(a.fund||'') + '" style="font-size:16px;width:100%;box-sizing:border-box"/></div>'
    + '<div style="flex:1;min-width:120px"><label class="lbl" style="font-size:.7rem">Balance (AUD)</label><input type="number" id="super-edit-bal-' + pfx + '-' + id + '" value="' + (a.balance||0) + '" step="1000" inputmode="decimal" style="width:100%;box-sizing:border-box"/></div>'
    + '<div style="flex:1;min-width:140px"><label class="lbl" style="font-size:.7rem">Type</label><select id="super-edit-type-' + pfx + '-' + id + '" style="width:100%;box-sizing:border-box">'
    + _SUPER_TYPES.map(function(t){ return '<option value="' + t + '"' + (t===a.type?' selected':'') + '>' + t + '</option>'; }).join('')
    + '</select></div>'
    + '<div style="display:flex;gap:6px;flex-shrink:0">'
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
  superSaveAccts();
  _superRefresh(pfx);
  toast('✅ Updated — ' + a.fund);
}

function _superRefresh(pfx) {
  renderSuperAcctList(pfx);
  superSyncBalance(pfx);
  renderSuperAggTable();
  calcSuper();
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

// Override projectSuper for Brenton to use ART lifecycle year-by-year
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


