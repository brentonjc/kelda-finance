// ══════════════════════════════════════════════════════════════
// CASH TRACKER
// ══════════════════════════════════════════════════════════════
// CT_ACCTS — built dynamically from ACCOUNTS (data.js) so new accounts appear automatically.
// Falls back to the original 4 if ACCOUNTS is unavailable.
var _CT_ACCTS_DEFAULTS = [
  {id:'offset',icon:'🏦',color:'#e8457a',light:'#2a1030',owner:'shared',def:'Offset Account'},
  {id:'home',  icon:'🏠',color:'#7c5cbf',light:'#1e1535',owner:'shared',def:'Home Transaction'},
  {id:'sav1',  icon:'💰',color:'#f07aaa',light:'#261225',owner:'brenton',def:'Brenton Savings'},
  {id:'sav2',  icon:'💎',color:'#a29bfe',light:'#1e1635',owner:'shelley',def:'Shelley Savings'}
];
function _buildCTAccts() {
  if (typeof ACCOUNTS !== 'undefined' && ACCOUNTS && ACCOUNTS.length) {
    return ACCOUNTS.map(function(a) {
      var def = _CT_ACCTS_DEFAULTS.find(function(d){ return d.id === a.id; }) || {};
      return {
        id:    a.id,
        icon:  a.icon  || def.icon  || '🏦',
        color: a.color || def.color || '#e8457a',
        light: def.light || '#2a1030',
        owner: a.owner || def.owner || 'shared',
        def:   a.name  || def.def   || a.id
      };
    });
  }
  return _CT_ACCTS_DEFAULTS;
}
var CT_ACCTS = _buildCTAccts();

function ctLabel(a){
  return getAccountName(a.id) || a.def;
}

function saveCTConfig(){
  CTCFG.offsetLbl=document.getElementById('ct-offset-lbl').value.trim();
  CTCFG.homeLbl=document.getElementById('ct-home-lbl').value.trim();
  CTCFG.sav1Lbl=document.getElementById('ct-sav1-lbl').value.trim();
  CTCFG.sav2Lbl=document.getElementById('ct-sav2-lbl').value.trim();
  save(K.ctcfg,CTCFG);renderCashTracker();
}

function saveCTGoal(){
  CTCFG.goalAmt=parseFloat(document.getElementById('ct-goal-amt').value)||0;
  CTCFG.goalFreq=document.getElementById('ct-goal-freq').value;
  CTCFG.goalStart=document.getElementById('ct-goal-start').value;
  save(K.ctcfg,CTCFG);ctRenderChart();ctGoalStatus();
}

function ctAllMonths(){
  const s=new Set();
  CT_ACCTS.forEach(a=>{Object.keys(CT[a.id]||{}).forEach(m=>s.add(m));});
  return[...s].sort();
}

// Local YYYY-MM string — avoids the toISOString() UTC timezone trap
// (e.g. in AEST +10, midnight May 1 = April 30 UTC → wrong month stored)
function ctYM(d) {
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0');
}
function ctTodayYM() { return ctYM(new Date()); }
function ctTodayISO() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

function ctMonthOpts(sel){
  const now=new Date();
  let o='';
  for(let i=0;i<36;i++){
    const d=new Date(now.getFullYear(),now.getMonth()-i,1);
    const v=ctYM(d); // FIX: was d.toISOString().slice(0,7) — wrong in UTC+10/11
    const l=d.toLocaleString('en-AU',{month:'long',year:'numeric'});
    o+='<option value="'+v+'"'+(v===sel?' selected':'')+'>'+l+'</option>';
  }
  return o;
}

function ctSaveEntry(acctId, month, value, entryDate) {
  if (!CT[acctId]) CT[acctId] = {};
  var v = parseFloat(value);
  if (!isNaN(v)) {
    CT[acctId][month] = v;
    // Save the entry date (when the user actually logged this balance)
    if (!CT_DATES[acctId]) CT_DATES[acctId] = {};
    CT_DATES[acctId][month] = entryDate || ctTodayISO();
    save(K.ctdates, CT_DATES);
  } else {
    delete CT[acctId][month];
    if (CT_DATES[acctId]) delete CT_DATES[acctId][month];
    save(K.ctdates, CT_DATES);
  }
  save(K.ct, CT);
  ctRenderSummary(); ctRenderChart(); ctRenderNet(); ctGoalStatus();
  if (acctId === 'offset') syncOffsetToMortgage();
}

