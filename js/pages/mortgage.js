// ══════════════════════════════════════════════════════════════
// MULTI-PROPERTY SUPPORT
// ══════════════════════════════════════════════════════════════

var _mortgagePropIdx = 0; // active property tab index

// Ensure MORTGAGE has a properties array; migrate legacy flat object on first call
function _mortgageEnsureProps() {
  if (!MORTGAGE.properties || !Array.isArray(MORTGAGE.properties)) {
    // Migrate: wrap existing flat MORTGAGE fields as property 0
    var legacy = {
      id: Date.now(),
      name: 'Primary Property',
      balance:       MORTGAGE.balance       || 0,
      original:      MORTGAGE.original      || 0,
      rate:          MORTGAGE.rate          || 0,
      years:         MORTGAGE.years         || 0,
      homeValue:     MORTGAGE.homeValue     || 0,
      reptype:       MORTGAGE.reptype       || 'pi',
      offset:        MORTGAGE.offset        || 0,
      offsetName:    MORTGAGE.offsetName    || 'Offset Account',
      acquiredDate:  MORTGAGE.acquiredDate  || '',
      purchasePrice: MORTGAGE.purchasePrice || 0
    };
    MORTGAGE.properties = [legacy];
    try { save(K.mortgage, MORTGAGE); } catch(e) {}
  }
  return MORTGAGE.properties;
}

function _mortgageActiveProp() {
  var props = _mortgageEnsureProps();
  if (_mortgagePropIdx >= props.length) _mortgagePropIdx = 0;
  return props[_mortgagePropIdx] || props[0];
}

function mortgageRenderTabs() {
  var el = document.getElementById('mortgage-tabs');
  if (!el) return;
  var props = _mortgageEnsureProps();
  el.innerHTML = props.map(function(p, i) {
    var active = i === _mortgagePropIdx;
    return '<button class="btn btn-sm ' + (active ? 'btn-primary' : 'btn-ghost') + '" '
      + 'onclick="mortgageSwitchProp(' + i + ')" style="position:relative">'
      + p.name
      + (props.length > 1 && active
          ? ' <span onclick="event.stopPropagation();mortgageDeleteProp(' + i + ')" '
            + 'style="margin-left:6px;font-size:.8rem;opacity:.7">×</span>'
          : '')
      + '</button>';
  }).join('');
}

function mortgageSwitchProp(idx) {
  // Save current form values to current property first
  _mortgageSaveActive();
  _mortgagePropIdx = idx;
  renderMortgage();
  mortgageRenderTabs();
}

function mortgageAddProperty() {
  var props = _mortgageEnsureProps();
  var newProp = {
    id: Date.now(),
    name: 'Property ' + (props.length + 1),
    balance: 0, original: 0, rate: 0, years: 0,
    homeValue: 0, reptype: 'pi', offset: 0, offsetName: 'Offset Account',
    acquiredDate: '', purchasePrice: 0
  };
  props.push(newProp);
  try { save(K.mortgage, MORTGAGE); } catch(e) {}
  _mortgagePropIdx = props.length - 1;
  renderMortgage();
  mortgageRenderTabs();
  // Let user rename the property
  var newName = window.prompt('Name this property:', newProp.name);
  if (newName && newName.trim()) {
    props[_mortgagePropIdx].name = newName.trim();
    try { save(K.mortgage, MORTGAGE); } catch(e) {}
    mortgageRenderTabs();
  }
}

function mortgageDeleteProp(idx) {
  var props = _mortgageEnsureProps();
  if (props.length <= 1) { toast('Cannot delete the only property'); return; }
  var p = props[idx];
  if (!window.confirm('Delete "' + p.name + '"?\n\nAll data for this property will be removed.')) return;
  props.splice(idx, 1);
  if (_mortgagePropIdx >= props.length) _mortgagePropIdx = props.length - 1;
  try { save(K.mortgage, MORTGAGE); } catch(e) {}
  renderMortgage();
  mortgageRenderTabs();
}

// Save current form state to the active property object (before switching tabs)
function _mortgageSaveActive() {
  var props = _mortgageEnsureProps();
  if (!props[_mortgagePropIdx]) return;
  var p = props[_mortgagePropIdx];
  var g = function(id) { var e = document.getElementById(id); return e ? e.value : ''; };
  p.balance       = parseFloat(g('m-balance'))        || p.balance;
  p.original      = parseFloat(g('m-original'))       || p.original;
  p.rate          = parseFloat(g('m-rate'))            || p.rate;
  p.years         = parseInt(g('m-years'))             || p.years;
  p.homeValue     = parseFloat(g('m-homevalue'))       || p.homeValue;
  p.reptype       = g('m-reptype')                     || p.reptype;
  p.offset        = parseFloat(g('m-offset'))          || p.offset;
  p.offsetName    = g('m-offset-name')                 || p.offsetName;
  p.acquiredDate  = g('m-acquired')                    || p.acquiredDate;
  p.purchasePrice = parseFloat(g('m-purchase-price'))  || p.purchasePrice;
}

