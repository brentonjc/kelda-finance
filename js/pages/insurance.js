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

var insEditingId=null;

function insTypeChanged(){
  const type=document.getElementById('ins-type')?.value||'';
  const ipF=document.getElementById('ins-ip-fields');
  const tpdF=document.getElementById('ins-tpd-fields');
  if(ipF)  ipF.style.display  = type==='Income Protection'?'block':'none';
  if(tpdF) tpdF.style.display = type==='TPD'?'block':'none';
  insAutoFillNeed();
}

// Auto-fill Cover Need from the needs analysis inputs when type/person changes
function insAutoFillNeed(){
  const type    = document.getElementById('ins-type')?.value||'';
  const covered = document.getElementById('ins-covered')?.value||'joint';
  const needEl  = document.getElementById('ins-need');
  const ipBenEl = document.getElementById('ins-ip-benefit');
  const hintEl  = document.getElementById('ins-need-hint');

  // Map covered person → needs analysis prefix
  // For 'joint' use the higher of the two needs as a guide
  function getNeedForPfx(pfx){
    const n = _computeNeedsData(pfx);
    if(!n) return null;
    if(type==='Life')              return { need: Math.round(n.recLife),  ip: null };
    if(type==='TPD')               return { need: Math.round(n.tpdNeed), ip: null };
    if(type==='Income Protection') return { need: Math.round(n.ipAnnual), ip: Math.round(n.ipMonthly) };
    return null;
  }

  let result = null;
  let hint   = '';
  if(covered === 'brenton'){
    result = getNeedForPfx('b');
    hint   = result ? 'Auto-filled from '+getUserName('brenton')+'\'s needs analysis' : '';
  } else if(covered === 'shelley'){
    result = getNeedForPfx('s');
    hint   = result ? 'Auto-filled from '+getUserName('shelley')+'\'s needs analysis' : '';
  } else {
    // Joint — use higher of the two needs
    const rb = getNeedForPfx('b');
    const rs = getNeedForPfx('s');
    if(rb && rs)      { result = { need: Math.max(rb.need, rs.need), ip: rb.ip && rs.ip ? Math.max(rb.ip, rs.ip) : (rb.ip||rs.ip) }; hint='Auto-filled (higher of both profiles)'; }
    else if(rb||rs)   { result = rb||rs; hint='Auto-filled from available profile data'; }
  }

  if(!result){ if(hintEl) hintEl.textContent='Enter income in the Needs Analysis above to auto-fill'; return; }
  if(needEl && result.need > 0){ needEl.value = result.need; }
  if(ipBenEl && result.ip  > 0){ ipBenEl.value = result.ip; }
  if(hintEl) hintEl.textContent = hint;
}

function insShowEditModal(id){
  insEditingId=id;
  const pol=INS.find(p=>p.id===id);
  if(!pol)return;
  const g=fId=>{const e=document.getElementById('ins-edit-'+fId);if(e)return e;return document.getElementById('ins-'+fId);};
  if(g('name'))g('name').value=pol.name;
  if(g('type')){g('type').value=pol.type;insEditTypeChanged();}
  if(g('prov'))g('prov').value=pol.prov||'';
  if(g('prem'))g('prem').value=pol.prem;
  if(g('freq'))g('freq').value=pol.freq||'annual';
  if(g('renewal'))g('renewal').value=pol.renewal||'';
  if(g('covered'))g('covered').value=pol.covered||'joint';
  if(g('cover'))g('cover').value=pol.cover||0;
  if(g('need'))g('need').value=pol.need||0;
  if(g('location'))g('location').value=pol.location||'outside';
  if(g('doclink'))g('doclink').value=pol.doclink||'';
  if(g('notes'))g('notes').value=pol.notes||'';
  if(pol.type==='Income Protection'){
    if(g('ip-benefit'))g('ip-benefit').value=pol.ipBenefit||0;
    if(g('ip-period'))g('ip-period').value=pol.ipPeriod||'age65';
    if(g('ip-wait'))g('ip-wait').value=pol.ipWait||'90';
  }
  if(pol.type==='TPD'&&g('tpd-def'))g('tpd-def').value=pol.tpdDef||'own';
  document.getElementById('edit-modal-insurance').style.display='flex';
}

function insHideEditModal(){
  insEditingId=null;
  document.getElementById('edit-modal-insurance').style.display='none';
}

function insShowAddModal(){
  insEditingId=null;
  ['ins-name','ins-prov','ins-prem','ins-renewal','ins-cover',
   'ins-need','ins-doclink','ins-notes','ins-ip-benefit'].forEach(id=>{
    const e=document.getElementById(id);if(e)e.value='';
  });
  const typeEl=document.getElementById('ins-type');
  if(typeEl){typeEl.value='Life';insTypeChanged();}
  const covEl=document.getElementById('ins-covered');
  if(covEl)covEl.value='joint';
  const freqEl=document.getElementById('ins-freq');
  if(freqEl)freqEl.value='annual';
  const locEl=document.getElementById('ins-location');
  if(locEl)locEl.value='outside';
  const hintEl=document.getElementById('ins-need-hint');
  if(hintEl)hintEl.textContent='';
  document.getElementById('add-modal-insurance').style.display='flex';
  insAutoFillNeed();
}

function insHideAddModal(){
  document.getElementById('add-modal-insurance').style.display='none';
}

