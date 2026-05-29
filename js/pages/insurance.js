// INSURANCE
// ══════════════════════════════════════════════════════════════
const INS_META={
  'Home & Contents':{icon:'🏠',color:'#7c5cbf',bg:'var(--card3)'},
  'Car / Vehicle':  {icon:'🚗',color:'#e8457a',bg:'var(--primary-bg)'},
  'Health':         {icon:'❤️',color:'#f04060',bg:'var(--danger-bg)'},
  'Life':           {icon:'💛',color:'#f0a040',bg:'var(--warn-bg)'},
  'Income Protection':{icon:'🛡️',color:'#a29bfe',bg:'var(--card3)'},
  'TPD':             {icon:'♿',color:'#f0a040',bg:'var(--warn-bg)'},
  'Travel':         {icon:'✈️',color:'#74b9ff',bg:'var(--card2)'},
  'Pet':            {icon:'🐾',color:'#f07aaa',bg:'var(--primary-bg)'},
  'Business':       {icon:'💼',color:'#8a8095',bg:'var(--card2)'},
  'Other':          {icon:'📋',color:'#8a8095',bg:'var(--card2)'},
};
function insToAnnual(amt,freq){return(amt||0)*({monthly:12,annual:1,quarterly:4,fortnightly:26}[freq]||1);}
function daysTilRenewal(ds){if(!ds)return null;return Math.ceil((new Date(ds)-new Date())/(864e5));}

function insTypeChanged(){
  const type=document.getElementById('ins-type')?.value||'';
  const ipF=document.getElementById('ins-ip-fields');
  const tpdF=document.getElementById('ins-tpd-fields');
  if(ipF)  ipF.style.display  = type==='Income Protection'?'block':'none';
  if(tpdF) tpdF.style.display = type==='TPD'?'block':'none';
}

function addInsurance(){
  const g=id=>document.getElementById(id);
  const name=(g('ins-name')?.value||'').trim();
  const type=g('ins-type')?.value||'';
  const prov=(g('ins-prov')?.value||'').trim();
  const prem=parseFloat(g('ins-prem')?.value)||0;
  const freq=g('ins-freq')?.value||'annual';
  const renewal=g('ins-renewal')?.value||'';
  const covered=g('ins-covered')?.value||'joint';
  const cover=parseFloat(g('ins-cover')?.value)||0;
  const notes=(g('ins-notes')?.value||'').trim();
  if(!name){toast('⚠️ Enter a policy name');return;}
  if(!prem){toast('⚠️ Enter a premium amount');return;}
  const pol={id:Date.now(),name,type,prov,prem,freq,renewal,covered,cover,notes};
  // IP-specific
  if(type==='Income Protection'){
    pol.ipBenefit=parseFloat(g('ins-ip-benefit')?.value)||0;
    pol.ipPeriod=g('ins-ip-period')?.value||'age65';
    pol.ipWait=g('ins-ip-wait')?.value||'90';
  }
  // TPD-specific
  if(type==='TPD'){
    pol.tpdDef=g('ins-tpd-def')?.value||'own';
  }
  INS.push(pol);
  try{save(K.ins,INS);}catch(e){console.error('Insurance save error:',e);}
  ['ins-name','ins-prov','ins-prem','ins-renewal','ins-cover','ins-notes',
   'ins-ip-benefit'].forEach(id=>{const e=g(id);if(e)e.value='';});
  renderInsurance();
  toast('✅ Policy saved — '+(INS.length)+' polic'+(INS.length===1?'y':'ies'));
}

function delIns(id){INS=INS.filter(p=>p.id!==id);save(K.ins,INS);renderInsurance();toast('🗑️ Removed');}