// ══════════════════════════════════════════════════════════════
// ── Acquired-date helpers ────────────────────────────────────
function _mortgageHoldDuration(dateStr) {
  if (!dateStr) return null;
  var then = new Date(dateStr + 'T00:00:00');
  var now  = new Date();
  if (isNaN(then.getTime()) || then > now) return null;
  var yrs  = now.getFullYear() - then.getFullYear();
  var mos  = now.getMonth() - then.getMonth();
  if (mos < 0) { yrs--; mos += 12; }
  if (yrs === 0) return mos + ' mo';
  return mos === 0 ? yrs + ' yr' : yrs + ' yr ' + mos + ' mo';
}

function calcRepayment(principal,rate,years){
  if(!principal||!rate||!years)return 0;
  const r=rate/100/12,n=years*12;
  return r===0?principal/n:principal*(r*Math.pow(1+r,n))/(Math.pow(1+r,n)-1);
}
function calcTotalInt(principal,rate,years){return calcRepayment(principal,rate,years)*years*12-principal;}
function calcMonthsPayoff(principal,rate,pmt){
  if(!principal||!rate||!pmt)return 0;
  const r=rate/100/12;
  if(pmt<=principal*r)return Infinity;
  return-Math.log(1-(principal*r)/pmt)/Math.log(1+r);
}
function fmtMonths(m){if(!isFinite(m)||m<=0)return'—';const y=Math.floor(m/12),mo=Math.round(m%12);return y===0?mo+'mo':mo===0?y+'yr':y+'yr '+mo+'mo';}

function saveMortgage(){
  var props = _mortgageEnsureProps();
  // Auto-sync: use typed offset if provided, otherwise pull from Cash Tracker
  const typedOffset=parseFloat(document.getElementById('m-offset').value)||0;
  const{balance:ctOff}=getLatestCTOffset();
  const resolvedOffset=typedOffset>0?typedOffset:(ctOff||0);
  if(ctOff>0&&typedOffset===0){
    document.getElementById('m-offset').value=resolvedOffset;
  }
  // Write to the active property
  var p = props[_mortgagePropIdx] || props[0];
  p.balance       = parseFloat(document.getElementById('m-balance').value)||0;
  p.original      = parseFloat(document.getElementById('m-original').value)||0;
  p.rate          = parseFloat(document.getElementById('m-rate').value)||0;
  p.years         = parseInt(document.getElementById('m-years').value)||0;
  p.homeValue     = parseFloat(document.getElementById('m-homevalue').value)||0;
  p.reptype       = document.getElementById('m-reptype').value||'pi';
  p.offset        = resolvedOffset;
  p.offsetName    = document.getElementById('m-offset-name').value.trim()||'Offset Account';
  p.acquiredDate  = document.getElementById('m-acquired').value||'';
  p.purchasePrice = parseFloat(document.getElementById('m-purchase-price').value)||0;
  // Also update legacy flat fields from first property for backward compat with other pages
  if (_mortgagePropIdx === 0) {
    MORTGAGE.balance=p.balance;MORTGAGE.original=p.original;MORTGAGE.rate=p.rate;
    MORTGAGE.years=p.years;MORTGAGE.homeValue=p.homeValue;MORTGAGE.reptype=p.reptype;
    MORTGAGE.offset=p.offset;MORTGAGE.offsetName=p.offsetName;
    MORTGAGE.acquiredDate=p.acquiredDate;MORTGAGE.purchasePrice=p.purchasePrice;
  }
  try { save(K.mortgage, MORTGAGE); } catch(e) {}
  renderMortgage();
  renderPaydownChart();
  renderRateSensitivity();
  try{if(typeof recordNetWorthSnapshot==='function')recordNetWorthSnapshot();}catch(e){}
  toast('✅ Saved'+(ctOff>0&&typedOffset===0?' · offset synced from Cash Tracker':''));
}

function syncOffsetSlider(){
  const v=parseFloat(document.getElementById('m-offset').value)||0;
  const sl=document.getElementById('offset-slider');
  if(sl){sl.value=v;}
  if(MORTGAGE.balance&&MORTGAGE.rate&&MORTGAGE.years)runOffsetSim(v);
}