function ctDelEntry(acctId, month) {
  if (CT[acctId]) delete CT[acctId][month];
  if (CT_DATES[acctId]) delete CT_DATES[acctId][month];
  save(K.ct, CT);
  save(K.ctdates, CT_DATES);
  renderCashTracker();
}

function ctAddMonth(id) {
  var mSel = document.getElementById('ct-add-m-' + id);
  var bInp = document.getElementById('ct-add-b-' + id);
  var dInp = document.getElementById('ct-add-d-' + id);
  if (!mSel || !bInp) return;
  var m = mSel.value;
  var b = parseFloat(bInp.value);
  if (!m || isNaN(b)) { toast('⚠️ Select month and enter balance'); return; }
  var entryDate = (dInp && dInp.value) ? dInp.value : ctTodayISO();
  ctSaveEntry(id, m, b, entryDate);
  bInp.value = '';
  renderCashTracker();
  toast('✅ Saved');
}

function renderCashTracker() {
  // Rebuild CT_ACCTS from ACCOUNTS in case accounts were added/removed in Settings
  CT_ACCTS = _buildCTAccts();

  // Config fields (legacy labels — still sync for backward compat)
  var cfg = CTCFG;
  var f = function(id, v) { var el = document.getElementById(id); if (el && !el.matches(':focus')) el.value = v || ''; };
  f('ct-offset-lbl', cfg.offsetLbl); f('ct-home-lbl', cfg.homeLbl);
  f('ct-sav1-lbl', cfg.sav1Lbl); f('ct-sav2-lbl', cfg.sav2Lbl);
  var ga = document.getElementById('ct-goal-amt');
  var gf = document.getElementById('ct-goal-freq');
  var gs = document.getElementById('ct-goal-start');
  if (ga && !ga.matches(':focus') && cfg.goalAmt) ga.value = cfg.goalAmt;
  if (gf && cfg.goalFreq) gf.value = cfg.goalFreq;
  if (gs && !gs.matches(':focus') && cfg.goalStart) gs.value = cfg.goalStart;

  // Dynamically ensure a card div exists for every account (supports custom accounts)
  var container = document.getElementById('ct-accts-container');
  if (container) {
    CT_ACCTS.forEach(function(a) {
      if (!document.getElementById('ct-acct-' + a.id)) {
        var div = document.createElement('div');
        div.id = 'ct-acct-' + a.id;
        div.className = 'acct-card';
        container.appendChild(div);
      }
    });
    // Remove cards for deleted accounts
    var cards = container.querySelectorAll('[id^="ct-acct-"]');
    cards.forEach(function(el) {
      var acctId = el.id.replace('ct-acct-', '');
      if (!CT_ACCTS.find(function(a) { return a.id === acctId; })) {
        container.removeChild(el);
      }
    });
  }

  CT_ACCTS.forEach(function(a) { ctRenderAcct(a); });
  ctRenderSummary(); ctRenderChart(); ctRenderNet(); ctGoalStatus();
}