function renderInsurance(){
  const filter=document.getElementById('ins-filter')?.value||'';
  // Summary strip
  const total=INS.reduce((s,p)=>s+insToAnnual(p.prem,p.freq),0);
  const soon=INS.filter(p=>{const d=daysTilRenewal(p.renewal);return d!==null&&d>=0&&d<=60;}).length;
  document.getElementById('ins-summary-strip').innerHTML=`
    <div class="stat stat-pink"><div class="sl">Annual Cost</div><div class="sv">${fmt(total)}</div><div class="ss">${INS.length} polic${INS.length===1?'y':'ies'}</div></div>
    <div class="stat stat-purple"><div class="sl">Monthly Avg</div><div class="sv">${fmt(total/12)}</div><div class="ss">averaged per month</div></div>
    <div class="stat ${soon?'stat-rose':'stat-dark'}"><div class="sl">Renewals ≤60 Days</div><div class="sv">${soon}</div><div class="ss">${soon?'Action needed':'All clear'}</div></div>`;

  // Renewals
  const upcoming=[...INS].filter(p=>p.renewal).sort((a,b)=>new Date(a.renewal)-new Date(b.renewal)).filter(p=>{const d=daysTilRenewal(p.renewal);return d!==null&&d>=-365;});
  document.getElementById('ins-renewals').innerHTML=upcoming.length
    ?upcoming.map(p=>{const d=daysTilRenewal(p.renewal);const style=d<0?'color:var(--danger)':d<=30?'color:var(--warn)':'color:var(--success)';const lbl=d<0?Math.abs(d)+'d overdue':d===0?'Today!':d+'d';
      const m=INS_META[p.type]||INS_META['Other'];
      return`<div class="dr"><div class="dr-k">${m.icon} ${p.name}</div><div style="display:flex;gap:12px;align-items:center"><div class="dr-v" style="${style}">${lbl}</div><div style="font-size:.76rem;color:var(--muted)">${fmt(insToAnnual(p.prem,p.freq))}/yr</div></div></div>`;}).join('')
    :'<div class="empty" style="padding:16px 0"><div class="ei">📅</div><p>No upcoming renewals</p></div>';

  // Coverage
  renderInsCoverage();

  // Policy list
  const el=document.getElementById('ins-list');
  const filtered=filter?INS.filter(p=>p.type===filter):INS;
  if(!filtered.length){el.innerHTML='<div class="empty"><div class="ei">🛡️</div><p>'+(filter?'No '+filter+' policies':' No policies yet')+'</p></div>';return;}
  el.innerHTML=filtered.map(p=>{
    const m=INS_META[p.type]||INS_META['Other'];
    const d=daysTilRenewal(p.renewal);
    const rbc=d===null?'':d<0?'b-overdue':d<=30?'b-due':'b-paid';
    const rlbl=d===null?'No date':d<0?'Overdue '+Math.abs(d)+'d':d===0?'Today!':'Renews '+d+'d';
    const rdate=p.renewal?new Date(p.renewal+'T00:00:00').toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'}):'—';
    const cov=p.covered==='brenton'?getUserName('brenton'):p.covered==='shelley'?getUserName('shelley'):'Both';
    const fl={monthly:'mo',annual:'yr',quarterly:'qtr',fortnightly:'fn'}[p.freq]||p.freq;
    return`<div class="ins-card">
      <div class="ins-icon" style="background:${m.bg};color:${m.color}">${m.icon}</div>
      <div class="ins-body">
        <div class="ins-name">${p.name}</div>
        <div class="ins-prov">${p.prov||p.type}</div>
        <div class="ins-tags">
          <span class="ins-tag" style="background:${m.bg};color:${m.color}">${p.type}</span>
          <span class="badge ${rbc}">${rlbl} · ${rdate}</span>
          <span class="ins-tag" style="background:var(--card2);color:var(--muted)">👤 ${cov}</span>
          ${p.notes?`<span class="ins-tag" style="background:var(--card2);color:var(--muted)">📝 ${p.notes}</span>`:''}
          ${p.type==='Income Protection'&&p.ipBenefit?`<span class="ins-tag" style="background:var(--card3);color:var(--purple)">${fmt(p.ipBenefit)}/mo · ${p.ipWait||90}d wait · to ${p.ipPeriod==='age65'?'age 65':p.ipPeriod}</span>`:''}
          ${p.type==='TPD'&&p.tpdDef?`<span class="ins-tag" style="background:var(--warn-bg);color:var(--warn)">${p.tpdDef==='own'?'Own Occupation':'Any Occupation'} TPD</span>`:''}
        </div>
      </div>
      <div>
        <div class="ins-amt" style="color:${m.color}">${fmt(p.prem)}<small>/${fl}</small></div>
        <div style="font-size:.68rem;color:var(--muted);text-align:right;margin-top:2px">${fmt(insToAnnual(p.prem,p.freq))}/yr</div>
        <div style="text-align:right;margin-top:7px"><button class="del-btn" onclick="delIns(${p.id})">🗑</button></div>
      </div></div>`;
  }).join('');
}