function getLatestCTOffset(){
  const months=ctAllMonths();
  const lm=months.length?months[months.length-1]:null;
  return{balance:lm?((CT['offset']||{})[lm]||0):0, month:lm};
}

function syncOffsetToMortgage(){
  const{balance,month}=getLatestCTOffset();
  if(!balance)return;
  // Update mortgage offset field silently
  const el=document.getElementById('m-offset');
  if(el)el.value=balance;
  updateCTOffsetBanner(balance,month);
  // Re-run simulations if mortgage data exists
  if(MORTGAGE.balance&&MORTGAGE.rate&&MORTGAGE.years){
    syncOffsetSlider();
    renderPaydownChart();
  }
}

function pullOffsetFromCT(){
  const{balance,month}=getLatestCTOffset();
  if(!balance){toast('⚠️ No offset balance found in Cash Tracker');return;}
  const el=document.getElementById('m-offset');
  if(el)el.value=balance;
  syncOffsetSlider();
  renderPaydownChart();
  toast('🔗 Offset synced: '+fmt(balance)+' from Cash Tracker');
}

function updateCTOffsetBanner(balance,month){
  const banner=document.getElementById('ct-offset-sync-banner');
  const txt=document.getElementById('ct-offset-sync-text');
  if(!banner||!txt)return;
  if(balance>0&&month){
    const mLabel=new Date(month+'-02').toLocaleString('default',{month:'long',year:'numeric'});
    banner.style.display='block';
    txt.textContent=fmt(balance)+' ('+mLabel+')';
  } else {
    banner.style.display='none';
  }
}