function ctRenderAcct(a) {
  var el = document.getElementById('ct-acct-' + a.id);
  if (!el) return;
  var data   = CT[a.id] || {};
  var dates  = CT_DATES[a.id] || {};
  var months = Object.keys(data).sort();
  var label  = ctLabel(a);
  var latest = months.length ? data[months[months.length - 1]] : 0;
  var nowYM  = ctTodayYM(); // FIX: was new Date().toISOString().slice(0,7) — UTC offset bug

  var rows = '';
  if (!months.length) {
    rows = '<div class="empty" style="padding:16px 0"><div class="ei">📅</div><p>No entries yet — add your first balance below.</p></div>';
  } else {
    for (var i = 0; i < months.length; i++) {
      var m    = months[i];
      var bal  = data[m];
      var prev = i > 0 ? data[months[i - 1]] : null;
      var diff = prev !== null ? bal - prev : null;
      var cls  = diff === null ? '' : diff > 0 ? 'up' : 'dn';
      var dt   = diff === null ? '' : ((diff >= 0 ? '+' : '') + fmt(diff));
      // Month label — use +'-02' to avoid UTC offset misread of the month key itself
      var ml   = new Date(m + '-02').toLocaleString('en-AU', { month: 'short', year: 'numeric' });
      // Entry date — when the user logged this balance
      var entryDateRaw = dates[m] || null;
      var entryDateLbl = '';
      if (entryDateRaw) {
        var ed = new Date(entryDateRaw + 'T12:00:00'); // noon local to avoid UTC bleed
        entryDateLbl = '<span class="mo-entry-date">Updated '
          + ed.toLocaleString('en-AU', { day:'numeric', month:'short' })
          + '</span>';
      }
      rows += '<div class="mo-row">'
        + '<div class="mo-lbl">' + ml + entryDateLbl + '</div>'
        + '<input class="mo-inp" type="number" step="100" value="' + bal + '"'
        + ' onchange="ctSaveEntry(\'' + a.id + '\',\'' + m + '\',this.value)"'
        + ' inputmode="decimal"/>'
        + '<div class="mo-ch ' + cls + '">' + dt + '</div>'
        + '<button class="del-btn" onclick="ctDelEntry(\'' + a.id + '\',\'' + m + '\')">🗑</button>'
        + '</div>';
    }
  }

  // Owner label
  var ownerLbl = a.id === 'sav1' ? getUserName('brenton')
               : a.id === 'sav2' ? getUserName('shelley')
               : (a.owner === 'shared' ? 'Shared' : (a.owner || 'Shared'));

  el.innerHTML = '<div class="acct-hd" style="background:' + a.light + '">'
    + '<div class="acct-ic" style="background:' + a.color + '">' + a.icon + '</div>'
    + '<div class="acct-meta">'
    + '<div class="acct-title" style="color:' + a.color + '">' + label + '</div>'
    + '<div class="acct-sub" style="color:' + a.color + '">' + ownerLbl + '</div>'
    + '</div>'
    + '<div class="acct-total" style="color:' + a.color + '">' + fmt(latest) + '</div>'
    + '</div>'
    + '<div class="acct-body">' + rows
    + '<div class="add-mo-row">'
    + '<div><label class="lbl" style="font-size:.68rem">Month</label>'
    + '<select id="ct-add-m-' + a.id + '">' + ctMonthOpts(nowYM) + '</select></div>'
    + '<div><label class="lbl" style="font-size:.68rem">Closing Balance</label>'
    + '<input type="number" id="ct-add-b-' + a.id + '" placeholder="e.g. 85000" step="100"'
    + ' style="width:140px" inputmode="decimal"'
    + ' onkeydown="if(event.key===\'Enter\')ctAddMonth(\'' + a.id + '\')" /></div>'
    + '<div><label class="lbl" style="font-size:.68rem">Date Updated</label>'
    + '<input type="date" id="ct-add-d-' + a.id + '" value="' + ctTodayISO() + '" style="width:145px"/></div>'
    + '<button class="btn btn-primary btn-sm" onclick="ctAddMonth(\'' + a.id + '\')" style="margin-top:20px">＋ Add</button>'
    + '</div>'
    + '</div>';
}