function renderInsCoverage(){
  const el=document.getElementById('ins-coverage');if(!el)return;
  const types=['Life','Income Protection'];
  const people=['brenton','shelley','joint'];
  const pName=p=>p==='brenton'?getUserName('brenton'):p==='shelley'?getUserName('shelley'):'Joint';
  const sum={};
  people.forEach(p=>{sum[p]={};types.forEach(t=>{sum[p][t]={cover:0,need:0};});});
  INS.filter(p=>types.includes(p.type)).forEach(pol=>{
    const p=pol.covered||'joint';
    if(sum[p]&&sum[p][pol.type]){sum[p][pol.type].cover+=pol.cover||0;sum[p][pol.type].need+=pol.need||0;}
  });
  const hasData=INS.some(p=>types.includes(p.type));
  if(!hasData){el.innerHTML='<div class="empty" style="padding:12px 0"><div class="ei">🛡️</div><p>Add Life or Income Protection policies with Sum Insured and Cover Need to see gap analysis</p></div>';return;}
  let html='';
  people.forEach(p=>{
    const hasAny=types.some(t=>sum[p]?.[t]?.cover>0||sum[p]?.[t]?.need>0);
    if(!hasAny)return;
    html+=`<div class="cov-section"><div class="cov-hd">${pName(p)}</div>`;
    types.forEach(t=>{
      const d=sum[p]?.[t]||{cover:0,need:0};
      if(!d.cover&&!d.need)return;
      const pct=d.need>0?Math.min(100,(d.cover/d.need)*100):100;
      const cls=pct>=100?'':pct>=70?'warn':'over';
      const gap=d.need-d.cover;
      const status=gap<=0?`<span style="color:var(--success);font-weight:700">✅ Fully covered</span>`:`<span style="color:var(--warn);font-weight:700">⚠️ Gap: ${fmt(gap)}</span>`;
      html+=`<div class="prog-wrap"><div class="prog-hd"><span class="prog-lbl">${t}</span><span class="prog-val">${fmt(d.cover)} of ${fmt(d.need)||'—'} needed</span></div>
        <div class="prog-track"><div class="prog-fill ${cls}" style="width:${pct.toFixed(0)}%"></div></div>
        <div style="display:flex;justify-content:space-between;margin-top:3px"><span style="font-size:.7rem;color:var(--muted)">${pct.toFixed(0)}% covered</span>${status}</div></div>`;
    });
    html+='</div>';
  });
  el.innerHTML=html||'<div class="empty" style="padding:10px 0"><p>No coverage data yet</p></div>';
}

// ══════════════════════════════════════════════════════════════
// SUPERANNUATION
// ══════════════════════════════════════════════════════════════
let superChart=null;

function projectSuper(d){
  const yrs=Math.max(0,(d.retire||67)-(d.age||40));
  const r=((d.ret||7)-(d.fees||0.8))/100;
  const infl=(d.inflation||2.5)/100;
  let bal=d.balance||0,sal=d.salary||0,cumInfl=1;
  const rows=[{age:d.age,nominal:bal,real:bal}];
  for(let y=1;y<=yrs;y++){
    const contrib=sal*(d.sgc||11.5)/100+(d.extra||0);
    bal=bal*(1+r)+contrib;sal*=1.03;cumInfl*=(1+infl);
    rows.push({age:(d.age||40)+y,nominal:bal,real:bal/cumInfl});
  }
  return rows;
}

function calcSuper(){
  const g=(id)=>parseFloat(document.getElementById(id)?.value)||0;
  SUPER.b={balance:g('sb-balance'),age:g('sb-age'),retire:g('sb-retire'),salary:g('sb-salary'),
    sgc:g('sb-sgc'),extra:g('sb-extra'),inflation:g('sb-inflation'),useLifecycle:true};
  SUPER.s={balance:g('ss-balance'),age:g('ss-age'),retire:g('ss-retire'),salary:g('ss-salary'),
    sgc:g('ss-sgc'),extra:g('ss-extra'),ret:g('ss-return'),fees:g('ss-fees'),inflation:g('ss-inflation')};
  save(K.superdata,SUPER);
  // Update ART lifecycle current pool badge
  const currentAge=g('sb-age');
  if(currentAge){
    const pool=artLifecycleReturn(currentAge);
    const el=document.getElementById('sb-lifecycle-current');
    if(el)el.textContent=`Current pool for age ${currentAge}: ${pool.label} (${pool.ret}% gross / ${(pool.ret-pool.fees).toFixed(2)}% net)`;
  }
  showSuperResults();renderSuperChart();renderD293Section();
}

function showSuperResults(){
  ['b','s'].forEach(p=>{
    const d=SUPER[p];const el=document.getElementById('s'+p+'-result');if(!el)return;
    if(!d?.age||!d?.retire||!d?.salary){el.innerHTML='';return;}
    // Use lifecycle projection for Brenton, standard for Shelley
    const rows=p==='b'&&d.useLifecycle?projectSuperLifecycle(d):projectSuper(d);
    const final=rows[rows.length-1];
    const sgcAmt=(d.salary||0)*(d.sgc||11.5)/100;
    const methodNote=p==='b'?'ART Lifecycle (age-adjusted returns)':'Standard projection';
    el.innerHTML=`<div style="text-align:center;padding:10px;background:var(--primary-bg);border-radius:10px;margin-bottom:10px">
      <div style="font-size:.68rem;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:3px">At age ${d.retire}</div>
      <div style="font-family:var(--font-display);font-size:1.6rem;font-weight:700;color:var(--primary)">${fmt(final.nominal)}</div>
      <div style="font-size:.72rem;color:var(--muted)">Real: ${fmt(final.real)} · Drawdown: ${fmt(final.nominal*.04/12)}/mo</div>
      <div style="font-size:.68rem;color:var(--purple);margin-top:3px">${methodNote}</div></div>
      <div class="dr"><span class="dr-k">Annual SGC</span><span class="dr-v">${fmt(sgcAmt)}</span></div>
      <div class="dr"><span class="dr-k">Years to retire</span><span class="dr-v">${(d.retire||67)-(d.age||40)} yrs</span></div>`;
  });
}