function renderMortgage(){
  mortgageRenderTabs();
  // Load active property into form fields
  var p=_mortgageActiveProp();
  var m=p; // alias so remaining code below still works
  if(m.balance)document.getElementById('m-balance').value=m.balance;
  if(m.original)document.getElementById('m-original').value=m.original;
  if(m.rate)document.getElementById('m-rate').value=m.rate;
  if(m.years)document.getElementById('m-years').value=m.years;
  if(m.homeValue)document.getElementById('m-homevalue').value=m.homeValue;
  if(m.reptype)document.getElementById('m-reptype').value=m.reptype;
  if(m.offset)document.getElementById('m-offset').value=m.offset;
  if(m.offsetName)document.getElementById('m-offset-name').value=m.offsetName;
  const acqEl=document.getElementById('m-acquired');
  if(acqEl)acqEl.value=m.acquiredDate||'';
  const ppEl=document.getElementById('m-purchase-price');
  if(ppEl)ppEl.value=m.purchasePrice||'';

  const equity=(m.homeValue||0)-(m.balance||0);
  const eqPct=m.homeValue?Math.max(0,Math.min(100,(equity/m.homeValue)*100)):0;
  document.getElementById('eq-value').textContent=m.homeValue?fmt(equity):'—';
  document.getElementById('eq-bar').style.width=eqPct+'%';
  document.getElementById('eq-lbl-l').textContent='Balance: '+fmt(m.balance);
  document.getElementById('eq-lbl-r').textContent='Value: '+fmt(m.homeValue);

  const sumEl=document.getElementById('m-summary');
  if(!m.balance||!m.rate||!m.years){sumEl.innerHTML='<div class="empty" style="padding:14px"><p>Save mortgage details to see calculations</p></div>';document.getElementById('offset-sim-card').style.display='none';return;}

  const isIO=m.reptype==='io';
  const effBal=Math.max(0,(m.balance||0)-(m.offset||0));
  const repNoOff=isIO?m.balance*(m.rate/100/12):calcRepayment(m.balance,m.rate,m.years);
  const intNoOff=m.balance*(m.rate/100/12);
  const intWithOff=effBal*(m.rate/100/12);
  const repWithOff=isIO?intWithOff:repNoOff;
  const paidOff=m.original?((m.original-m.balance)/m.original*100):0;

  // Simulated months with offset
  let simMonths=0,simTotalInt=0;
  if(!isIO&&m.offset){
    let bal=m.balance;const r=m.rate/100/12;
    while(bal>0.01&&simMonths<m.years*12*2){
      const eff=Math.max(0,bal-m.offset);const int=eff*r;
      simTotalInt+=int;const prin=Math.min(repNoOff-int,bal);
      if(prin<=0)break;bal-=prin;simMonths++;
    }
  }else{simMonths=calcMonthsPayoff(m.balance,m.rate,repNoOff);}

  // ── Acquired / capital growth rows ──────────────────────────
  const holdDur = _mortgageHoldDuration(m.acquiredDate);
  const acqRows = m.acquiredDate ? `
    <div class="dr"><span class="dr-k">📅 Acquired</span><span class="dr-v">${new Date(m.acquiredDate+'T00:00:00').toLocaleDateString('en-AU',{day:'numeric',month:'short',year:'numeric'})}</span></div>
    <div class="dr"><span class="dr-k">Hold Period</span><span class="dr-v">${holdDur||'—'}</span></div>` : '';
  const capGainRows = (m.purchasePrice > 0 && m.homeValue > 0) ? (() => {
    const gain = m.homeValue - m.purchasePrice;
    const gainPct = (gain / m.purchasePrice * 100).toFixed(1);
    const holdYrs = m.acquiredDate ? (() => {
      var then = new Date(m.acquiredDate+'T00:00:00'), now = new Date();
      var y = now.getFullYear()-then.getFullYear(), mo = now.getMonth()-then.getMonth();
      if(mo<0){y--;mo+=12;} return y+(mo/12);
    })() : 0;
    const cagr = (holdYrs > 0.5)
      ? ((Math.pow(m.homeValue/m.purchasePrice, 1/holdYrs)-1)*100).toFixed(1)+'% p.a.'
      : '';
    return `
    <div class="dr"><span class="dr-k">Purchase Price</span><span class="dr-v">${fmt(m.purchasePrice)}</span></div>
    <div class="dr"><span class="dr-k">Capital Growth</span><span class="dr-v" style="color:${gain>=0?'var(--success)':'var(--danger)'}">${gain>=0?'+':''}${fmt(gain)} (${gain>=0?'+':''}${gainPct}%)</span></div>`
    + (cagr ? `<div class="dr"><span class="dr-k">Annualised Growth</span><span class="dr-v" style="color:var(--success)">${cagr}</span></div>` : '');
  })() : '';

  sumEl.innerHTML=`
    <div class="dr"><span class="dr-k">Rate (p.a.)</span><span class="dr-v">${m.rate}%</span></div>
    <div class="dr"><span class="dr-k">Loan Balance</span><span class="dr-v">${fmt(m.balance)}</span></div>
    <div class="dr"><span class="dr-k">Offset (${m.offsetName||'Offset'})</span><span class="dr-v" style="color:var(--primary)">${fmt(m.offset||0)}</span></div>
    <div class="dr"><span class="dr-k">Effective Balance</span><span class="dr-v" style="color:var(--success)">${fmt(effBal)}</span></div>
    <div class="dr"><span class="dr-k">Monthly Repayment</span><span class="dr-v">${fmt(repWithOff)}</span></div>
    <div class="dr"><span class="dr-k">Monthly Interest</span><span class="dr-v">${fmt(intWithOff)}</span></div>
    <div class="dr"><span class="dr-k">Loan Paid Off</span><span class="dr-v" style="color:var(--primary)">${paidOff.toFixed(1)}%</span></div>
    <div class="dr"><span class="dr-k">Equity</span><span class="dr-v" style="color:var(--primary)">${eqPct.toFixed(1)}%</span></div>
    ${acqRows}${capGainRows}`;

  const sim=document.getElementById('offset-sim-card');
  sim.style.display='block';
  const maxOff=Math.min(m.balance,Math.ceil(m.balance/1000)*1000);
  const sl=document.getElementById('offset-slider');
  sl.max=maxOff;sl.step=Math.max(100,Math.round(maxOff/500)*100);sl.value=m.offset||0;
  document.getElementById('sim-max-lbl').textContent=fmt(maxOff);
  runOffsetSim(m.offset||0);
  renderPaydownChart();
  renderRateSensitivity();
  // Show CT offset sync banner + auto-populate field if empty
  const{balance:ctOff,month:ctOffMonth}=getLatestCTOffset();
  updateCTOffsetBanner(ctOff,ctOffMonth);
  const offEl=document.getElementById('m-offset');
  if(ctOff>0&&offEl&&(!offEl.value||parseFloat(offEl.value)===0)){
    offEl.value=ctOff;
    syncOffsetSlider();
  }
}

