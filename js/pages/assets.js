let assetsChart=null;

function renderAssets(){
  // Bank
  const months=ctAllMonths();
  const lm=months.length?months[months.length-1]:null;
  const bankRows=CT_ACCTS.map(a=>{const b=lm?((CT[a.id]||{})[lm]||0):0;return{label:ctLabel(a),icon:a.icon,value:b};});
  const bankTotal=bankRows.reduce((s,r)=>s+r.value,0);
  document.getElementById('assets-bank').innerHTML=bankRows.map(r=>`<div class="dr"><span class="dr-k">${r.icon} ${r.label}</span><span class="dr-v">${fmt(r.value)}</span></div>`).join('')
    +`<div class="dr" style="border-top:1.5px solid var(--border);margin-top:4px;padding-top:10px"><span class="dr-k" style="font-weight:700">Total Bank</span><span class="dr-v" style="color:var(--primary)">${fmt(bankTotal)}</span></div>`;

  // Super
  const supB=SUPER.b?.balance||0,supS=SUPER.s?.balance||0,supTotal=supB+supS;
  document.getElementById('assets-super').innerHTML=`
    <div class="dr"><span class="dr-k">💼 ${getUserName('brenton')}</span><span class="dr-v">${fmt(supB)}</span></div>
    <div class="dr"><span class="dr-k">💼 ${getUserName('shelley')}</span><span class="dr-v">${fmt(supS)}</span></div>
    <div class="dr" style="border-top:1.5px solid var(--border);margin-top:4px;padding-top:10px"><span class="dr-k" style="font-weight:700">Total Super</span><span class="dr-v" style="color:var(--primary)">${fmt(supTotal)}</span></div>`;

  // Property
  const hv=MORTGAGE.homeValue||0,mb=MORTGAGE.balance||0,off=MORTGAGE.offset||0,eq=hv-mb;
  document.getElementById('assets-property').innerHTML=hv?`
    <div class="dr"><span class="dr-k">🏡 Home Value</span><span class="dr-v">${fmt(hv)}</span></div>
    <div class="dr"><span class="dr-k">📉 Mortgage</span><span class="dr-v" style="color:var(--danger)">-${fmt(mb)}</span></div>
    <div class="dr"><span class="dr-k">🏦 Offset</span><span class="dr-v" style="color:var(--success)">${fmt(off)}</span></div>
    <div class="dr" style="border-top:1.5px solid var(--border);margin-top:4px;padding-top:10px"><span class="dr-k" style="font-weight:700">Net Equity</span><span class="dr-v" style="color:var(--primary)">${fmt(eq)}</span></div>`
    :'<div class="empty" style="padding:12px 0"><p>Add mortgage details</p></div>';

  const taxOwing=(typeof taxTotalOwing==='function')?taxTotalOwing():0;
  const eqVal=(typeof eqTotalEquitiesValue==='function')?eqTotalEquitiesValue():0;
  const netWorth=bankTotal+supTotal+Math.max(0,eq)+eqVal-taxOwing;

  // Equities summary card
  const eqSummEl=document.getElementById('assets-equities-summary');
  if(eqSummEl){
    if(eqVal>0){
      eqSummEl.innerHTML='<div class="dr"><span class="dr-k">RSU Grants (vested)</span><span class="dr-v">'+fmt(typeof eqRSUFromTax==='function'?eqRSUFromTax():0)+'</span></div>'
        +'<div class="dr"><span class="dr-k">Manual Holdings</span><span class="dr-v">'+fmt(EQUITIES.reduce(function(s,h){return s+eqTotalValue(h);},0))+'</span></div>'
        +'<div class="dr" style="border-top:1.5px solid var(--border);margin-top:4px;padding-top:10px"><span class="dr-k" style="font-weight:700">Total Equities</span><span class="dr-v" style="color:var(--primary)">'+fmt(eqVal)+'</span></div>';
    } else {
      eqSummEl.innerHTML='<div class="empty" style="padding:10px 0"><p>No equity holdings yet.</p></div>';
    }
  }

  document.getElementById('assets-stats').innerHTML=''
    +'<div class="stat stat-pink"><div class="sl">Net Worth</div><div class="sv">'+fmt(netWorth)+'</div><div class="ss">All assets minus liabilities</div></div>'
    +'<div class="stat stat-rose"><div class="sl">Bank Balances</div><div class="sv">'+fmt(bankTotal)+'</div><div class="ss">Cash Tracker</div></div>'
    +'<div class="stat stat-purple"><div class="sl">Superannuation</div><div class="sv">'+fmt(supTotal)+'</div><div class="ss">'+getUserName('brenton')+' + '+getUserName('shelley')+'</div></div>'
    +'<div class="stat stat-dark"><div class="sl">Home Equity</div><div class="sv">'+fmt(Math.max(0,eq))+'</div><div class="ss">Value minus mortgage</div></div>'
    +(eqVal>0?'<div class="stat stat-dark"><div class="sl">Equities</div><div class="sv" style="color:var(--success)">'+fmt(eqVal)+'</div><div class="ss">RSU + Holdings</div></div>':'')
    +(taxOwing>0?'<div class="stat stat-rose"><div class="sl">Tax Owing</div><div class="sv" style="color:var(--danger)">-'+fmt(taxOwing)+'</div><div class="ss">Deducted from net worth</div></div>':'');

  document.getElementById('assets-note').textContent=lm?'Bank data as at '+new Date(lm+'-02').toLocaleString('default',{month:'long',year:'numeric'}):'Add cash tracker data to see bank balances';

  // Render the equity holdings list
  if(typeof renderEquitiesList==='function') renderEquitiesList();

  // Donut
  const chartData=[
    {label:'Bank',value:Math.max(0,bankTotal),color:'#e8457a'},
    {label:'Super',value:Math.max(0,supTotal),color:'#a29bfe'},
    {label:'Home Equity',value:Math.max(0,eq),color:'#f07aaa'},
    {label:'Equities',value:Math.max(0,eqVal),color:'#52d68a'},
  ].filter(d=>d.value>0);
  const ctx=document.getElementById('assets-chart')?.getContext('2d');if(!ctx)return;
  if(assetsChart)assetsChart.destroy();
  if(!chartData.length){ctx.clearRect(0,0,400,250);ctx.fillStyle='#8a8095';ctx.font='14px Inter';ctx.textAlign='center';ctx.fillText('No asset data yet',200,125);return;}
  assetsChart= safeChart(ctx,{
    type:'doughnut',
    data:{labels:chartData.map(d=>d.label),datasets:[{data:chartData.map(d=>d.value),backgroundColor:chartData.map(d=>d.color),borderWidth:3,borderColor:'#1f1c25',hoverOffset:6}]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{position:'bottom',labels:{font:{family:'Inter',size:12},padding:14,color:'#8a8095'}},
        tooltip:{callbacks:{label:c=>' '+c.label+': '+fmt(c.parsed)}}},
      onClick:(evt,els)=>{if(els.length){const l=chartData[els[0].index].label;
        if(l==='Bank')go('cash');else if(l==='Super')go('super');else if(l==='Home Equity')go('mortgage');
        toast('→ '+l);}}}
  });
}

