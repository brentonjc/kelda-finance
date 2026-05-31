// ══════════════════════════════════════════════════════════════
// SUPERANNUATION PAGE
// ══════════════════════════════════════════════════════════════

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