function runOffsetSim(offVal){
  const m=MORTGAGE;if(!m.balance||!m.rate||!m.years)return;
  offVal=Math.max(0,Math.min(Number(offVal),m.balance));
  const isIO=m.reptype==='io';
  const r=m.rate/100/12;
  const effBal=Math.max(0,m.balance-offVal);
  const repBase=isIO?m.balance*r:calcRepayment(m.balance,m.rate,m.years);
  const intNoOff=m.balance*r,intWithOff=effBal*r;
  const totalIntNoOff=isIO?intNoOff*m.years*12:calcTotalInt(m.balance,m.rate,m.years);
  const mNoOff=isIO?m.years*12:calcMonthsPayoff(m.balance,m.rate,repBase);

  // Simulate with offset
  let simM=0,simTI=0;
  if(!isIO){
    let bal=m.balance;
    while(bal>0.01&&simM<m.years*24){
      const eff=Math.max(0,bal-offVal);const int=eff*r;
      simTI+=int;const prin=Math.min(repBase-int,bal);
      if(prin<=0)break;bal-=prin;simM++;
    }
  }else{simM=m.years*12;simTI=intWithOff*m.years*12;}

  const intSaved=Math.max(0,totalIntNoOff-simTI);
  const termSaved=Math.max(0,mNoOff-simM);

  document.getElementById('sim-offset-lbl').textContent=fmt(offVal);
  document.getElementById('occ-int-b').textContent=fmt(intNoOff)+'/mo';
  document.getElementById('occ-int-a').textContent=fmt(intWithOff)+'/mo';
  document.getElementById('occ-int-s').textContent=intNoOff-intWithOff>0.01?'↓ '+fmt(intNoOff-intWithOff)+'/mo saved':'';
  document.getElementById('occ-rep-b').textContent=fmt(repBase)+'/mo';
  document.getElementById('occ-rep-a').textContent=fmt(isIO?intWithOff:repBase)+'/mo';
  document.getElementById('occ-rep-s').textContent=isIO&&intNoOff-intWithOff>0.01?'↓ '+fmt(intNoOff-intWithOff)+' less/mo':'Same payment, less interest';
  document.getElementById('occ-trm-b').textContent=fmtMonths(mNoOff);
  document.getElementById('occ-trm-a').textContent=fmtMonths(simM);
  document.getElementById('occ-trm-s').textContent=termSaved>0?'↓ '+fmtMonths(termSaved)+' sooner':'';
  document.getElementById('occ-total-save').textContent=intSaved>0?fmt(intSaved):'—';
  const savePct=totalIntNoOff>0?Math.min(100,intSaved/totalIntNoOff*100):0;
  document.getElementById('occ-save-bar').style.width=savePct+'%';
}

// ══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
// MORTGAGE PAYDOWN CHART
// ══════════════════════════════════════════════════════════════
let paydownChart=null;
let paydownYearly=true;

function togglePaydownView(){
  paydownYearly=!paydownYearly;
  document.getElementById('pd-view-btn').textContent=paydownYearly?'Show Monthly':'Show Yearly';
  renderPaydownChart();
}

function buildPaydownSchedule(balance, rate, years, offset, isIO){
  const r=rate/100/12;
  const repmt=isIO?balance*r:calcRepayment(balance,rate,years);
  const repmt_off=isIO?(Math.max(0,balance-offset))*r:repmt;
  const maxM=years*12;
  const withOff=[],withoutOff=[];
  let balOff=balance,balNoOff=balance;

  for(let m=0;m<=maxM;m++){
    if(paydownYearly){
      if(m%12===0){withOff.push(Math.max(0,balOff));withoutOff.push(Math.max(0,balNoOff));}
    } else {
      withOff.push(Math.max(0,balOff));withoutOff.push(Math.max(0,balNoOff));
    }
    if(balOff<=0&&balNoOff<=0)break;
    // With offset
    if(balOff>0){
      const eff=Math.max(0,balOff-offset);
      const int=eff*r;
      const prin=Math.min(isIO?0:repmt-int,balOff);
      if(!isIO)balOff=Math.max(0,balOff-prin);
    }
    // Without offset
    if(balNoOff>0){
      const int2=balNoOff*r;
      const prin2=Math.min(isIO?0:repmt-int2,balNoOff);
      if(!isIO)balNoOff=Math.max(0,balNoOff-prin2);
    }
  }
  // Pad to same length
  while(withOff.length<withoutOff.length)withOff.push(0);
  while(withoutOff.length<withOff.length)withoutOff.push(0);
  return{withOff,withoutOff,repmt,repmt_off};
}