function ctRenderSummary(){
  const el=document.getElementById('ct-summary');if(!el)return;
  const months=ctAllMonths();
  const lm=months.length?months[months.length-1]:null;
  const tots=CT_ACCTS.map(a=>lm?((CT[a.id]||{})[lm]||0):0);
  const grand=tots.reduce((s,v)=>s+v,0);
  // Dynamic breakdown by owner: sum all accounts, then by owner type
  const byOwner={shared:0,brenton:0,shelley:0,other:0};
  CT_ACCTS.forEach((a,i)=>{
    const owner=a.owner||'other';
    byOwner[owner]=(byOwner[owner]||0)+tots[i];
  });
  let html='<div class="stat stat-pink"><div class="sl">Combined Total</div><div class="sv">'+fmt(grand)+'</div><div class="ss">All '+CT_ACCTS.length+' accounts</div></div>';
  if(byOwner.shared>0){html+='<div class="stat stat-purple"><div class="sl">Shared</div><div class="sv">'+fmt(byOwner.shared)+'</div><div class="ss">Shared accounts</div></div>';}
  if(byOwner.brenton>0){html+='<div class="stat stat-rose"><div class="sl">'+getUserName('brenton')+'</div><div class="sv">'+fmt(byOwner.brenton)+'</div><div class="ss">'+getUserName('brenton')+' accounts</div></div>';}
  if(byOwner.shelley>0){html+='<div class="stat stat-dark"><div class="sl">'+getUserName('shelley')+'</div><div class="sv">'+fmt(byOwner.shelley)+'</div><div class="ss">'+getUserName('shelley')+' accounts</div></div>';}
  el.innerHTML=html;
}

let ctChart=null;
function ctRenderChart(){
  const months=ctAllMonths();
  const canvas=document.getElementById('ct-chart');if(!canvas)return;
  const labels=months.map(m=>new Date(m+'-02').toLocaleString('default',{month:'short',year:'2-digit'}));
  const datasets=CT_ACCTS.map(a=>({
    label:ctLabel(a),
    data:months.map(m=>(CT[a.id]||{})[m]!==undefined?(CT[a.id]||{})[m]:null),
    borderColor:a.color,backgroundColor:a.color+'22',pointRadius:4,tension:.3,fill:false,spanGaps:true
  }));
  const combined=months.map(m=>CT_ACCTS.reduce((s,a)=>s+((CT[a.id]||{})[m]||0),0));
  datasets.push({label:'Combined',data:combined,borderColor:'#fff',borderDash:[6,3],borderWidth:2.5,
    backgroundColor:'transparent',pointRadius:3,tension:.3,fill:false,spanGaps:true});

  // Goal line
  const {goalAmt,goalFreq,goalStart}=CTCFG;
  if(goalAmt&&months.length){
    const mTarget=goalFreq==='annual'?goalAmt/12:goalAmt;
    const startM=goalStart&&months.includes(goalStart)?goalStart:months[0];
    const startIdx=months.indexOf(startM);
    const startBal=CT_ACCTS.reduce((s,a)=>s+((CT[a.id]||{})[startM]||0),0);
    datasets.push({
      label:`${goalFreq==='annual'?fmt(goalAmt)+'/yr':fmt(mTarget)+'/mo'} Goal`,
      data:months.map((_,i)=>i<startIdx?null:startBal+(i-startIdx)*mTarget),
      borderColor:'#f0a040',backgroundColor:'transparent',borderDash:[8,4],borderWidth:2.5,
      pointRadius:0,pointHoverRadius:4,tension:0,fill:false,spanGaps:true
    });
  }

  const ctx=canvas.getContext('2d');
  if(ctChart)ctChart.destroy();
  if(!months.length){ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#8a8095';ctx.font='14px Inter';ctx.textAlign='center';ctx.fillText('Add balances to see the chart',canvas.width/2,135);return;}
  ctChart= safeChart(ctx,{
    type:'line',data:{labels,datasets},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      plugins:{legend:{position:'bottom',labels:{font:{family:'Inter',size:11},padding:13,color:'#8a8095'}},
        tooltip:{callbacks:{label:c=>' '+c.dataset.label+': '+fmt(c.parsed.y)}}},
      scales:{x:{grid:{display:false},ticks:{font:{family:'Inter'},color:'#8a8095'}},
        y:{grid:{color:'#2a2535'},ticks:{font:{family:'Inter'},color:'#8a8095',callback:v=>'$'+v.toLocaleString()}}}}
  });
}