function insEditTypeChanged(){
  const type=document.getElementById('ins-edit-type')?.value||'';
  const ipF=document.getElementById('ins-edit-ip-fields');
  const tpdF=document.getElementById('ins-edit-tpd-fields');
  if(ipF)  ipF.style.display  = type==='Income Protection'?'block':'none';
  if(tpdF) tpdF.style.display = type==='TPD'?'block':'none';
}

function addInsurance(){
  const g=id=>document.getElementById((insEditingId?'ins-edit-':'ins-')+id);
  const name=(g('name')?.value||'').trim();
  const type=g('type')?.value||'';
  const prov=(g('prov')?.value||'').trim();
  const prem=parseFloat(g('prem')?.value)||0;
  const freq=g('freq')?.value||'annual';
  const renewal=g('renewal')?.value||'';
  const covered=g('covered')?.value||'joint';
  const cover=parseFloat(g('cover')?.value)||0;
  const need=parseFloat(g('need')?.value)||0;
  const location=g('location')?.value||'outside';
  const doclink=(g('doclink')?.value||'').trim();
  const notes=(g('notes')?.value||'').trim();
  if(!name){toast('⚠️ Enter a policy name');return;}
  if(!prem){toast('⚠️ Enter a premium amount');return;}
  const pol={id:insEditingId||Date.now(),name,type,prov,prem,freq,renewal,covered,cover,need,location,doclink,notes};
  // IP-specific
  if(type==='Income Protection'){
    pol.ipBenefit=parseFloat(g('ip-benefit')?.value)||0;
    pol.ipPeriod=g('ip-period')?.value||'age65';
    pol.ipWait=g('ip-wait')?.value||'90';
  }
  // TPD-specific
  if(type==='TPD'){
    pol.tpdDef=g('tpd-def')?.value||'own';
  }
  if(insEditingId){
    INS=INS.map(p=>p.id===insEditingId?pol:p);
    toast('✅ Policy updated');
  }else{
    INS.push(pol);
    toast('✅ Policy added');
  }
  try{save(K.ins,INS);}catch(e){console.error('Insurance save error:',e);}
  insHideEditModal();
  insHideAddModal();
  ['name','prov','prem','renewal','cover','need','doclink','notes','ip-benefit'].forEach(id=>{const e=document.getElementById('ins-'+id);if(e)e.value='';});
  renderInsurance();
}

function delIns(id){INS=INS.filter(p=>p.id!==id);save(K.ins,INS);renderInsurance();toast('🗑️ Removed');}

// ── Shared needs analysis calculation (used by UI + exports) ─────
function _computeNeedsData(pfx) {
  const pre = 'li-' + pfx + '-';
  const gv = id => parseFloat(document.getElementById(pre + id)?.value) || 0;
  const income    = gv('income');
  if (!income) return null;
  const years     = gv('years') || 25;
  const debts     = gv('debts');
  const mortgage  = gv('mortgage');
  const education = gv('education');
  const funeral   = gv('funeral') || 15000;
  const assets    = gv('assets');
  const existing  = gv('existing');
  const ageInput  = gv('age');
  const superAge  = pfx === 'b' ? (SUPER.b?.age || 0) : (SUPER.s?.age || 0);
  const age       = ageInput || superAge || (pfx === 'b' ? 40 : 38);
  const yearsTo65 = Math.max(0, 65 - age);
  const disc      = 0.05;

  // DIME
  const dimeGross = debts + (income * years) + mortgage + education + funeral;
  const dimeLife  = Math.max(0, dimeGross - assets - existing);

  // 10× Income
  const incGross  = income * 10;
  const incLife   = Math.max(0, incGross - assets - existing);

  // Needs PV
  const pvIncome   = income * (1 - Math.pow(1 + disc, -years)) / disc;
  const needsGross = pvIncome + debts + mortgage + education + funeral;
  const needsLife  = Math.max(0, needsGross - assets - existing);

  // TPD
  const modAllowance = 50000;
  const tpdIncomePV  = yearsTo65 > 0 ? income * (1 - Math.pow(1 + disc, -yearsTo65)) / disc : 0;
  const tpdGross     = tpdIncomePV + debts + mortgage + funeral + modAllowance;
  const tpdNeed      = Math.max(0, tpdGross - assets);

  // IP (75% of gross income, to age 65)
  const ipMonthly = income * 0.75 / 12;
  const ipAnnual  = ipMonthly * 12;

  // Existing cover from policies
  const existLife  = INS.filter(i => i.type === 'Life' && (i.covered === pfx || i.covered === 'joint')).reduce((s,i) => s + (i.cover || 0), 0);
  const polTPD     = INS.filter(i => i.type === 'TPD'  && (i.covered === pfx || i.covered === 'joint')).reduce((s,i) => s + (i.cover || 0), 0);
  const polIPmo    = INS.filter(i => i.type === 'Income Protection' && (i.covered === pfx || i.covered === 'joint')).reduce((s,i) => s + (i.ipBenefit || (i.cover / 12) || 0), 0);
  const manualTPD  = parseFloat(document.getElementById('li-' + pfx + '-exist-tpd')?.value) || 0;
  const manualIPmo = parseFloat(document.getElementById('li-' + pfx + '-exist-ip')?.value)  || 0;
  const existTPD   = manualTPD > 0 ? manualTPD : polTPD;
  const existIP    = manualIPmo > 0 ? manualIPmo : polIPmo;
  const allExistLife = existLife + existing;

  const recLife  = Math.max(dimeLife, incLife, needsLife); // most conservative
  const lifeGap  = Math.max(0, recLife - allExistLife);
  const tpdGap   = Math.max(0, tpdNeed - existTPD);
  const ipGap    = Math.max(0, ipAnnual - (existIP * 12));

  return {
    income, years, debts, mortgage, education, funeral, assets, existing,
    age, yearsTo65,
    dimeGross, dimeLife,
    incGross, incLife,
    needsGross, needsLife,
    tpdNeed, tpdGross,
    ipMonthly, ipAnnual,
    allExistLife, existTPD, existIP,
    recLife, lifeGap, tpdGap, ipGap,
  };
}