function renderPaydownChart(){
  const m=MORTGAGE;
  const pdCard=document.getElementById('mortgage-paydown-card');
  if(!m.balance||!m.rate||!m.years){if(pdCard)pdCard.style.display='none';return;}
  if(pdCard)pdCard.style.display='block';

  const isIO=m.reptype==='io';
  const {withOff,withoutOff,repmt,repmt_off}=buildPaydownSchedule(m.balance,m.rate,m.years,m.offset||0,isIO);

  const step=paydownYearly?12:1;
  const now=new Date().getFullYear();
  const labels=withOff.map((_,i)=>paydownYearly?(now+i).toString():'Mo '+(i+1));

  // Find payoff points
  const payoffWith=withOff.findIndex(v=>v<=0.01);
  const payoffWithout=withoutOff.findIndex(v=>v<=0.01);
  const mosSaved=payoffWith>-1&&payoffWithout>-1?(payoffWithout-payoffWith)*step:0;

  // Total interest
  const totalIntNo=isIO?(m.balance*(m.rate/100/12)*m.years*12):(repmt*m.years*12-m.balance);
  const simM=payoffWith>-1?payoffWith*step:m.years*12;
  let simTI=0;
  {let bal=m.balance;const r=m.rate/100/12;
   for(let i=0;i<simM;i++){const eff=Math.max(0,bal-(m.offset||0));const int=eff*r;simTI+=int;const prin=Math.min(repmt-int,bal);if(prin<=0)break;bal-=prin;}}
  const intSaved=Math.max(0,totalIntNo-simTI);

  const ctx=document.getElementById('paydown-chart')?.getContext('2d');
  if(!ctx)return;
  if(paydownChart)paydownChart.destroy();
  const mgToken=function(n){return getComputedStyle(document.documentElement).getPropertyValue(n).trim()||'';};
  paydownChart= safeChart(ctx,{
    type:'line',
    data:{labels,datasets:[
      {label:'Balance (no offset)',data:withoutOff,borderColor:'#4a3060',backgroundColor:'#4a306022',
        fill:true,tension:.3,pointRadius:0,pointHoverRadius:4,borderWidth:2},
      {label:'Balance (with offset)',data:withOff,borderColor:'#e8457a',backgroundColor:'#e8457a22',
        fill:true,tension:.3,pointRadius:0,pointHoverRadius:4,borderWidth:2.5},
    ]},
    options:{responsive:true,maintainAspectRatio:false,
      interaction:{mode:'index',intersect:false},
      plugins:{
        legend:{position:'top',labels:{font:{family:'Inter',size:11},padding:14,color:mgToken('--muted')}},
        tooltip:{callbacks:{
          label:c=>' '+c.dataset.label+': '+fmt(c.parsed.y),
          afterBody:(items)=>{
            const yr=paydownYearly?items[0].dataIndex:(Math.floor(items[0].dataIndex/12));
            return items[0].dataIndex>0?[`Year ${yr} equity: ${fmt(Math.max(0,(m.homeValue||0)-items[0].parsed.y))}`]:[];
          }
        }}
      },
      scales:{
        x:{grid:{display:false},ticks:{font:{family:'Inter',size:10},color:mgToken('--muted'),maxTicksLimit:12}},
        y:{grid:{color:mgToken('--card3')},ticks:{font:{family:'Inter',size:10},color:mgToken('--muted'),
          callback:v=>'$'+Math.round(v/1000)+'k'},min:0}
      }
    }
  });

  // Stats
  const statsEl=document.getElementById('paydown-stats');
  if(statsEl) statsEl.innerHTML=`
    <div class="stat stat-pink" style="padding:14px 16px">
      <div class="sl">Monthly Repayment</div>
      <div class="sv" style="font-size:1.35rem">${fmt(repmt)}</div>
      <div class="ss">P&I based on current details</div>
    </div>
    <div class="stat stat-rose" style="padding:14px 16px">
      <div class="sl">Interest Saved (offset)</div>
      <div class="sv" style="font-size:1.35rem">${intSaved>0?fmt(intSaved):'—'}</div>
      <div class="ss">${mosSaved>0?fmtMonths(mosSaved)+' sooner':'vs no offset'}</div>
    </div>
    <div class="stat stat-dark" style="padding:14px 16px">
      <div class="sl">Loan Paid Off In</div>
      <div class="sv" style="font-size:1.35rem">${payoffWith>-1?fmtMonths(payoffWith*(paydownYearly?12:1)):fmtMonths(m.years*12)}</div>
      <div class="ss">with current offset</div>
    </div>`;
}

// ══════════════════════════════════════════════════════════════

// RATE SENSITIVITY CALCULATOR
// ══════════════════════════════════════════════════════════════

