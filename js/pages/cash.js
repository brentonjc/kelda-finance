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

function ctMonthOpts(sel){
  const now=new Date();
  let o='';
  for(let i=0;i<36;i++){
    const d=new Date(now.getFullYear(),now.getMonth()-i,1);
    const v=d.toISOString().slice(0,7);
    const l=d.toLocaleString('default',{month:'long',year:'numeric'});
    o+=`<option value="${v}" ${v===sel?'selected':''}>${l}</option>`;
  }
  return o;
}

function ctSaveEntry(acctId,month,value){
  if(!CT[acctId])CT[acctId]={};
  const v=parseFloat(value);
  if(!isNaN(v))CT[acctId][month]=v;else delete CT[acctId][month];
  save(K.ct,CT);ctRenderSummary();ctRenderChart();ctRenderNet();ctGoalStatus();
  // Auto-sync offset to mortgage tab whenever offset account is updated
  if(acctId==='offset')syncOffsetToMortgage();
}

function ctDelEntry(acctId,month){
  if(CT[acctId])delete CT[acctId][month];
  save(K.ct,CT);renderCashTracker();
}

function ctAddMonth(id){
  const mSel=document.getElementById('ct-add-m-'+id);
  const bInp=document.getElementById('ct-add-b-'+id);
  if(!mSel||!bInp)return;
  const m=mSel.value,b=parseFloat(bInp.value);
  if(!m||isNaN(b)){toast('⚠️ Select month and enter balance');return;}
  ctSaveEntry(id,m,b);bInp.value='';renderCashTracker();toast('✅ Saved');
}

function renderCashTracker(){
  // Populate config fields
  const cfg=CTCFG;
  const f=(id,v)=>{const el=document.getElementById(id);if(el&&!el.matches(':focus'))el.value=v||'';};
  f('ct-offset-lbl',cfg.offsetLbl);f('ct-home-lbl',cfg.homeLbl);
  f('ct-sav1-lbl',cfg.sav1Lbl);f('ct-sav2-lbl',cfg.sav2Lbl);
  // Goal fields
  const ga=document.getElementById('ct-goal-amt');
  const gf=document.getElementById('ct-goal-freq');
  const gs=document.getElementById('ct-goal-start');
  if(ga&&!ga.matches(':focus')&&cfg.goalAmt)ga.value=cfg.goalAmt;
  if(gf&&cfg.goalFreq)gf.value=cfg.goalFreq;
  if(gs&&!gs.matches(':focus')&&cfg.goalStart)gs.value=cfg.goalStart;

  CT_ACCTS.forEach(a=>ctRenderAcct(a));
  ctRenderSummary();ctRenderChart();ctRenderNet();ctGoalStatus();
}

function ctRenderAcct(a){
  const el=document.getElementById('ct-acct-'+a.id);if(!el)return;
  const data=CT[a.id]||{};
  const months=Object.keys(data).sort();
  const label=ctLabel(a);
  const latest=months.length?data[months[months.length-1]]:0;
  const nowYM=new Date().toISOString().slice(0,7);

  let rows='';
  if(!months.length)rows='<div class="empty" style="padding:16px 0"><div class="ei">📅</div><p>Add your first month below</p></div>';
  else months.forEach((m,i)=>{
    const bal=data[m];
    const prev=i>0?data[months[i-1]]:null;
    const diff=prev!==null?bal-prev:null;
    const cls=diff===null?'':diff>0?'up':'dn';
    const dt=diff===null?'':((diff>=0?'+':'')+fmt(diff));
    const ml=new Date(m+'-02').toLocaleString('default',{month:'short',year:'numeric'});
    rows+=`<div class="mo-row">
      <div class="mo-lbl">${ml}</div>
      <input class="mo-inp" type="number" step="100" value="${bal}" onchange="ctSaveEntry('${a.id}','${m}',this.value)"/>
      <div class="mo-ch ${cls}">${dt}</div>
      <button class="del-btn" onclick="ctDelEntry('${a.id}','${m}')">🗑</button>
    </div>`;
  });

  el.innerHTML=`
    <div class="acct-hd" style="background:${a.light}">
      <div class="acct-ic" style="background:${a.color}">${a.icon}</div>
      <div class="acct-meta"><div class="acct-title" style="color:${a.color}">${label}</div>
        <div class="acct-sub" style="color:${a.color}">${a.id==='sav1'?getUserName('brenton'):a.id==='sav2'?getUserName('shelley'):'Shared'}</div></div>
      <div class="acct-total" style="color:${a.color}">${fmt(latest)}</div>
    </div>
    <div class="acct-body">${rows}
      <div class="add-mo-row">
        <div><label class="lbl" style="font-size:.68rem">Month</label><select id="ct-add-m-${a.id}">${ctMonthOpts(nowYM)}</select></div>
        <div><label class="lbl" style="font-size:.68rem">Balance</label><input type="number" id="ct-add-b-${a.id}" placeholder="e.g. 85000" step="100" style="width:140px" onkeydown="if(event.key==='Enter')ctAddMonth('${a.id}')"/></div>
        <button class="btn btn-primary btn-sm" onclick="ctAddMonth('${a.id}')" style="margin-top:20px">＋ Add</button>
      </div>
    </div>`;
}

function ctRenderSummary(){
  const el=document.getElementById('ct-summary');if(!el)return;
  const months=ctAllMonths();
  const lm=months.length?months[months.length-1]:null;
  const tots=CT_ACCTS.map(a=>lm?((CT[a.id]||{})[lm]||0):0);
  const grand=tots.reduce((s,v)=>s+v,0);
  el.innerHTML=''
    +'<div class="stat stat-pink"><div class="sl">Combined Total</div><div class="sv">'+fmt(grand)+'</div><div class="ss">All 4 accounts</div></div>'
    +'<div class="stat stat-purple"><div class="sl">Shared Accounts</div><div class="sv">'+fmt(tots[0]+tots[1])+'</div><div class="ss">Offset + Home</div></div>'
    +'<div class="stat stat-rose"><div class="sl">'+getUserName('brenton')+' Savings</div><div class="sv">'+fmt(tots[2])+'</div><div class="ss">'+ctLabel(CT_ACCTS[2])+'</div></div>'
    +'<div class="stat stat-dark"><div class="sl">'+getUserName('shelley')+' Savings</div><div class="sv">'+fmt(tots[3])+'</div><div class="ss">'+ctLabel(CT_ACCTS[3])+'</div></div>';
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