function exportInsuranceCSV(){
  const total=INS.reduce((s,p)=>s+insToAnnual(p.prem,p.freq),0);
  let csv='';

  // ── Sheet 1: Policies ──────────────────────────────────────────
  const polHeaders=['Policy Name','Type','Provider','Premium','Frequency','Annual Cost',
    'Renewal Date','Covered Person','Sum Insured','Cover Need','Location','Document Link','Notes'];
  csv += 'POLICIES\n';
  csv += polHeaders.join(',') + '\n';
  INS.forEach(p=>{
    const row=[
      p.name, p.type, p.prov||'', p.prem, p.freq, insToAnnual(p.prem,p.freq),
      p.renewal||'',
      p.covered==='brenton'?getUserName('brenton'):p.covered==='shelley'?getUserName('shelley'):'Both',
      p.cover||0, p.need||0, p.location==='inside'?'Inside Super':'Outside Super',
      p.doclink||'', p.notes||''
    ];
    csv += row.map(v=>typeof v==='string'&&(v.includes(',')||v.includes('"'))?'"'+v.replace(/"/g,'""')+'"':v).join(',') + '\n';
  });
  csv += '\nAnnual Total,' + insToAnnual(total,1) + '\n\n';

  // ── Sheet 2: Needs Analysis ────────────────────────────────────
  csv += 'NEEDS ANALYSIS\n';
  csv += ['Person','Annual Income','Years to Replace','Outstanding Debts','Mortgage Balance',
    'Education/Future','Funeral/Final','Existing Savings/Super','Existing Life Cover in Super','Current Age',
    'DIME — Gross Need','DIME — Life Cover Needed',
    '10× Income — Gross Need','10× Income — Life Cover Needed',
    'Needs PV — Gross Need','Needs PV — Life Cover Needed',
    'Recommended Life Need (most conservative)',
    'Existing Life Cover','Life Cover Gap',
    'TPD Need','Existing TPD Cover','TPD Gap',
    'IP Monthly Needed (75% income)','Existing IP Monthly Benefit','IP Gap (annual)'].join(',') + '\n';

  ['b','s'].forEach(pfx=>{
    const n = _computeNeedsData(pfx);
    const pName = pfx==='b' ? getUserName('brenton') : getUserName('shelley');
    if (!n) { csv += '"'+pName+'",No income data entered\n'; return; }
    const row=[
      pName, n.income, n.years, n.debts, n.mortgage, n.education, n.funeral, n.assets, n.existing, n.age,
      n.dimeGross, n.dimeLife,
      n.incGross, n.incLife,
      Math.round(n.needsGross), Math.round(n.needsLife),
      Math.round(n.recLife),
      n.allExistLife, Math.round(n.lifeGap),
      Math.round(n.tpdNeed), n.existTPD, Math.round(n.tpdGap),
      Math.round(n.ipMonthly), n.existIP, Math.round(n.ipGap)
    ];
    csv += row.join(',') + '\n';
  });

  if(!INS.length && !_computeNeedsData('b') && !_computeNeedsData('s')){toast('⚠️ No data to export');return;}
  const blob=new Blob([csv],{type:'text/csv'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download='insurance-report-'+new Date().toISOString().split('T')[0]+'.csv';
  a.click();
  URL.revokeObjectURL(url);
  toast('✅ CSV exported');
}

function exportInsurancePDF(){
  const total=INS.reduce((s,p)=>s+insToAnnual(p.prem,p.freq),0);
  const fmtd=n=>n===undefined||n===null?'—':'$'+n.toLocaleString('en-AU',{minimumFractionDigits:0,maximumFractionDigits:0});
  const pct=(a,b)=>b>0?Math.min(100,Math.round(a/b*100)):100;

  const css=`
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;color:#1a1a2e;background:#fff;padding:28px 32px}
    h1{font-size:22px;font-weight:700;color:#1a1a2e;margin-bottom:4px}
    .subtitle{font-size:11px;color:#888;margin-bottom:24px}
    h2{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#e8457a;border-bottom:2px solid #e8457a;padding-bottom:5px;margin:24px 0 12px}
    h3{font-size:12px;font-weight:700;color:#1a1a2e;margin:14px 0 8px}
    table{width:100%;border-collapse:collapse;margin-bottom:14px;font-size:10.5px}
    th{background:#1a1a2e;color:#fff;padding:7px 10px;text-align:left;font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:.05em}
    th.r,td.r{text-align:right}
    td{padding:7px 10px;border-bottom:1px solid #eee;vertical-align:top}
    tr:last-child td{border-bottom:none}
    tr:nth-child(even) td{background:#f9f9fb}
    .person-block{border:1.5px solid #eee;border-radius:8px;padding:16px;margin-bottom:16px;break-inside:avoid}
    .person-header{display:flex;align-items:center;gap:10px;margin-bottom:12px}
    .person-name{font-size:14px;font-weight:700}
    .badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.05em}
    .b-pink{background:#fce7ef;color:#c0335e}
    .b-purple{background:#ede9fe;color:#5b21b6}
    .method-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:14px}
    .method-box{border:1px solid #eee;border-radius:6px;padding:10px;background:#fafafa}
    .method-label{font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:#888;margin-bottom:3px}
    .method-amount{font-size:14px;font-weight:700;color:#1a1a2e;margin-bottom:2px}
    .method-detail{font-size:9px;color:#888}
    .gap-row{display:flex;align-items:center;gap:8px;margin-bottom:8px}
    .gap-label{width:180px;flex-shrink:0;font-size:10px;font-weight:600}
    .gap-bar-wrap{flex:1;background:#eee;height:14px;border-radius:4px;overflow:hidden}
    .gap-bar-fill{height:100%;border-radius:4px}
    .gap-amounts{width:160px;flex-shrink:0;text-align:right;font-size:9.5px}
    .gap-status{width:90px;flex-shrink:0;text-align:right;font-size:9.5px;font-weight:700}
    .ok{color:#059669} .warn{color:#d97706} .bad{color:#dc2626}
    .summary-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:20px}
    .stat-box{border:1.5px solid #eee;border-radius:8px;padding:12px;text-align:center}
    .stat-label{font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:#888;margin-bottom:4px}
    .stat-value{font-size:18px;font-weight:700;color:#1a1a2e}
    .stat-sub{font-size:9.5px;color:#888;margin-top:2px}
    .disclaimer{font-size:9.5px;color:#aaa;border-top:1px solid #eee;padding-top:12px;margin-top:24px;line-height:1.6}
    @media print{body{padding:0} h2{break-before:auto}}
  `;

  let html = `<html><head><meta charset="utf-8"><title>Life Insurance Report — ${new Date().toLocaleDateString('en-AU')}</title><style>${css}</style></head><body>`;

  // ── Header ───────────────────────────────────────────────────
  html += `<h1>Life Insurance &amp; Coverage Report</h1>`;
  html += `<div class="subtitle">Prepared ${new Date().toLocaleDateString('en-AU',{day:'numeric',month:'long',year:'numeric'})} &nbsp;·&nbsp; For financial adviser review &nbsp;·&nbsp; Confidential</div>`;

  // ── Portfolio summary ─────────────────────────────────────────
  html += '<h2>Insurance Portfolio Summary</h2>';
  html += '<div class="summary-grid">';
  html += `<div class="stat-box"><div class="stat-label">Total Policies</div><div class="stat-value">${INS.length}</div><div class="stat-sub">${[...new Set(INS.map(p=>p.type))].join(', ')||'—'}</div></div>`;
  html += `<div class="stat-box"><div class="stat-label">Annual Premium</div><div class="stat-value">${fmtd(total)}</div><div class="stat-sub">${fmtd(total/12)} per month</div></div>`;
  const soon=INS.filter(p=>{const d=daysTilRenewal(p.renewal);return d!==null&&d>=0&&d<=60;}).length;
  html += `<div class="stat-box"><div class="stat-label">Renewals ≤ 60 Days</div><div class="stat-value" style="color:${soon?'#d97706':'#059669'}">${soon}</div><div class="stat-sub">${soon?'Action required':'All clear'}</div></div>`;
  html += '</div>';

  // ── Policy list ───────────────────────────────────────────────
  if(INS.length){
    html += '<h2>Policies</h2>';
    html += '<table><thead><tr><th>Policy Name</th><th>Type</th><th>Provider</th><th>Covered</th><th>Location</th><th class="r">Sum Insured</th><th class="r">Premium</th><th class="r">Annual Cost</th><th>Renewal</th><th>Notes</th></tr></thead><tbody>';
    INS.forEach(p=>{
      const fl={monthly:'mo',annual:'yr',quarterly:'qtr',fortnightly:'fn'}[p.freq]||p.freq;
      const cov=p.covered==='brenton'?getUserName('brenton'):p.covered==='shelley'?getUserName('shelley'):'Both';
      const loc=p.location==='inside'?'In Super':'External';
      html += `<tr><td><strong>${esc(p.name)}</strong></td><td>${esc(p.type)}</td><td>${esc(p.prov||'')}</td><td>${esc(cov)}</td><td>${loc}</td><td class="r">${p.cover?fmtd(p.cover):'—'}</td><td class="r">${fmtd(p.prem)}/${fl}</td><td class="r">${fmtd(insToAnnual(p.prem,p.freq))}</td><td>${p.renewal||'—'}</td><td>${esc(p.notes||'')}</td></tr>`;
    });
    html += '</tbody></table>';
  }

  // ── Needs Analysis per person ─────────────────────────────────
  html += '<h2>Life Insurance Needs Analysis</h2>';
  html += '<p style="font-size:10px;color:#888;margin-bottom:14px">All three methods calculated independently. Recommended coverage uses the most conservative (highest) figure.</p>';

  const personColors = { b:'#c0335e', s:'#5b21b6' };
  const personBadge  = { b:'b-pink',  s:'b-purple' };

  ['b','s'].forEach(pfx=>{
    const n   = _computeNeedsData(pfx);
    const pName = pfx==='b' ? getUserName('brenton') : getUserName('shelley');
    html += `<div class="person-block">`;
    html += `<div class="person-header"><span class="person-name">${esc(pName)}</span><span class="badge ${personBadge[pfx]}">${pfx==='b'?'Profile 1':'Profile 2'}</span></div>`;

    if(!n){
      html += '<p style="color:#888;font-size:10px">No income entered — enter income in the Needs Analysis tab to calculate.</p></div>';
      return;
    }

    // Inputs used
    html += '<table style="margin-bottom:12px"><thead><tr><th colspan="4" style="background:#f5f5f5;color:#444">Inputs Used in Calculation</th></tr></thead><tbody>';
    const inputs=[
      ['Annual Income', fmtd(n.income), 'Current Age', n.age],
      ['Years to Replace Income', n.years, 'Years to Age 65', n.yearsTo65],
      ['Outstanding Debts', fmtd(n.debts), 'Mortgage Balance', fmtd(n.mortgage)],
      ['Education / Future Costs', fmtd(n.education), 'Funeral / Final Expenses', fmtd(n.funeral)],
      ['Existing Savings / Super', fmtd(n.assets), 'Existing Life Cover in Super', fmtd(n.existing)],
    ];
    inputs.forEach(([k1,v1,k2,v2])=>{
      html += `<tr><td style="color:#888;width:140px">${k1}</td><td style="font-weight:600">${v1}</td><td style="color:#888;width:140px">${k2}</td><td style="font-weight:600">${v2||'—'}</td></tr>`;
    });
    html += '</tbody></table>';

    // Three method boxes
    html += '<h3>Life Insurance — Three Methods Compared</h3>';
    html += '<div class="method-grid">';
    const methods=[
      ['DIME Method', n.dimeGross, n.dimeLife, 'D+I+M+E less assets'],
      ['10× Income', n.incGross, n.incLife, '10 × annual income less assets'],
      ['Needs Analysis (PV)', Math.round(n.needsGross), Math.round(n.needsLife), 'PV of income stream at 5% discount'],
    ];
    methods.forEach(([title,gross,net,detail])=>{
      html += `<div class="method-box"><div class="method-label">${title}</div><div class="method-amount" style="color:${personColors[pfx]}">${fmtd(net)}</div><div class="method-detail">Gross: ${fmtd(gross)}</div><div class="method-detail">${detail}</div></div>`;
    });
    html += '</div>';

    // Coverage gap bars
    html += '<h3>Coverage Gap Summary</h3>';
    const gapBars=[
      ['💛 Life Cover', n.allExistLife, n.recLife, 'Most conservative method used'],
      ['♿ TPD Cover', n.existTPD, Math.round(n.tpdNeed), 'Independent of Life — PV of income to 65 + modifications'],
      ['🛡️ Income Protection', n.existIP*12, Math.round(n.ipAnnual), '75% of income to age 65 — ' + fmtd(Math.round(n.ipMonthly)) + '/mo'],
    ];
    gapBars.forEach(([label,have,need,note])=>{
      const p2=pct(have,need);
      const gap=Math.max(0,need-have);
      const barColor=p2>=100?'#059669':p2>=70?'#d97706':'#dc2626';
      const statusClass=gap<=0?'ok':p2>=70?'warn':'bad';
      const statusText=gap<=0?'✓ Covered':'Gap: '+fmtd(gap);
      html += `<div class="gap-row">
        <div class="gap-label">${label}</div>
        <div class="gap-bar-wrap"><div class="gap-bar-fill" style="width:${p2}%;background:${barColor}"></div></div>
        <div class="gap-amounts">${fmtd(have)} of ${fmtd(need)}<br><span style="color:#888">${p2}% covered</span></div>
        <div class="gap-status ${statusClass}">${statusText}</div>
      </div>`;
      html += `<div style="font-size:9px;color:#bbb;margin-bottom:8px;padding-left:188px">${note}</div>`;
    });

    // DIME breakdown detail
    html += `<details style="margin-top:10px;font-size:10px">
      <summary style="cursor:pointer;color:#888;margin-bottom:6px">DIME Breakdown</summary>
      <table style="font-size:10px"><tbody>
        <tr><td style="color:#888">D — Outstanding Debts</td><td class="r">${fmtd(n.debts)}</td></tr>
        <tr><td style="color:#888">I — Income × ${n.years} years</td><td class="r">${fmtd(n.income*n.years)}</td></tr>
        <tr><td style="color:#888">M — Mortgage Balance</td><td class="r">${fmtd(n.mortgage)}</td></tr>
        <tr><td style="color:#888">E — Education + Funeral</td><td class="r">${fmtd(n.education+n.funeral)}</td></tr>
        <tr><td style="color:#888">Less: Savings / Super</td><td class="r" style="color:#059669">-${fmtd(n.assets)}</td></tr>
        <tr><td style="color:#888">Less: Existing Cover</td><td class="r" style="color:#059669">-${fmtd(n.existing)}</td></tr>
      </tbody></table>
    </details>`;

    html += '</div>'; // person-block
  });

  // ── Adviser action items ──────────────────────────────────────
  html += '<h2>Recommended Actions for Adviser</h2>';
  html += '<table><thead><tr><th>Person</th><th>Coverage Type</th><th class="r">Current Cover</th><th class="r">Recommended Need</th><th class="r">Gap</th><th>Priority</th></tr></thead><tbody>';
  ['b','s'].forEach(pfx=>{
    const n=_computeNeedsData(pfx);
    if(!n)return;
    const pName=pfx==='b'?getUserName('brenton'):getUserName('shelley');
    const rows=[
      ['Life', n.allExistLife, Math.round(n.recLife), n.lifeGap],
      ['TPD', n.existTPD, Math.round(n.tpdNeed), n.tpdGap],
      ['Income Protection (annual)', n.existIP*12, Math.round(n.ipAnnual), n.ipGap],
    ];
    rows.forEach(([type,have,need,gap])=>{
      const p2=pct(have,need);
      const pri=gap<=0?'<span style="color:#059669">✓ Adequate</span>':p2>=70?'<span style="color:#d97706">⚠ Review</span>':'<span style="color:#dc2626">❗ Urgent</span>';
      html+=`<tr><td>${esc(pName)}</td><td>${type}</td><td class="r">${fmtd(have)}</td><td class="r">${fmtd(need)}</td><td class="r" style="color:${gap>0?'#dc2626':'#059669'}">${gap>0?fmtd(gap):'—'}</td><td>${pri}</td></tr>`;
    });
  });
  html += '</tbody></table>';

  html += `<div class="disclaimer">⚠️ This report is for informational purposes and discussion with your licensed financial adviser only. Life insurance needs calculations (DIME, 10× Income, Needs Present Value) are estimates based on inputs provided and standard actuarial assumptions (5% discount rate, 75% income replacement, 90-day IP waiting period). They do not constitute personal financial advice. Consult a licensed financial adviser or insurance specialist before making any coverage decisions. All figures in AUD.</div>`;
  html += '</body></html>';

  const blob=new Blob([html],{type:'text/html'});
  const url=URL.createObjectURL(blob);
  window.open(url,'_blank');
  setTimeout(()=>URL.revokeObjectURL(url),2000);
  toast('✅ Report opened — use browser Print → Save as PDF');
}

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
  renderInsCoverageChart();

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
    const locBadge=p.location&&p.location!=='outside'?`<span class="ins-tag" style="background:var(--card3);color:var(--muted)">🏦 ${p.location==='inside'?'Inside Super':'Outside Super'}</span>`:'';
    const docBadge=p.doclink?`<span class="ins-tag" style="background:var(--card2);color:var(--muted)"><a href="${esc(p.doclink)}" target="_blank" style="color:inherit;text-decoration:none">📄 Document</a></span>`:'';
    return`<div class="ins-card">
      <div class="ins-icon" style="background:${m.bg};color:${m.color}">${m.icon}</div>
      <div class="ins-body">
        <div class="ins-name">${p.name}</div>
        <div class="ins-prov">${p.prov||p.type}</div>
        <div class="ins-tags">
          <span class="ins-tag" style="background:${m.bg};color:${m.color}">${p.type}</span>
          <span class="badge ${rbc}">${rlbl} · ${rdate}</span>
          <span class="ins-tag" style="background:var(--card2);color:var(--muted)">👤 ${cov}</span>
          ${locBadge}
          ${docBadge}
          ${p.notes?`<span class="ins-tag" style="background:var(--card2);color:var(--muted)">📝 ${p.notes}</span>`:''}
          ${p.type==='Income Protection'&&p.ipBenefit?`<span class="ins-tag" style="background:var(--card3);color:var(--purple)">${fmt(p.ipBenefit)}/mo · ${p.ipWait||90}d wait · to ${p.ipPeriod==='age65'?'age 65':p.ipPeriod}</span>`:''}
          ${p.type==='TPD'&&p.tpdDef?`<span class="ins-tag" style="background:var(--warn-bg);color:var(--warn)">${p.tpdDef==='own'?'Own Occupation':'Any Occupation'} TPD</span>`:''}
        </div>
      </div>
      <div>
        <div class="ins-amt" style="color:${m.color}">${fmt(p.prem)}<small>/${fl}</small></div>
        <div style="font-size:.68rem;color:var(--muted);text-align:right;margin-top:2px">${fmt(insToAnnual(p.prem,p.freq))}/yr</div>
        <div style="display:flex;gap:6px;justify-content:flex-end;margin-top:7px"><button class="btn btn-ghost btn-sm" onclick="insShowEditModal(${p.id})">Edit</button><button class="del-btn" onclick="delIns(${p.id})">🗑</button></div>
      </div></div>`;
  }).join('');
}

// ── Shared helper: sum current cover from policies for one person + type ──
// Joint policies count toward both individuals.
function _insCoverForPerson(pfx, type) {
  return INS
    .filter(p => p.type === type && (p.covered === pfx || p.covered === 'joint'))
    .reduce((s, p) => s + (p.cover || 0), 0);
}

// IP is monthly benefit, not lump sum — sum ipBenefit across matching policies
function _insIPMonthlyForPerson(pfx) {
  return INS
    .filter(p => p.type === 'Income Protection' && (p.covered === pfx || p.covered === 'joint'))
    .reduce((s, p) => s + (p.ipBenefit || (p.cover / 12) || 0), 0);
}

function renderInsCoverage() {
  const el = document.getElementById('ins-coverage'); if (!el) return;

  // Need comes from the needs analysis calculator (authoritative source).
  // Cover comes from summing policies (including joint → both people).
  const nb = _computeNeedsData('b');
  const ns = _computeNeedsData('s');
  const hasNeeds = nb || ns;
  const hasPols  = INS.some(p => ['Life','TPD','Income Protection'].includes(p.type));

  if (!hasNeeds && !hasPols) {
    el.innerHTML = '<div class="empty" style="padding:12px 0"><div class="ei">🛡️</div><p>Enter income in the Needs Analysis above and add policies to see gap analysis</p></div>';
    return;
  }

  let html = '';
  [['b', nb], ['s', ns]].forEach(([pfx, n]) => {
    const pName = pfx === 'b' ? getUserName('brenton') : getUserName('shelley');
    if (!n) return; // no income entered for this person

    const lifeNeed = Math.round(n.recLife);
    const tpdNeed  = Math.round(n.tpdNeed);
    const ipNeed   = Math.round(n.ipMonthly); // monthly comparison

    const lifeCover = _insCoverForPerson(pfx, 'Life');
    const tpdCover  = _insCoverForPerson(pfx, 'TPD');
    const ipCover   = _insIPMonthlyForPerson(pfx); // monthly

    html += `<div class="cov-section"><div class="cov-hd">${pName}</div>`;

    function bar(label, cover, need, isMonthly) {
      if (!need) return '';
      const pct    = Math.min(100, cover / need * 100);
      const cls    = pct >= 100 ? '' : pct >= 70 ? 'warn' : 'over';
      const gap    = Math.max(0, need - cover);
      const suffix = isMonthly ? '/mo' : '';
      const status = gap <= 0
        ? `<span style="color:var(--success);font-weight:700">✅ Fully covered</span>`
        : `<span style="color:var(--warn);font-weight:700">⚠️ Gap: ${fmt(gap)}${suffix}</span>`;
      return `<div class="prog-wrap">
        <div class="prog-hd"><span class="prog-lbl">${label}</span>
          <span class="prog-val">${fmt(cover)}${suffix} of ${fmt(need)}${suffix} needed</span></div>
        <div class="prog-track"><div class="prog-fill ${cls}" style="width:${pct.toFixed(0)}%"></div></div>
        <div style="display:flex;justify-content:space-between;margin-top:3px">
          <span style="font-size:.7rem;color:var(--muted)">${pct.toFixed(0)}% covered</span>${status}</div></div>`;
    }

    html += bar('💛 Life', lifeCover, lifeNeed, false);
    html += bar('♿ TPD',  tpdCover,  tpdNeed,  false);
    html += bar('🛡️ Income Protection', ipCover, ipNeed, true);
    html += '</div>';
  });

  el.innerHTML = html || '<div class="empty" style="padding:10px 0"><p>Enter income in the Needs Analysis above to calculate needs</p></div>';
}

let insGapChart = null;
function renderInsCoverageChart() {
  const el = document.getElementById('ins-coverage-chart'); if (!el) return;

  // Build one bar group per person × type, using needs analysis as the need figure.
  const labels = [], coverData = [], gapData = [];

  [['b', getUserName('brenton')], ['s', getUserName('shelley')]].forEach(([pfx, pName]) => {
    const n = _computeNeedsData(pfx);
    if (!n) return;

    const rows = [
      { label: pName + ' — Life', cover: _insCoverForPerson(pfx, 'Life'),      need: Math.round(n.recLife)  },
      { label: pName + ' — TPD',  cover: _insCoverForPerson(pfx, 'TPD'),       need: Math.round(n.tpdNeed)  },
      { label: pName + ' — IP',   cover: _insIPMonthlyForPerson(pfx) * 12,     need: Math.round(n.ipAnnual) },
    ];

    rows.forEach(r => {
      if (!r.need) return; // skip if no need calculated
      const gap = Math.max(0, r.need - r.cover);
      labels.push(r.label);
      coverData.push(r.cover);
      gapData.push(gap);
    });
  });

  const ctx = el.getContext('2d'); if (!ctx) return;
  if (insGapChart) insGapChart.destroy();

  if (!labels.length) {
    // Clear canvas and show empty message
    ctx.clearRect(0, 0, el.width, el.height);
    const parent = el.parentElement;
    if (parent && !parent.querySelector('.ins-chart-empty')) {
      const msg = document.createElement('div');
      msg.className = 'ins-chart-empty empty';
      msg.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px';
      msg.innerHTML = '<div class="ei">📊</div><p>Enter income in the Needs Analysis above to see the gap chart</p>';
      parent.appendChild(msg);
    }
    return;
  }

  // Remove any empty-state message
  el.parentElement?.querySelector('.ins-chart-empty')?.remove();

  const tok = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || '';
  insGapChart = safeChart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Current Cover', data: coverData, backgroundColor: '#00C896', borderRadius: 5 },
        { label: 'Still Needed',  data: gapData,   backgroundColor: '#EF4444', borderRadius: 5 },
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',  // horizontal bars — easier to read with long labels
      plugins: {
        legend: { position: 'bottom', labels: { font: { family: 'Inter', size: 11 }, padding: 14, color: tok('--muted') } },
        tooltip: {
          callbacks: {
            label: c => ' ' + c.dataset.label + ': ' + fmt(c.parsed.x),
            afterBody: items => {
              const i = items[0].dataIndex;
              const total = (coverData[i] || 0) + (gapData[i] || 0);
              const pct   = total > 0 ? Math.round(coverData[i] / total * 100) : 100;
              return ['Coverage: ' + pct + '%'];
            }
          }
        }
      },
      scales: {
        x: {
          stacked: true,
          grid: { color: tok('--card3') },
          ticks: { font: { family: 'Inter' }, color: tok('--muted'), callback: v => '$' + Math.round(v / 1000) + 'k' }
        },
        y: {
          stacked: true,
          grid: { display: false },
          ticks: { font: { family: 'Inter', size: 11 }, color: tok('--text') }
        }
      }
    }
  });
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
    sgc:g('sb-sgc'),extra:g('sb-extra'),inflation:g('sb-inflation'),
    ret:g('sb-return')||7, fees:g('sb-fees')||0.8};
  SUPER.s={balance:g('ss-balance'),age:g('ss-age'),retire:g('ss-retire'),salary:g('ss-salary'),
    sgc:g('ss-sgc'),extra:g('ss-extra'),ret:g('ss-return'),fees:g('ss-fees'),inflation:g('ss-inflation')};
  save(K.superdata,SUPER);
  showSuperResults();renderSuperChart();renderD293Section();
}