function renderRateSensitivity(){
  const m = MORTGAGE;
  const card = document.getElementById('rate-sensitivity-card');
  if (!card) return;
  if (!m.balance || !m.rate || !m.years) { card.style.display = 'none'; return; }
  card.style.display = 'block';

  // Init slider to current rate
  const slider = document.getElementById('rate-sim-slider');
  if (slider) {
    slider.value = m.rate;
    slider.min = Math.max(0.5, (m.rate - 4)).toFixed(2);
    slider.max = Math.min(20, (m.rate + 6)).toFixed(2);
  }
  document.getElementById('rate-sim-lbl').textContent = m.rate + '%';

  buildRateTable(m.rate);
  updateRateImpact(m.rate);
}

function onRateSlider(val){
  val = parseFloat(val);
  document.getElementById('rate-sim-lbl').textContent = val.toFixed(2) + '%';
  updateRateImpact(val);
}

function updateRateImpact(simRate){
  const m = MORTGAGE;
  if (!m.balance || !m.rate || !m.years) return;
  simRate = parseFloat(simRate);

  const isIO = m.reptype === 'io';
  // Always use raw outstanding balance — offset reduces interest cost but not the contractual repayment
  const balance = m.balance;

  const currentRepmt = isIO ? balance * (m.rate/100/12) : calcRepayment(balance, m.rate, m.years);
  const simRepmt     = isIO ? balance * (simRate/100/12) : calcRepayment(balance, simRate, m.years);
  const currentInt   = balance * (m.rate/100/12);
  const simInt       = balance * (simRate/100/12);

  const deltaMonthly = simRepmt - currentRepmt;
  const deltaAnnual  = deltaMonthly * 12;
  const rateChange   = simRate - m.rate;

  const badgesEl = document.getElementById('rate-impact-badges');
  if (badgesEl) {
    const sign = deltaMonthly >= 0 ? '+' : '';
    const color = deltaMonthly > 0 ? 'var(--danger)' : deltaMonthly < 0 ? 'var(--success)' : 'var(--muted)';
    const bg    = deltaMonthly > 0 ? '#2a1020'       : deltaMonthly < 0 ? '#1a2a1a'        : '#2a2535';
    const rateColor = rateChange > 0 ? 'var(--danger)' : rateChange < 0 ? 'var(--success)' : 'var(--muted)';
    const rateBg    = rateChange > 0 ? '#2a1020'       : rateChange < 0 ? '#1a2a1a'        : '#2a2535';

    badgesEl.innerHTML = `
      <div class="rate-badge">
        <div class="rb-label">Current Rate</div>
        <div class="rb-val" style="color:var(--primary)">${m.rate}%</div>
        <div class="rb-delta" style="color:var(--muted)">your loan rate</div>
      </div>
      <div class="rate-badge">
        <div class="rb-label">Simulated Rate</div>
        <div class="rb-val" style="color:${rateColor}">${simRate.toFixed(2)}%</div>
        <div class="rb-delta" style="color:${rateColor}">${rateChange>0?'+':''}${rateChange.toFixed(2)}% change</div>
      </div>
      <div class="rate-badge">
        <div class="rb-label">New Monthly Repayment</div>
        <div class="rb-val" style="color:${color}">${fmt(simRepmt)}</div>
        <div class="rb-delta" style="color:${color}">${sign}${fmt(deltaMonthly)} / mo</div>
      </div>
      <div class="rate-badge">
        <div class="rb-label">Annual Impact</div>
        <div class="rb-val" style="color:${color}">${sign}${fmt(Math.abs(deltaAnnual))}</div>
        <div class="rb-delta" style="color:${color}">${deltaAnnual>0?'extra cost':'annual saving'} per year</div>
      </div>`;
  }

  // Budget callout
  const callout = document.getElementById('rate-budget-callout');
  if (callout) {
    if (Math.abs(deltaMonthly) < 0.5) {
      callout.style.display = 'none';
    } else {
      callout.style.display = 'block';
      if (deltaMonthly > 0) {
        // Rate rise — how to absorb it
        const extraPerWeek = deltaAnnual / 52;
        callout.style.background = 'var(--danger-bg)';
        callout.style.border = '1px solid var(--danger-border)';
        callout.style.color = 'var(--text)';
        callout.innerHTML = `
          <div style="font-weight:700;color:var(--danger);margin-bottom:8px">⚠️ Rate Rise Impact — ${fmt(deltaMonthly)}/mo increase</div>
          To absorb a rate rise to <strong>${simRate.toFixed(2)}%</strong>, you'd need to find an extra
          <strong style="color:var(--danger)">${fmt(deltaMonthly)} per month</strong>
          (${fmt(extraPerWeek)}/week · ${fmt(deltaAnnual)}/year).<br/><br/>
          <strong>Ways to buffer this:</strong><br/>
          • Increase your offset account by <strong>${fmt(deltaMonthly / (m.rate/100/12))}</strong> to offset the extra monthly interest<br/>
          • Redirect <strong>${fmt(deltaMonthly)}/mo</strong> from discretionary spending to your mortgage buffer<br/>
          • Review subscriptions, dining, or entertainment to free up <strong>${fmt(extraPerWeek)}/week</strong>`;
      } else {
        // Rate cut — savings opportunity
        const savedPerWeek = Math.abs(deltaAnnual) / 52;
        callout.style.background = 'var(--success-bg)';
        callout.style.border = '1px solid var(--success-border)';
        callout.style.color = 'var(--text)';
        callout.innerHTML = `
          <div style="font-weight:700;color:var(--success);margin-bottom:8px">✅ Rate Cut Opportunity — ${fmt(Math.abs(deltaMonthly))}/mo saving</div>
          At <strong>${simRate.toFixed(2)}%</strong> you'd save
          <strong style="color:var(--success)">${fmt(Math.abs(deltaMonthly))} per month</strong>
          (${fmt(savedPerWeek)}/week · ${fmt(Math.abs(deltaAnnual))}/year).<br/><br/>
          <strong>Make the most of it:</strong><br/>
          • Keep repayments the same — extra <strong>${fmt(Math.abs(deltaMonthly))}/mo</strong> pays off principal faster<br/>
          • Direct savings to your offset: add <strong>${fmt(Math.abs(deltaMonthly))}/mo</strong> to reduce interest further<br/>
          • Top up savings goals by <strong>${fmt(savedPerWeek)}/week</strong>`;
      }
    }
  }
}