function renderSuperChart(){
  const rowsB=SUPER.b?.age?(SUPER.b.useLifecycle?projectSuperLifecycle(SUPER.b):projectSuper(SUPER.b)):[];
  const rowsS=SUPER.s?.age?projectSuper(SUPER.s):[];
  const now=new Date().getFullYear();
  const maxLen=Math.max(rowsB.length,rowsS.length);
  if(!maxLen)return;
  const labels=Array.from({length:maxLen},(_,i)=>now+i);
  const ctx=document.getElementById('super-chart')?.getContext('2d');if(!ctx)return;
  if(superChart)superChart.destroy();
  const insToken=function(n){return getComputedStyle(document.documentElement).getPropertyValue(n).trim()||'';};
  superChart= safeChart(ctx,{
    type:'line',
    data:{labels,datasets:[
      {label:getUserName('brenton'),data:rowsB.map(r=>r.nominal),borderColor:'#e8457a',backgroundColor:'#e8457a22',fill:true,tension:.3,pointRadius:2,spanGaps:true},
      {label:getUserName('shelley'),data:rowsS.map(r=>r.nominal),borderColor:'#a29bfe',backgroundColor:'#a29bfe22',fill:true,tension:.3,pointRadius:2,spanGaps:true},
      {label:'Combined',data:labels.map((_,i)=>(rowsB[i]?.nominal||0)+(rowsS[i]?.nominal||0)),borderColor:'#f0a040',borderDash:[6,3],borderWidth:2.5,backgroundColor:'transparent',pointRadius:2,spanGaps:true},
    ]},
    options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},
      plugins:{legend:{position:'bottom',labels:{font:{family:'Inter',size:11},padding:13,color:insToken('--muted')}},
        tooltip:{callbacks:{label:c=>' '+c.dataset.label+': '+fmt(c.parsed.y)}}},
      scales:{x:{grid:{display:false},ticks:{font:{family:'Inter'},color:insToken('--muted')}},
        y:{grid:{color:insToken('--card3')},ticks:{font:{family:'Inter'},color:insToken('--muted'),callback:v=>'$'+Math.round(v/1000)+'k'}}}}
  });

  const fB=rowsB.length?rowsB[rowsB.length-1].nominal:0;
  const fS=rowsS.length?rowsS[rowsS.length-1].nominal:0;
  const combo=fB+fS;
  document.getElementById('super-combined').innerHTML=`
    <div class="g3">
      <div class="stat stat-pink"><div class="sl">${getUserName('brenton')} at ${SUPER.b?.retire||67}</div><div class="sv">${fmt(fB)}</div></div>
      <div class="stat stat-dark"><div class="sl">${getUserName('shelley')} at ${SUPER.s?.retire||67}</div><div class="sv">${fmt(fS)}</div></div>
      <div class="stat stat-purple"><div class="sl">Combined</div><div class="sv">${fmt(combo)}</div><div class="ss">${fmt(combo*.04/12)}/mo (4% rule)</div></div>
    </div>`;
}




// ══════════════════════════════════════════════════════════════
// LIFE INSURANCE NEEDS ANALYSIS
// All three methods: DIME, 10x Income, Needs (PV). IP: 90d/age65. TPD independent.
// ══════════════════════════════════════════════════════════════

let liActiveTab = 'all';

function liSwitchTab(tab) {
  liActiveTab = tab;
  ['all','dime','income','needs'].forEach(t => {
    const el = document.getElementById('li-tab-' + t);
    if (!el) return;
    if (t === tab) {
      el.style.background = 'var(--primary)';
      el.style.color = '#fff';
    } else {
      el.style.background = 'transparent';
      el.style.color = 'var(--muted)';
    }
  });
  calcLifeNeeds();
}