function showSuperResults(){
  ['b','s'].forEach(p=>{
    const d=SUPER[p];const el=document.getElementById('s'+p+'-result');if(!el)return;
    if(!d?.age||!d?.retire||!d?.salary){el.innerHTML='';return;}
    // Use lifecycle projection for Brenton, standard for Shelley
    const rows=projectSuper(d);
    const final=rows[rows.length-1];
    const sgcAmt=(d.salary||0)*(d.sgc||11.5)/100;
    const methodNote='Standard projection';
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
  const rowsB=SUPER.b?.age?projectSuper(SUPER.b):[];
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
    const el = document.getElementById('li-' + p + '-result');
    if (!el) return;

    // Pull all computed values from shared helper
    const n = _computeNeedsData(p);
    if (!n) { el.innerHTML = ''; return; }

    const { income, years, debts, mortgage, education, funeral, assets, existing,
            age, yearsTo65,
            dimeGross, dimeLife, incGross, incLife, needsGross, needsLife,
            tpdNeed, tpdGross, ipMonthly, ipAnnual,
            allExistLife, existTPD, existIP } = n;

    // Recalculate tab-specific recLife (helper always uses most conservative)
    const recLife = liActiveTab === 'dime'   ? dimeLife
                  : liActiveTab === 'income' ? incLife
                  : liActiveTab === 'needs'  ? needsLife
                  : Math.max(dimeLife, incLife, needsLife);

    const lifeGap = Math.max(0, recLife - allExistLife);
    const tpdGap  = Math.max(0, tpdNeed - existTPD);
    const ipGap   = Math.max(0, ipAnnual - (existIP * 12));

    const disc       = 0.05;
    const modAllow   = 50000;
    const tpdIncomePV= yearsTo65 > 0 ? income * (1 - Math.pow(1+disc,-yearsTo65)) / disc : 0;
    // Manual override values for display in TPD/IP detail
    const manualTPD  = parseFloat(document.getElementById('li-'+p+'-exist-tpd')?.value) || 0;
    const manualIPmo = parseFloat(document.getElementById('li-'+p+'-exist-ip')?.value)  || 0;
    const polIPmthly = INS.filter(i=>i.type==='Income Protection'&&(i.covered===p||i.covered==='joint')).reduce((s,i)=>s+(i.ipBenefit||(i.cover/12)||0),0);
    const polTPD     = INS.filter(i=>i.type==='TPD'&&(i.covered===p||i.covered==='joint')).reduce((s,i)=>s+(i.cover||0),0);

    const color = p === 'b' ? 'var(--primary)' : 'var(--purple)';

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
      + (showDime   ? methodBox('DIME Method',         dimeGross,              dimeLife,  lifeGap, dimeBreakdown()) : '')
      + (showIncome ? methodBox('10× Income Method',   incGross,               incLife,   lifeGap, '') : '')
      + (showNeeds  ? methodBox('Needs Analysis (PV)', Math.round(needsGross), Math.round(needsLife), lifeGap, '<div style="font-size:.7rem;color:var(--muted);margin-top:4px">PV of ' + years + ' yrs income at 5% discount rate</div>') : '')
      + '<div style="margin-top:14px">'
      + coverBar(allExistLife, recLife, '💛 Life Cover (recommended)')
      + coverBar(existTPD, tpdNeed, '♿ TPD Cover (independent, to age 65)')
      + coverBar(existIP * 12, ipAnnual, '🛡️ Income Protection (annual) — current: '
          + fmt(existIP) + '/mo · needed: ' + fmt(ipMonthly) + '/mo to age 65')
      + '</div>'
      + '<details style="margin-top:10px"><summary style="font-size:.74rem;color:var(--muted);cursor:pointer">TPD &amp; IP calculation detail</summary>'
      + '<div style="margin-top:8px">'
      + '<div class="li-dr"><span class="li-dr-k">TPD: PV of income to age 65 (' + yearsTo65 + ' yrs)</span><span class="li-dr-v">' + fmt(tpdIncomePV) + '</span></div>'
      + '<div class="li-dr"><span class="li-dr-k">TPD: Home/vehicle modifications allowance</span><span class="li-dr-v">' + fmt(modAllow) + '</span></div>'
      + '<div class="li-dr"><span class="li-dr-k">TPD: Less existing savings/super</span><span class="li-dr-v" style="color:var(--success)">-' + fmt(assets) + '</span></div>'
      + '<div class="li-dr"><span class="li-dr-k">IP: 75% of income/month needed (90-day wait)</span><span class="li-dr-v">' + fmt(ipMonthly) + '/mo</span></div>'
      + '<div class="li-dr"><span class="li-dr-k">IP: Existing cover</span><span class="li-dr-v">' + (manualIPmo > 0 ? fmt(manualIPmo) + '/mo (manual)' : polIPmthly > 0 ? fmt(polIPmthly) + '/mo (from policies)' : 'None entered') + '</span></div>'
      + '<div class="li-dr"><span class="li-dr-k">TPD: Existing cover</span><span class="li-dr-v">' + (manualTPD > 0 ? fmt(manualTPD) + ' (manual)' : polTPD > 0 ? fmt(polTPD) + ' (from policies)' : 'None entered') + '</span></div>'
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