function buildRateTable(currentRate){
  const m = MORTGAGE;
  const isIO = m.reptype === 'io';
  // Use raw loan balance — sensitivity shows contractual repayments, not offset-adjusted
  const balance = m.balance;

  const baseRate = parseFloat(currentRate);
  const scenarios = [];
  for (let r = Math.max(0.5, baseRate - 3); r <= baseRate + 3.01; r += 0.25) {
    scenarios.push(parseFloat(r.toFixed(2)));
  }
  if (!scenarios.includes(baseRate)) scenarios.push(baseRate);
  scenarios.sort((a,b) => a - b);

  const currentRepmt = isIO ? balance*(baseRate/100/12) : calcRepayment(balance, baseRate, m.years);

  const tbody = document.getElementById('rate-tbody');
  if (!tbody) return;

  tbody.innerHTML = scenarios.map(rate => {
    const repmt   = isIO ? balance*(rate/100/12) : calcRepayment(balance, rate, m.years);
    const intMo   = balance * (rate/100/12);
    const annual  = repmt * 12;
    const delta   = repmt - currentRepmt;
    const deltaAnn= delta * 12;
    const isCurrent = Math.abs(rate - baseRate) < 0.001;
    const rateChange = rate - baseRate;

    const deltaClass = delta > 0.5 ? 'rate-delta-pos' : delta < -0.5 ? 'rate-delta-neg' : 'rate-delta-nil';
    const chipClass  = rateChange > 0.1 ? 'rate-up' : rateChange < -0.1 ? 'rate-dn' : 'rate-eq';
    const chipText   = rateChange > 0.1 ? '+'+rateChange.toFixed(2)+'%' : rateChange < -0.1 ? rateChange.toFixed(2)+'%' : 'Current';
    const deltaText  = Math.abs(delta) < 0.5 ? '—' : (delta>0?'+':'')+fmt(delta)+'/mo';
    const deltaAnnText = Math.abs(deltaAnn) < 1 ? '—' : (deltaAnn>0?'+':'')+fmt(deltaAnn)+'/yr';

    return `<tr class="${isCurrent ? 'rate-current' : ''}">
      <td><strong>${rate.toFixed(2)}%</strong> <span class="rate-chip ${chipClass}">${chipText}</span></td>
      <td style="font-weight:${isCurrent?'700':'400'};color:${isCurrent?'var(--primary)':'inherit'}">${fmt(repmt)}</td>
      <td class="${deltaClass}">${deltaText}</td>
      <td>${fmt(intMo)}</td>
      <td>${fmt(annual)}</td>
      <td class="${deltaClass}">${deltaAnnText}</td>
    </tr>`;
  }).join('');
}


// ══════════════════════════════════════════════════════════════
// LIFE INSURANCE NEEDS ANALYSIS
// ══════════════════════════════════════════════════════════════
let liMethod = 'dime'; // dime | income | needs


// ══════════════════════════════════════════════════════════════