function calcLifeNeeds() {
  ['b','s'].forEach(p => {
    const pre = 'li-' + p + '-';
    const g = id => parseFloat(document.getElementById(pre + id)?.value) || 0;
    const income    = g('income');
    const years     = g('years') || 25;
    const debts     = g('debts');
    const mortgage  = g('mortgage');
    const education = g('education');
    const funeral   = g('funeral') || 15000;
    const assets    = g('assets');
    const existing  = g('existing');
    const el = document.getElementById('li-' + p + '-result');
    if (!el) return;
    if (!income) { el.innerHTML = ''; return; }

    // Age: use manual input first, then fall back to Super tab data
    const ageInput = parseFloat(document.getElementById('li-' + p + '-age')?.value) || 0;
    const superAge = p === 'b' ? (SUPER.b?.age || 0) : (SUPER.s?.age || 0);
    const age = ageInput || superAge || (p === 'b' ? 40 : 38);
    const yearsTo65 = Math.max(0, 65 - age);

    // ── Method 1: DIME ───────────────────────────────────────────
    // D = Debts, I = Income × years, M = Mortgage, E = Education + Funeral
    const dimeGross = debts + (income * years) + mortgage + education + funeral;
    const dimeLife  = Math.max(0, dimeGross - assets - existing);

    // ── Method 2: 10× Income ────────────────────────────────────
    const incGross  = income * 10;
    const incLife   = Math.max(0, incGross - assets - existing);

    // ── Method 3: Needs Analysis (PV of income stream) ──────────
    const disc      = 0.05; // 5% real discount rate
    const pvIncome  = income * (1 - Math.pow(1 + disc, -years)) / disc;
    const needsGross= pvIncome + debts + mortgage + education + funeral;
    const needsLife = Math.max(0, needsGross - assets - existing);

    // ── TPD (independent from Life) ─────────────────────────────
    // Lump sum: PV of income to age 65 + debts + mortgage + mods allowance
    const modAllowance = 50000; // home/vehicle modifications allowance
    const tpdIncomePV  = income * (1 - Math.pow(1 + disc, -yearsTo65)) / disc;
    const tpdGross     = tpdIncomePV + debts + mortgage + funeral + modAllowance;
    const tpdNeed      = Math.max(0, tpdGross - assets);

    // ── Income Protection (90-day wait, to age 65) ──────────────
    const ipMonthly    = income * 0.75 / 12;  // 75% of gross income
    const ipAnnual     = ipMonthly * 12;
    const ipBenefitYrs = yearsTo65;

    // ── Existing cover — manual inputs take precedence over policy log ──
    const existLife   = INS.filter(i => i.type === 'Life' && (i.covered === p || i.covered === 'joint')).reduce((s,i) => s + (i.cover || 0), 0);
    const polTPD      = INS.filter(i => i.type === 'TPD'  && (i.covered === p || i.covered === 'joint')).reduce((s,i) => s + (i.cover || 0), 0);
    const polIPmthly  = INS.filter(i => i.type === 'Income Protection' && (i.covered === p || i.covered === 'joint')).reduce((s,i) => s + (i.ipBenefit || (i.cover / 12) || 0), 0);
    // Manual existing cover inputs (override/supplement policy log)
    const manualTPD   = parseFloat(document.getElementById('li-' + p + '-exist-tpd')?.value) || 0;
    const manualIPmo  = parseFloat(document.getElementById('li-' + p + '-exist-ip')?.value)  || 0;
    // Use manual if entered, otherwise fall back to detected policies
    const existTPD    = manualTPD > 0 ? manualTPD : polTPD;
    const existIP     = manualIPmo > 0 ? manualIPmo : polIPmthly;
    const allExistLife = existLife + existing; // include manually entered existing life cover

    // ── Pick "recommended" based on tab ─────────────────────────
    const recLife = liActiveTab === 'dime'   ? dimeLife
                  : liActiveTab === 'income' ? incLife
                  : liActiveTab === 'needs'  ? needsLife
                  : Math.max(dimeLife, incLife, needsLife); // 'all' = most conservative

    const lifeGap = Math.max(0, recLife - allExistLife);
    const tpdGap  = Math.max(0, tpdNeed - existTPD);
    const ipGap   = Math.max(0, ipAnnual - existIP);

    const color = p === 'b' ? 'var(--primary)' : 'var(--purple)';
    const bg    = p === 'b' ? 'var(--primary-bg)' : 'var(--card3)';

    // Build method comparison boxes
    const showAll    = liActiveTab === 'all';
    const showDime   = showAll || liActiveTab === 'dime';
    const showIncome = showAll || liActiveTab === 'income';
    const showNeeds  = showAll || liActiveTab === 'needs';

    function methodBox(title, gross, net, gap, cols) {
      const gapStyle = gap > 0 ? 'li-gap-bad' : 'li-gap-ok';
      const gapText  = gap > 0 ? 'Gap: ' + fmt(gap) : 'Covered';
      return '<div class="li-method-box">'
        + '<div class="li-method-title">' + title + '</div>'
        + '<div class="li-method-amount" style="color:' + color + '">' + fmt(net) + '</div>'
        + '<div style="font-size:.7rem;color:var(--muted);margin-top:3px">Gross need: ' + fmt(gross) + ' · Less assets/existing: ' + fmt(assets + existing) + '</div>'
        + '<div style="margin-top:6px;font-size:.74rem;font-weight:700" class="' + gapStyle + '">' + gapText + '</div>'
        + (cols || '')
        + '</div>';
    }

    function dimeBreakdown() {
      return '<details style="margin-top:8px"><summary style="font-size:.72rem;color:var(--muted);cursor:pointer">Breakdown</summary>'
        + '<div style="margin-top:6px">'
        + '<div class="li-dr"><span class="li-dr-k">D — Debts</span><span class="li-dr-v">' + fmt(debts) + '</span></div>'
        + '<div class="li-dr"><span class="li-dr-k">I — Income × ' + years + ' yrs</span><span class="li-dr-v">' + fmt(income * years) + '</span></div>'
        + '<div class="li-dr"><span class="li-dr-k">M — Mortgage</span><span class="li-dr-v">' + fmt(mortgage) + '</span></div>'
        + '<div class="li-dr"><span class="li-dr-k">E — Education + Funeral</span><span class="li-dr-v">' + fmt(education + funeral) + '</span></div>'
        + '<div class="li-dr"><span class="li-dr-k">Less: Savings / Super</span><span class="li-dr-v" style="color:var(--success)">-' + fmt(assets) + '</span></div>'
        + '<div class="li-dr"><span class="li-dr-k">Less: Existing Cover</span><span class="li-dr-v" style="color:var(--success)">-' + fmt(existing) + '</span></div>'
        + '</div></details>';
    }

    function coverBar(actual, need, label) {
      const pct = need > 0 ? Math.min(100, (actual / need) * 100) : 100;
      const cls = pct >= 100 ? '' : pct >= 70 ? 'warn' : 'over';
      const gapAmt = Math.max(0, need - actual);
      const gapClass = gapAmt > 0 ? (pct >= 70 ? 'li-gap-warn' : 'li-gap-bad') : 'li-gap-ok';
      const gapText  = gapAmt > 0 ? 'Gap: ' + fmt(gapAmt) : 'Covered';
      return '<div class="li-cover-row">'
        + '<div class="li-cover-hd"><span class="li-cover-lbl">' + label + '</span><span class="li-cover-val">' + fmt(actual) + ' covered of ' + fmt(need) + ' needed</span></div>'
        + '<div class="prog-track"><div class="prog-fill ' + cls + '" style="width:' + pct.toFixed(0) + '%"></div></div>'
        + '<div style="display:flex;justify-content:space-between;margin-top:3px;font-size:.7rem">'
        + '<span style="color:var(--muted)">' + pct.toFixed(0) + '% covered</span>'
        + '<span class="' + gapClass + '">' + gapText + '</span></div></div>';
    }

    el.innerHTML = ''
      + (showDime   ? methodBox('DIME Method',         dimeGross,  dimeLife,  lifeGap, dimeBreakdown()) : '')
      + (showIncome ? methodBox('10× Income Method',   incGross,   incLife,   lifeGap, '') : '')
      + (showNeeds  ? methodBox('Needs Analysis (PV)', needsGross, needsLife, lifeGap, '<div style="font-size:.7rem;color:var(--muted);margin-top:4px">PV of ' + years + ' yrs income at 5% discount rate</div>') : '')
      + '<div style="margin-top:14px">'
      + coverBar(allExistLife, recLife, '💛 Life Cover (recommended)')
      + coverBar(existTPD, tpdNeed, '♿ TPD Cover (independent, to age 65)')
      + coverBar(existIP * 12, ipAnnual, '🛡️ Income Protection (annual) — current: '
          + fmt(existIP) + '/mo · needed: ' + fmt(ipMonthly) + '/mo to age 65')
      + '</div>'
      + '<details style="margin-top:10px"><summary style="font-size:.74rem;color:var(--muted);cursor:pointer">TPD &amp; IP calculation detail</summary>'
      + '<div style="margin-top:8px">'
      + '<div class="li-dr"><span class="li-dr-k">TPD: PV of income to age 65 (' + yearsTo65 + ' yrs)</span><span class="li-dr-v">' + fmt(tpdIncomePV) + '</span></div>'
      + '<div class="li-dr"><span class="li-dr-k">TPD: Home/vehicle modifications allowance</span><span class="li-dr-v">' + fmt(modAllowance) + '</span></div>'
      + '<div class="li-dr"><span class="li-dr-k">TPD: Less existing savings/super</span><span class="li-dr-v" style="color:var(--success)">-' + fmt(assets) + '</span></div>'
      + '<div class="li-dr"><span class="li-dr-k">IP: 75% of income/month needed (90-day wait)</span><span class="li-dr-v">' + fmt(ipMonthly) + '/mo</span></div>'
      + '<div class="li-dr"><span class="li-dr-k">IP: Existing cover (manual input)</span><span class="li-dr-v">' + (manualIPmo > 0 ? fmt(manualIPmo) + '/mo' : polIPmthly > 0 ? fmt(polIPmthly) + '/mo (from policies)' : 'None entered') + '</span></div>'
      + '<div class="li-dr"><span class="li-dr-k">TPD: Existing cover (manual input)</span><span class="li-dr-v">' + (manualTPD > 0 ? fmt(manualTPD) : polTPD > 0 ? fmt(polTPD) + ' (from policies)' : 'None entered') + '</span></div>'
      + '<div class="li-dr"><span class="li-dr-k">IP: Benefit period</span><span class="li-dr-v">To age 65 (' + yearsTo65 + ' yrs)</span></div>'
      + '</div></details>';
  });
}