function ctGoalStatus(){
  const el=document.getElementById('ct-goal-status');if(!el)return;
  const {goalAmt,goalFreq}=CTCFG;
  if(!goalAmt){el.textContent='Set a target to see progress';return;}
  const months=ctAllMonths();if(!months.length){el.textContent='';return;}
  const lm=months[months.length-1];
  const combined=CT_ACCTS.reduce((s,a)=>s+((CT[a.id]||{})[lm]||0),0);
  const annualTarget=goalFreq==='annual'?goalAmt:goalAmt*12;
  const gap=annualTarget-combined;
  if(gap<=0){el.innerHTML='<span style="color:var(--success);font-weight:700">✅ Goal reached! '+fmt(combined)+'</span>';return;}
  const prevM=months.length>1?months[months.length-2]:null;
  const prevCombined=prevM?CT_ACCTS.reduce((s,a)=>s+((CT[a.id]||{})[prevM]||0),0):0;
  const mGrowth=prevM?(combined-prevCombined):0;
  const eta=mGrowth>0?Math.ceil(gap/mGrowth):null;
  const etaStr=eta?'· ETA ~'+(eta<12?eta+'mo':Math.round(eta/12*10)/10+'yrs'):'';
  el.innerHTML=`<span style="color:var(--warn);font-weight:600">⬆ ${fmt(gap)} to go ${etaStr}</span>`;
}

function ctRenderNet(){
  const el=document.getElementById('ct-net');if(!el)return;
  const months=ctAllMonths();
  if(!months.length){el.innerHTML='<div class="empty" style="padding:14px"><p>No data yet</p></div>';return;}
  const lm=months[months.length-1];
  const pm=months.length>1?months[months.length-2]:null;
  let grandNow=0,grandPrev=0;
  let rows='';
  CT_ACCTS.forEach(a=>{
    const now=(CT[a.id]||{})[lm]||0;
    const prev=pm?((CT[a.id]||{})[pm]||0):null;
    grandNow+=now;if(prev!==null)grandPrev+=prev;
    const diff=prev!==null?now-prev:null;
    const ds=diff===null?'—':`<span style="color:${diff>=0?'var(--success)':'var(--danger)'};font-weight:600">${diff>=0?'+':''}${fmt(diff)}</span>`;
    rows+=`<div class="dr"><div class="dr-k">${a.icon} ${ctLabel(a)}</div><div style="display:flex;gap:18px;align-items:center"><div class="dr-v">${fmt(now)}</div><div style="min-width:80px;text-align:right;font-size:.76rem">${ds}</div></div></div>`;
  });
  const gd=grandNow-grandPrev;
  rows+=`<div class="dr" style="background:var(--card2);border-radius:8px;padding:8px 10px;margin-top:6px">
    <div class="dr-k" style="font-weight:700">Combined Total</div>
    <div style="display:flex;gap:18px;align-items:center">
      <div style="font-family:var(--font-display);font-size:1.05rem;font-weight:700;color:var(--primary)">${fmt(grandNow)}</div>
      <div style="min-width:80px;text-align:right;font-size:.76rem"><span style="color:${gd>=0?'var(--success)':'var(--danger)'};font-weight:600">${gd>=0?'+':''}${fmt(gd)}</span></div>
    </div></div>`;
  el.innerHTML = rows;
}

function ctToggleExplainer() {
  var body    = document.getElementById('ct-exp-body');
  var chevron = document.getElementById('ct-exp-chevron');
  if (!body) return;
  var open = body.style.display !== 'none';
  body.style.display = open ? 'none' : 'block';
  if (chevron) chevron.style.transform = open ? '' : 'rotate(180deg)';
}

function ctExportCSV(){
  const months=ctAllMonths();if(!months.length){toast('⚠️ No data to export');return;}
  const hdrs=['Month',...CT_ACCTS.map(a=>ctLabel(a)),'Combined'];
  const rows=months.map(m=>{
    const vals=CT_ACCTS.map(a=>(CT[a.id]||{})[m]||'');
    const tot=CT_ACCTS.reduce((s,a)=>s+((CT[a.id]||{})[m]||0),0);
    return[new Date(m+'-02').toLocaleString('default',{month:'long',year:'numeric'}),...vals,tot].join(',');
  });
  const blob=new Blob([[hdrs.join(','),...rows].join('\n')],{type:'text/csv'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='kelda-cash-balances.csv';a.click();
  toast('📄 Exported!');
}

// ══════════════════════════════════════════════════════════════
// INSURANCE