// ══════════════════════════════════════════════════════════════
// DIVISION 293 TAX — FULL BREAKDOWN
// ══════════════════════════════════════════════════════════════

const D293_THRESHOLD = 250000;
const D293_RATE      = 0.15;
const CONC_CAP       = 30000;   // 2024-25 concessional cap
const SUPER_TAX      = 0.15;    // standard contributions tax

// Australian 2024-25 marginal rates (incl 2% Medicare)
function marginalRate(income) {
  if (income > 190000) return 0.47;
  if (income > 135000) return 0.39;
  if (income > 45000)  return 0.345;
  if (income > 18200)  return 0.21;
  return 0;
}

function calcDiv293(salary, sgcPct, extraConc) {
  const sgcAmt   = salary * (sgcPct / 100);
  const totalConc = Math.min(sgcAmt + (extraConc || 0), CONC_CAP);
  const incomeTest = salary + totalConc;            // ATO income test includes concessional contribs
  const taxableAmt = Math.max(0, Math.min(totalConc, incomeTest - D293_THRESHOLD));
  const d293Tax    = taxableAmt * D293_RATE;
  const stdTax     = totalConc * SUPER_TAX;
  const totalTax   = stdTax + d293Tax;
  const effRate    = totalConc > 0 ? totalTax / totalConc : SUPER_TAX;
  const netContrib = totalConc - totalTax;

  // After-tax benefit: tax saved vs receiving as salary
  const margRate     = marginalRate(salary);
  const taxSavingVsSalary = totalConc * margRate;   // income tax avoided
  const netBenefitVsSalary = taxSavingVsSalary - totalTax;

  // Net super growth impact (extra tax cost reduces compounding base)
  // Extra tax from Div 293 vs no Div 293
  const extraTaxDue = d293Tax;

  return {
    salary, sgcAmt, extraConc: extraConc || 0, totalConc,
    incomeTest, taxableAmt, d293Tax, stdTax, totalTax, effRate,
    netContrib, margRate, taxSavingVsSalary, netBenefitVsSalary,
    extraTaxDue, applies: taxableAmt > 0, capHit: totalConc >= CONC_CAP
  };
}

function renderD293Section() {
  const el = document.getElementById('d293-cards');
  if (!el) return;

  const people = [
    { key:'b', name:getUserName('brenton'), d:SUPER.b, color:'#e8457a', grad:'linear-gradient(135deg,#8b1a4a,#e8457a)' },
    { key:'s', name:getUserName('shelley'), d:SUPER.s, color:'#a29bfe', grad:'linear-gradient(135deg,#3a2060,#7c5cbf)' },
  ];

  el.innerHTML = people.map(p => {
    if (!p.d?.salary) {
      return '<div class="d293-person"><div class="d293-hd" style="background:' + p.grad + '">'
        + '<span style="font-weight:700;color:#fff">' + p.name + '</span></div>'
        + '<div class="d293-body" style="color:var(--muted);font-size:.82rem">Enter salary in the Superannuation tab to calculate.</div></div>';
    }

    const r = calcDiv293(p.d.salary, p.d.sgc || 11.5, p.d.extra || 0);

    // Super growth impact: if $d293Tax is paid from super, how much less at retirement
    const age     = p.d.age     || (p.key === 'b' ? 40 : 38);
    const retire  = p.d.retire  || 67;
    const yrs     = Math.max(0, retire - age);
    const retRate = p.key === 'b' ? ((artLifecycleReturn(age).ret - artLifecycleReturn(age).fees) / 100)
                                  : ((p.d.ret || 7) - (p.d.fees || 0.8)) / 100;
    // FV of $d293Tax paid annually = d293Tax * ((1+r)^n - 1) / r
    const annualD293FV = r.d293Tax > 0 && yrs > 0 && retRate > 0
      ? r.d293Tax * (Math.pow(1 + retRate, yrs) - 1) / retRate
      : r.d293Tax * yrs;

    const badge = r.applies ? '<span class="d293-applies">Div 293 Applies</span>'
                             : '<span class="d293-na">Below Threshold</span>';

    return '<div class="d293-person">'
      + '<div class="d293-hd" style="background:' + p.grad + '">'
      + '<div><span style="font-weight:700;color:#fff;font-size:.92rem">' + p.name + '</span>'
      + '<span style="margin-left:10px;font-size:.72rem;color:rgba(255,255,255,.75)">' + fmt(p.d.salary) + '/yr</span></div>'
      + badge + '</div>'
      + '<div class="d293-body">'
      + '<div class="d293-row"><span class="d293-k">Annual Salary</span><span class="d293-v">' + fmt(r.salary) + '</span></div>'
      + '<div class="d293-row"><span class="d293-k">SGC Contributions (' + (p.d.sgc||11.5) + '%)</span><span class="d293-v">' + fmt(r.sgcAmt) + '</span></div>'
      + (r.extraConc > 0 ? '<div class="d293-row"><span class="d293-k">Extra Concessional</span><span class="d293-v">' + fmt(r.extraConc) + '</span></div>' : '')
      + '<div class="d293-row"><span class="d293-k">Total Concessional</span><span class="d293-v">' + fmt(r.totalConc) + (r.capHit ? ' <span style="color:var(--warn);font-size:.7rem">(cap)</span>' : '') + '</span></div>'
      + '<div class="d293-row"><span class="d293-k">Income Test Total</span><span class="d293-v">' + fmt(r.incomeTest) + '</span></div>'
      + '<div class="d293-row"><span class="d293-k">Div 293 Threshold</span><span class="d293-v">$250,000</span></div>'
      + '<div class="d293-row"><span class="d293-k">Amount Subject to Div 293</span><span class="d293-v" style="color:' + (r.applies ? 'var(--danger)' : 'var(--muted)') + '">' + (r.applies ? fmt(r.taxableAmt) : 'Nil') + '</span></div>'
      + '<div style="height:1px;background:var(--border);margin:10px 0"></div>'
      + '<div class="d293-row"><span class="d293-k">Standard Contributions Tax (15%)</span><span class="d293-v">-' + fmt(r.stdTax) + '</span></div>'
      + '<div class="d293-row"><span class="d293-k">Div 293 Additional Tax (15%)</span><span class="d293-v" style="color:' + (r.applies ? 'var(--danger)' : 'var(--muted)') + '">' + (r.applies ? '-' + fmt(r.d293Tax) : 'Nil') + '</span></div>'
      + '<div class="d293-row"><span class="d293-k">Total Tax on Contributions</span><span class="d293-v" style="color:var(--danger)">-' + fmt(r.totalTax) + '</span></div>'
      + '<div class="d293-row"><span class="d293-k">Effective Contribution Tax Rate</span><span class="d293-v" style="color:' + (r.effRate > 0.2 ? 'var(--danger)' : 'var(--success)') + '">' + (r.effRate * 100).toFixed(1) + '%</span></div>'
      + '<div class="d293-row"><span class="d293-k">Net After-Tax Contribution</span><span class="d293-v" style="color:var(--success)">' + fmt(r.netContrib) + '</span></div>'
      + '<div style="height:1px;background:var(--border);margin:10px 0"></div>'
      + '<div class="d293-row"><span class="d293-k">Marginal Income Tax Rate</span><span class="d293-v">' + (r.margRate * 100).toFixed(1) + '%</span></div>'
      + '<div class="d293-row"><span class="d293-k">Income Tax Saved vs Salary</span><span class="d293-v" style="color:var(--success)">+' + fmt(r.taxSavingVsSalary) + '</span></div>'
      + '<div class="d293-row"><span class="d293-k">Net Benefit vs Taking as Salary</span><span class="d293-v" style="color:' + (r.netBenefitVsSalary > 0 ? 'var(--success)' : 'var(--danger)') + '">' + (r.netBenefitVsSalary >= 0 ? '+' : '') + fmt(r.netBenefitVsSalary) + '</span></div>'
      + (r.applies ? '<div class="d293-row"><span class="d293-k">Div 293 cost FV at retirement (' + yrs + ' yrs)</span><span class="d293-v" style="color:var(--danger)">-' + fmt(annualD293FV) + '</span></div>' : '')
      + '<div class="d293-callout">'
      + '<strong style="color:' + p.color + '">Summary:</strong> '
      + (r.applies
        ? 'Div 293 applies. Your contributions tax rises from 15% to ' + (r.effRate * 100).toFixed(1) + '%. '
          + 'The ATO will issue a ' + fmt(r.d293Tax) + ' assessment. You can pay from super or your own funds. '
          + 'Super is still advantageous (saves ' + fmt(r.netBenefitVsSalary) + '/yr vs salary). '
          + 'Over ' + yrs + ' years the extra Div 293 tax compounds to ~' + fmt(annualD293FV) + ' less at retirement.'
        : 'Div 293 does not apply. Standard 15% contributions tax applies. '
          + 'Super contributions save ' + fmt(r.taxSavingVsSalary) + '/yr in income tax, netting ' + fmt(r.netBenefitVsSalary) + '/yr vs taking as salary.')
      + '</div>'
      + '</div></div>';
  }).join('');
}

// ══════════════════════════════════════════════════════════════
// RATE SENSITIVITY CALCULATOR
