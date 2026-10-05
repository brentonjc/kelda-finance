// ══════════════════════════════════════════════════════════════
// BORROWING POWER CALCULATOR  (Calculators ▸ Borrowing Power)
// ──────────────────────────────────────────────────────────────
// Ported from the standalone kelda-borrowing-calculator.html and
// rewired to sync from the app's LIVE financial data instead of
// guessing localStorage keys. Every identifier is prefixed `bc`
// so it never collides with the app's globals (go/save/load/fmt…).
//
// Estimate only — APRA 3% serviceability buffer + HEM benchmarks.
// ══════════════════════════════════════════════════════════════

var BC_KEY = 'kf_borrowing';   // manual edits persist here

// ── State ─────────────────────────────────────────────────────
var bcST        = {};
var bcProps     = [];
var bcCC        = [];
var bcLoans     = [];
var bcMorts     = [];
var bcImportLog = [];
var bcMounted   = false;

var BC_FIELDS = ['bc_b1_name','bc_b1_emp','bc_b2_name','bc_b2_emp','bc_dependants','bc_location','bc_purpose',
  'bc_b1_salary','bc_b1_overtime','bc_b1_bonus','bc_b2_salary','bc_b2_overtime','bc_b2_bonus',
  'bc_rental_income','bc_invest_income','bc_gov_income','bc_other_income','bc_hecs',
  'bc_exp_groceries','bc_exp_utilities','bc_exp_comms','bc_exp_transport','bc_exp_kids_clothing','bc_exp_personal',
  'bc_exp_dining','bc_exp_entertainment','bc_exp_clothing','bc_exp_alcohol','bc_exp_childcare','bc_exp_subs',
  'bc_exp_insurance','bc_exp_school','bc_exp_other',
  'bc_a_cash','bc_a_term','bc_a_shares','bc_a_super','bc_a_vehicles','bc_a_contents','bc_a_business',
  'bc_property_value','bc_deposit','bc_loan_amount','bc_interest_rate','bc_loan_term','bc_repay_type','bc_state','bc_fhb'];

// ── Persistence (this calculator's own manual edits) ──────────
function bcLoad() {
  try { var r = localStorage.getItem(BC_KEY); if (r) bcST = JSON.parse(r); } catch(e) { bcST = {}; }
}
function bcSave() {
  BC_FIELDS.forEach(function(id){ var el=document.getElementById(id); if(el) bcST[id]=el.value; });
  bcST.properties = bcProps.filter(Boolean);
  bcST.creditCards = bcCC.filter(Boolean);
  bcST.loans = bcLoans.filter(Boolean);
  bcST.mortgages = bcMorts.filter(Boolean);
  bcST.importLog = bcImportLog;
  try { localStorage.setItem(BC_KEY, JSON.stringify(bcST)); } catch(e) {}
}
function bcRestore() {
  BC_FIELDS.forEach(function(id){ var el=document.getElementById(id); if(el && bcST[id]!==undefined) el.value=bcST[id]; });
  document.getElementById('bc-property-list').innerHTML='';
  document.getElementById('bc-cc-list').innerHTML='';
  document.getElementById('bc-loan-list').innerHTML='';
  document.getElementById('bc-mortgage-list').innerHTML='';
  bcProps=[]; bcCC=[]; bcLoans=[]; bcMorts=[];
  if(bcST.properties)  bcST.properties.forEach(function(p){ bcAddProperty(p); });
  if(bcST.creditCards) bcST.creditCards.forEach(function(c){ bcAddCC(c); });
  if(bcST.loans)       bcST.loans.forEach(function(l){ bcAddLoan(l); });
  if(bcST.mortgages)   bcST.mortgages.forEach(function(m){ bcAddMortgage(m); });
  if(bcST.importLog)   bcImportLog = bcST.importLog;
  bcCalcIncome(); bcCalcHEM(); bcCalcAssets(); bcCalcLiabs(); bcCalcLoan();
}

// ── Helpers ───────────────────────────────────────────────────
function bcFmt(n){ if(!n||isNaN(n))n=0; return '$'+Math.round(n).toLocaleString('en-AU'); }
function bcFmtPct(n){ return (isNaN(n)?0:n).toFixed(1)+'%'; }
function bcV(id){ var el=document.getElementById(id); return el?(parseFloat(el.value)||0):0; }
function bcS(id){ var el=document.getElementById(id); return el?(el.value||''):''; }
function bcEsc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }

// ══════════════════════════════════════════════════════════════
// LIVE SYNC — read the app's real in-memory data & helpers
// (TX, MORTGAGE, LIABILITIES, INS, computeCurrentNetWorth …).
// This is what "sync with the app financial information" means.
// ══════════════════════════════════════════════════════════════
function bcSync() {
  bcImportLog = [];
  var imported = {};
  var now = new Date();

  // ---- INCOME — last 12 months of income transactions, split by person ----
  var txAll = (typeof TX !== 'undefined' && Array.isArray(TX)) ? TX : [];
  var twelveAgo = new Date(now.getFullYear()-1, now.getMonth(), 1);
  var b1Inc=0, b2Inc=0, rentInc=0;
  txAll.forEach(function(t){
    if(t.type!=='income') return;
    if(bcIsTransfer(t)) return;                        // internal transfers are NOT income
    var d; try { d = new Date(t.date); } catch(e){ return; }
    if(!(d >= twelveAgo)) return;
    var amt = Math.abs(parseFloat(t.amount)||0);
    // Rent tagged Investment Property is rental income (lenders shade it), not salary
    if((t.catId||'')==='investment_property'){ rentInc+=amt; return; }
    var p = (t.person||'').toLowerCase();
    if(p==='shelley'||p==='b2'||p==='person2') b2Inc+=amt; else b1Inc+=amt;
  });
  if(b1Inc>0){ bcST['bc_b1_salary']=Math.round(b1Inc); imported['bc_b1_salary']={val:Math.round(b1Inc),src:'transactions (12-mo)'}; }
  if(b2Inc>0){ bcST['bc_b2_salary']=Math.round(b2Inc); imported['bc_b2_salary']={val:Math.round(b2Inc),src:'transactions (12-mo)'}; }
  if(b1Inc>0||b2Inc>0){
    bcImportLog.push({type:'success',msg:'Imported income from transactions: '+bcFmt(b1Inc)+' / '+bcFmt(b2Inc)+' (annual, last 12 months)'});
  }
  if(rentInc>0){
    bcST['bc_rental_income']=Math.round(rentInc); imported['bc_rental_income']={val:Math.round(rentInc),src:'transactions (12-mo)'};
    bcImportLog.push({type:'success',msg:'Imported rental income: '+bcFmt(rentInc)+' (Investment Property, last 12 months)'});
  }
  // Borrower names from the app's profiles
  if(typeof getUserName==='function'){
    if(!bcST['bc_b1_name']) bcST['bc_b1_name']=getUserName('brenton')||'';
    if(!bcST['bc_b2_name'] && b2Inc>0) bcST['bc_b2_name']=getUserName('shelley')||'';
  }

  // ---- EXPENSES — 3-month average, mapped from app categories → HEM buckets ----
  var threeAgo = new Date(now.getFullYear(), now.getMonth()-3, 1);
  var bucket = { groceries:0,utilities:0,comms:0,transport:0,personal:0,dining:0,
                 entertainment:0,clothing:0,alcohol:0,childcare:0,subs:0,insurance:0,
                 kids_clothing:0,other:0 };
  // Explicit subcategory-level mapping (see bcClassifyExpense). Transfers and
  // non-living categories (tax, business, holidays, mortgage, capital) are
  // excluded so they can't inflate the figures.
  txAll.forEach(function(t){
    if(t.type!=='expense') return;
    if(bcIsTransfer(t)) return;                        // internal transfers are NOT spending
    var d; try { d = new Date(t.date); } catch(e){ return; }
    if(!(d >= threeAgo)) return;
    var amt = Math.abs(parseFloat(t.amount)||0);
    if(!amt) return;
    var cid  = (t.catId||'').toLowerCase();
    var sub  = (t.subcategory||t.subcat||'').toLowerCase();
    var text = ((t.category||'')+' '+sub+' '+(t.merchant||t.name||t.description||'')).toLowerCase();
    var b = bcClassifyExpense(cid, sub, text);
    if(b && bucket.hasOwnProperty(b)) bucket[b]+=amt;
  });
  var expMap = {
    bc_exp_groceries:'groceries', bc_exp_utilities:'utilities', bc_exp_comms:'comms',
    bc_exp_transport:'transport', bc_exp_personal:'personal', bc_exp_dining:'dining',
    bc_exp_entertainment:'entertainment', bc_exp_clothing:'clothing', bc_exp_alcohol:'alcohol',
    bc_exp_childcare:'childcare', bc_exp_subs:'subs', bc_exp_insurance:'insurance',
    bc_exp_kids_clothing:'kids_clothing', bc_exp_other:'other'
  };
  var expCount=0;
  Object.keys(expMap).forEach(function(field){
    var val = Math.round(bucket[expMap[field]]/3);   // monthly average
    // The sync OWNS these fields — always write the computed value (including 0)
    // so the calculator reflects current app data and never keeps a stale figure
    // when a category drops to zero. Only >0 gets the "imported" badge/count.
    bcST[field]=val;
    if(val>0){ imported[field]={val:val,src:'transactions (3-mo avg)'}; expCount++; }
  });
  if(expCount>0){
    bcImportLog.push({type:'success',msg:'Imported '+expCount+' expense categories (3-month average from your transactions)'});
  } else if(txAll.length>0){
    bcImportLog.push({type:'warning',msg:'Found transactions but none in the last 3 months matched an expense bucket — enter living expenses manually.'});
  } else {
    bcImportLog.push({type:'info',msg:'No transactions found yet — enter living expenses manually.'});
  }

  // ---- INSURANCE premiums (Insurance page) → committed monthly expense ----
  try {
    if(typeof INS!=='undefined' && Array.isArray(INS) && INS.length && typeof insToAnnual==='function'){
      var insMo = INS.reduce(function(s,p){ return s + insToAnnual(parseFloat(p.prem)||0, p.freq)/12; }, 0);
      if(insMo>0){ bcST['bc_exp_insurance']=Math.round(insMo); imported['bc_exp_insurance']={val:Math.round(insMo),src:'Insurance page'};
        bcImportLog.push({type:'success',msg:'Imported insurance premiums: '+bcFmt(insMo)+'/mo from the Insurance page'}); }
    }
  } catch(e){}

  // ---- ASSETS & LIABILITIES — from the app's net-worth engine ----
  var nw = (typeof computeCurrentNetWorth==='function') ? computeCurrentNetWorth() : null;
  if(nw){
    if(nw.bank>0){ bcST['bc_a_cash']=Math.round(nw.bank); imported['bc_a_cash']={val:Math.round(nw.bank),src:'Bank Accounts'};
      bcImportLog.push({type:'success',msg:'Imported cash & savings: '+bcFmt(nw.bank)+' from Bank Accounts'}); }
    if(nw.super_>0){ bcST['bc_a_super']=Math.round(nw.super_); imported['bc_a_super']={val:Math.round(nw.super_),src:'Super'}; }
    if(nw.equities>0){ bcST['bc_a_shares']=Math.round(nw.equities); imported['bc_a_shares']={val:Math.round(nw.equities),src:'Investments'}; }
  }

  // ---- PROPERTY + EXISTING MORTGAGES — from Mortgages page ----
  bcProps = []; bcMorts = [];
  try {
    var mts = (typeof liabAllMortgages==='function') ? liabAllMortgages() : [];
    mts.forEach(function(m){
      if(m.homeValue>0){ bcProps.push({address:m.lender||'Property', value:m.homeValue, mortgage:m.balance||0}); }
      if(m.balance>0){
        bcMorts.push({property:m.lender||'Home Loan', balance:m.balance, repayment:Math.round(m.payment||0), rate:m.rate||0});
      }
    });
    if(bcMorts.length){ imported['mortgage']={val:bcMorts[0].balance,src:'Mortgages page'};
      bcImportLog.push({type:'success',msg:'Imported '+bcMorts.length+' mortgage(s) and '+bcProps.length+' property asset(s) from Mortgages'}); }
  } catch(e){}

  // ---- OTHER LIABILITIES — credit cards / loans / HECS (Liabilities page) ----
  bcCC = []; bcLoans = [];
  try {
    if(typeof LIABILITIES!=='undefined' && Array.isArray(LIABILITIES)){
      LIABILITIES.forEach(function(l){
        var type=(l.type||'').toLowerCase();
        if(type==='credit_card'||type==='bnpl'){
          bcCC.push({name:l.lender||'Credit Card', limit:parseFloat(l.creditLimit)||parseFloat(l.balance)||0});
        } else if(type==='hecs'){
          if(!bcST['bc_hecs']) bcST['bc_hecs']=Math.round(parseFloat(l.balance)||0);
        } else if(type){
          bcLoans.push({name:l.lender||'Loan', balance:parseFloat(l.balance)||0, repayment:Math.round(parseFloat(l.payment)||0)});
        }
      });
      if(bcCC.length||bcLoans.length){
        bcImportLog.push({type:'success',msg:'Imported '+bcCC.length+' credit card(s) and '+bcLoans.length+' loan(s) from Liabilities'});
      }
    }
  } catch(e){}

  // ---- Loan default: seed the assessment rate from an existing mortgage ----
  if(!bcST['bc_interest_rate'] && bcMorts.length && bcMorts[0].rate>0){ bcST['bc_interest_rate']=bcMorts[0].rate; }

  if(Object.keys(imported).length===0){
    bcImportLog.push({type:'warning',msg:'No data found yet. This calculator works best once you have transactions, accounts, mortgage and liabilities entered in the app.'});
  }

  // Persist the synced state DIRECTLY — do NOT call bcSave() here, because
  // bcSave() reads values back out of the (still-empty) DOM inputs and would
  // wipe every scalar field we just set. bcRestore() then fills the DOM from
  // this saved state.
  bcST._imported = imported;
  bcST.properties  = bcProps.slice();
  bcST.creditCards = bcCC.slice();
  bcST.loans       = bcLoans.slice();
  bcST.mortgages   = bcMorts.slice();
  bcST.importLog   = bcImportLog;
  try { localStorage.setItem(BC_KEY, JSON.stringify(bcST)); } catch(e) {}
  bcRestore();
  bcRenderReview();
  bcRenderBadges();
}

// True if a transaction is an internal transfer (excluded everywhere in the app).
function bcIsTransfer(t){
  if(!t) return false;
  if((t.catId||'')==='transfers') return true;
  if(typeof isTransfer==='function'){ try { return isTransfer(t); } catch(e){} }
  return false;
}

// Classify one expense transaction into a calculator bucket.
//   → a HEM/committed bucket name  (counted in that field)
//   → 'other'                      (counted in "Other Committed Expenses")
//   → null                         (EXCLUDED from the assessment)
// Routing is explicit at the app's real catId + subcategory level — no greedy
// keyword matching on already-categorised transactions (that was mis-routing
// e.g. Council Rates → utilities, Business Insurance → insurance).
function bcClassifyExpense(cid, sub, text){
  sub = sub || '';
  function has(s){ return sub.indexOf(s)!==-1; }

  if(cid==='home'){
    if(has('mortgage')) return null;                       // counted as the mortgage liability
    if(has('improvement')||has('renovation')) return null; // capital works, not a living cost
    if(has('internet')) return 'comms';
    return 'other';                                         // cleaning, strata, maintenance, council rates
  }
  if(cid==='car_transport') return 'transport';
  if(cid==='health_beauty'||cid==='fitness') return 'personal';
  if(cid==='food_eating_out'){
    if(has('grocer')||has('other food')) return 'groceries';
    if(has('alcohol')||has('bar')) return 'alcohol';
    return 'dining';                                        // eating out, cafe, meal delivery, uber eats
  }
  if(cid==='children'){
    if(has('cloth')) return 'kids_clothing';
    if(has('toy')||has('present')||has('gift')) return 'other';
    return 'childcare';                                     // childcare, school fees, nannies, activities
  }
  if(cid==='pets') return 'other';                          // pets
  if(cid==='insurance_utilities') return 'insurance';
  if(cid==='utilities'){
    if(has('internet')||has('broadband')||has('mobile')||has('phone')) return 'comms';
    if(has('stream')) return 'subs';
    return 'utilities';                                     // power, gas, water, other utilities
  }
  if(cid==='entertainment'){
    if(has('netflix')||has('prime')||has('apple')||has('subscription')) return 'subs';
    if(has('wine')||has('present')||has('gift')) return 'other';
    return 'entertainment';
  }
  if(cid==='shopping'){
    if(has('cloth')) return 'clothing';                     // Clothing & Shopping
    return 'other';                                         // online/home shopping, gifts, donations
  }
  // Explicitly excluded categories. Investment Property costs aren't living
  // expenses — lenders net them off through the shaded rental income.
  if(cid==='tax'||cid==='business'||cid==='holidays_travel'||cid==='transfers'||cid==='investment_property') return null;

  // Genuinely uncategorised / "Other" / custom categories: a light keyword
  // fallback for the common basics, otherwise count as "Other Committed" so the
  // spend is still captured (conservative) rather than silently dropped.
  var kw = {
    groceries:['grocer','woolworths','coles','aldi','supermarket'],
    utilities:['electric','power bill','gas bill','water rates','energy','origin energy','agl'],
    comms:['telstra','optus','vodafone','broadband','nbn'],
    transport:['fuel','petrol','uber','taxi','opal','toll','rego'],
    personal:['pharmacy','chemist','doctor','gym'],
    dining:['restaurant','cafe','takeaway','uber eats','doordash','menulog'],
    subs:['netflix','spotify','disney'],
    alcohol:['bottle shop','dan murphy','liquor']
  };
  var found=null;
  Object.keys(kw).some(function(b){
    return kw[b].some(function(k){ if(text.indexOf(k)!==-1){ found=b; return true; } return false; });
  });
  return found || 'other';
}

// ══════════════════════════════════════════════════════════════
// REVIEW + SOURCE BADGES
// ══════════════════════════════════════════════════════════════
function bcRenderBadges(){
  var imported = bcST._imported || {};
  var map = {
    'bc_b1_salary':'bc_b1sal-src','bc_b2_salary':'bc_b2sal-src','bc_rental_income':'bc_rental-src',
    'bc_exp_groceries':'bc_gr-src','bc_exp_utilities':'bc_ut-src','bc_exp_comms':'bc_ph-src',
    'bc_exp_transport':'bc_tr-src','bc_exp_personal':'bc_pc-src','bc_exp_dining':'bc_di-src',
    'bc_exp_entertainment':'bc_en-src','bc_exp_clothing':'bc_cl-src','bc_exp_alcohol':'bc_al-src',
    'bc_exp_childcare':'bc_ch-src','bc_exp_subs':'bc_su-src','bc_exp_insurance':'bc_ins-src',
    'bc_a_cash':'bc_cash-src','bc_a_super':'bc_super-src','mortgage':'bc_mort-src'
  };
  Object.keys(map).forEach(function(field){
    var el=document.getElementById(map[field]); if(!el) return;
    // classList (not className) so layout classes on a badge, e.g. bc-ml6, survive
    el.textContent = imported[field] ? 'from '+imported[field].src : 'enter manually';
    el.classList.toggle('bc-src-manual', !imported[field]);
  });
}

function bcRenderReview(){
  var imported = bcST._imported || {};
  var hasImports = Object.keys(imported).length>0;
  var bannerEl = document.getElementById('bc-review-banner');
  if(bannerEl){
    bannerEl.innerHTML = '<div class="bc-import-banner">'+
      '<div class="bc-ib-icon"><i class="ti ti-'+(hasImports?'circle-check':'alert-triangle')+'"></i></div>'+
      '<div><div class="bc-ib-title">'+(hasImports?'Synced from your app data':'No app data found yet')+'</div>'+
      '<div class="bc-ib-sub">'+bcImportLog.map(function(l){
        var icon=l.type==='success'?'✓':l.type==='warning'?'⚠':'ℹ';
        return icon+' '+bcEsc(l.msg);
      }).join('<br>')+'</div></div></div>';
  }
  var contentEl = document.getElementById('bc-review-content');
  if(!contentEl) return;
  var homeVal = bcProps.length&&bcProps[0]?(bcProps[0].value||0):0;
  var mortBal = bcMorts.length&&bcMorts[0]?(bcMorts[0].balance||0):0;
  var rows = [
    {label:'Income — '+(bcS('bc_b1_name')||'Borrower 1'), field:'bc_b1_salary'},
    {label:'Income — '+(bcS('bc_b2_name')||'Borrower 2'), field:'bc_b2_salary'},
    {label:'Monthly Groceries', field:'bc_exp_groceries'},
    {label:'Monthly Utilities', field:'bc_exp_utilities'},
    {label:'Monthly Transport', field:'bc_exp_transport'},
    {label:'Monthly Dining', field:'bc_exp_dining'},
    {label:'Monthly Insurance', field:'bc_exp_insurance'},
    {label:'Cash & Savings', field:'bc_a_cash'},
    {label:'Superannuation', field:'bc_a_super'},
    {label:'Shares / ETFs', field:'bc_a_shares'},
    {label:'Home Value', field:'_homeValue'},
    {label:'Mortgage Balance', field:'_mortBal'}
  ];
  var tr = rows.map(function(r){
    var val = r.field==='_homeValue'?homeVal : r.field==='_mortBal'?mortBal : parseFloat(bcST[r.field]||0);
    var im  = r.field==='_homeValue'?imported['mortgage'] : r.field==='_mortBal'?imported['mortgage'] : imported[r.field];
    var badge = im ? '<span class="bc-src-badge">from '+bcEsc(im.src)+'</span>' : '<span class="bc-src-badge bc-src-manual">not found — enter manually</span>';
    var dv = val>0 ? '<span class="bc-green bc-mono">'+bcFmt(val)+'</span>' : '<span class="bc-muted">—</span>';
    return '<tr><td>'+bcEsc(r.label)+'</td><td>'+badge+'</td><td class="bc-r">'+dv+'</td></tr>';
  }).join('');
  contentEl.innerHTML = '<div class="bc-card"><div class="bc-card-title"><i class="ti ti-clipboard-list"></i> Imported data — review before proceeding</div>'+
    '<table class="bc-dt"><tr><th>Field</th><th>Source</th><th class="bc-r">Value</th></tr>'+tr+'</table>'+
    '<div class="bc-note"><strong>How to use this:</strong> synced values are pulled live from your app. Items marked "not found" need entering in the relevant step. Every figure is editable.</div></div>';
}

// ══════════════════════════════════════════════════════════════
// IN-PAGE STEP NAV
// ══════════════════════════════════════════════════════════════
var BC_STEPS = ['review','income','expenses','assets','liabilities','loandetails','results'];
function bcGo(step){
  BC_STEPS.forEach(function(s){
    var sec=document.getElementById('bc-sec-'+s); if(sec) sec.classList.toggle('active', s===step);
    var tab=document.getElementById('bc-tab-'+s); if(tab) tab.classList.toggle('active', s===step);
  });
  if(step==='results') bcGenerateReport();
  var top=document.getElementById('page-borrowing');
  if(top){ try{ top.scrollIntoView({block:'start'}); }catch(e){} }
  window.scrollTo(0,0);
}

// ══════════════════════════════════════════════════════════════
// CALCULATIONS  (unchanged logic, bc-prefixed)
// ══════════════════════════════════════════════════════════════
function bcCalcIncome(){
  var total=bcV('bc_b1_salary')+bcV('bc_b1_overtime')*.8+bcV('bc_b1_bonus')*.8+bcV('bc_b2_salary')+bcV('bc_b2_overtime')*.8+bcV('bc_b2_bonus')*.8+bcV('bc_rental_income')*.8+bcV('bc_invest_income')+bcV('bc_gov_income')+bcV('bc_other_income');
  var gross=bcV('bc_b1_salary')+bcV('bc_b2_salary');
  var hr=0; if(gross>120000)hr=.10;else if(gross>100000)hr=.085;else if(gross>80000)hr=.07;else if(gross>60000)hr=.05;else if(gross>47014)hr=.01;
  var hm=bcV('bc_hecs')>0?gross*hr/12:0;
  var el=document.getElementById('bc-income-summary'); if(!el)return;
  el.innerHTML='<div class="bc-sc"><div class="bc-sl">Total Assessed (p.a.)</div><div class="bc-sv bc-green">'+bcFmt(total)+'</div><div class="bc-ss">After shading</div></div>'+
    '<div class="bc-sc"><div class="bc-sl">Monthly Gross</div><div class="bc-sv">'+bcFmt(total/12)+'</div></div>'+
    '<div class="bc-sc"><div class="bc-sl">HECS Repayment</div><div class="bc-sv bc-amber">'+bcFmt(hm)+'</div><div class="bc-ss">per month</div></div>'+
    '<div class="bc-sc"><div class="bc-sl">Net Monthly</div><div class="bc-sv">'+bcFmt(total/12-hm)+'</div><div class="bc-ss">After HECS</div></div>';
  // HEM scales with income, so refresh the benchmark whenever income changes.
  if(typeof bcCalcHEM==='function') bcCalcHEM();
}

// Gross household income (annual) — drives the HEM income band.
function bcGrossIncome(){
  return bcV('bc_b1_salary')+bcV('bc_b2_salary')+bcV('bc_b1_overtime')+bcV('bc_b1_bonus')
       +bcV('bc_b2_overtime')+bcV('bc_b2_bonus')+bcV('bc_rental_income')
       +bcV('bc_invest_income')+bcV('bc_gov_income')+bcV('bc_other_income');
}

function bcGetHEM(){
  var deps=parseInt(bcS('bc_dependants'))||0; var loc=bcS('bc_location')||'major';
  var couple=bcS('bc_b2_emp')!=='none'&&bcS('bc_b2_emp')!=='';
  var bm=couple?{groceries:900,utilities:280,comms:180,transport:600,personal:250,dining:500,entertainment:300,clothing:300,childcare:0}
    :{groceries:600,utilities:220,comms:120,transport:400,personal:180,dining:300,entertainment:200,clothing:200,childcare:0};
  bm.groceries+=deps*120; bm.transport+=deps*80; bm.childcare+=deps*800; bm.clothing+=deps*80;

  // HEM scales with gross household income (Melbourne Institute HEM is banded by
  // income — higher earners have a higher assessed spending floor). Flat below
  // ~$50k, then a graduated uplift that's heavier on discretionary categories
  // than on basics, capped so it never runs away at very high incomes.
  var inc = Math.min(0.9, Math.max(0, bcGrossIncome()-50000)/250000);
  var basic = 1 + inc*0.5;   // groceries, utilities, comms, transport, personal
  var disc  = 1 + inc;       // dining, entertainment, clothing
  ['groceries','utilities','comms','transport','personal'].forEach(function(k){ bm[k]=Math.round(bm[k]*basic); });
  ['dining','entertainment','clothing'].forEach(function(k){ bm[k]=Math.round(bm[k]*disc); });

  var m={major:1,other_city:.92,regional:.82,rural:.75}[loc]||1;
  Object.keys(bm).forEach(function(k){ bm[k]=Math.round(bm[k]*m); });
  return bm;
}

function bcCalcHEM(){
  var bm=bcGetHEM();
  var cats=[
    {lbl:'Groceries',id:'bc_exp_groceries',bv:bm.groceries},{lbl:'Utilities',id:'bc_exp_utilities',bv:bm.utilities},
    {lbl:'Phone & Internet',id:'bc_exp_comms',bv:bm.comms},{lbl:'Transport',id:'bc_exp_transport',bv:bm.transport},
    {lbl:'Personal Care',id:'bc_exp_personal',bv:bm.personal},{lbl:'Dining',id:'bc_exp_dining',bv:bm.dining},
    {lbl:'Entertainment',id:'bc_exp_entertainment',bv:bm.entertainment},{lbl:'Clothing',id:'bc_exp_clothing',bv:bm.clothing},
    {lbl:'Childcare',id:'bc_exp_childcare',bv:bm.childcare}
  ];
  var declB=bcV('bc_exp_groceries')+bcV('bc_exp_utilities')+bcV('bc_exp_comms')+bcV('bc_exp_transport')+bcV('bc_exp_kids_clothing')+bcV('bc_exp_personal');
  var hemB=bm.groceries+bm.utilities+bm.comms+bm.transport+bm.personal;
  var declD=bcV('bc_exp_dining')+bcV('bc_exp_entertainment')+bcV('bc_exp_clothing')+bcV('bc_exp_alcohol')+bcV('bc_exp_childcare')+bcV('bc_exp_subs');
  var hemD=bm.dining+bm.entertainment+bm.clothing+bm.childcare;
  var committed=bcV('bc_exp_insurance')+bcV('bc_exp_school')+bcV('bc_exp_other');
  var totalUsed=Math.max(declB,hemB)+Math.max(declD,hemD)+committed;
  var rows=cats.map(function(c){
    var d=bcV(c.id); var used=Math.max(d,c.bv);
    var badge=d<c.bv?'<span class="bc-chip bc-c-amber">HEM floor</span>':(d>0?'<span class="bc-chip bc-c-green">Your figure</span>':'');
    return '<div class="bc-hem-row"><div class="bc-hem-lbl"><span>'+c.lbl+'</span>'+badge+'</div>'+
      '<div class="bc-r"><div class="bc-mono">'+bcFmt(used)+'</div><div class="bc-hem-bm">Benchmark: '+bcFmt(c.bv)+'</div></div></div>';
  }).join('');
  var el=document.getElementById('bc-hem-content'); if(!el)return;
  el.innerHTML=rows+'<div class="bc-divider"></div><div class="bc-g3">'+
    '<div class="bc-sc"><div class="bc-sl">Your Declared Total</div><div class="bc-sv">'+bcFmt(declB+declD+committed)+'</div><div class="bc-ss">per month</div></div>'+
    '<div class="bc-sc"><div class="bc-sl">HEM Benchmark</div><div class="bc-sv bc-amber">'+bcFmt(hemB+hemD)+'</div><div class="bc-ss">per month</div></div>'+
    '<div class="bc-sc"><div class="bc-sl">Used in Assessment</div><div class="bc-sv bc-pink">'+bcFmt(totalUsed)+'</div><div class="bc-ss">Higher of both + committed</div></div></div>';
}

function bcAddProperty(data){
  var idx=bcProps.length; var item=data||{address:'',value:0,mortgage:0}; bcProps.push(item);
  var el=document.getElementById('bc-property-list'); var div=document.createElement('div');
  div.id='bc-prop-'+idx; div.className='bc-ir bc-ir4';
  div.innerHTML='<div class="bc-field"><label>Address / Description</label><input type="text" placeholder="e.g. 12 Smith St" onchange="bcProps['+idx+'].address=this.value;bcSave()"'+(item.address?' value="'+bcEsc(item.address)+'"':'')+'></div>'+
    '<div class="bc-field"><label>Estimated Value</label><div class="bc-pfx"><span>$</span><input type="number" class="bc-mono" placeholder="0" onchange="bcProps['+idx+'].value=parseFloat(this.value)||0;bcCalcAssets();bcSave()"'+(item.value?' value="'+item.value+'"':'')+'></div></div>'+
    '<div class="bc-field"><label>Outstanding Mortgage</label><div class="bc-pfx"><span>$</span><input type="number" class="bc-mono" placeholder="0" onchange="bcProps['+idx+'].mortgage=parseFloat(this.value)||0;bcCalcAssets();bcSave()"'+(item.mortgage?' value="'+item.mortgage+'"':'')+'></div></div>'+
    '<button class="bc-del" onclick="bcRmItem(\'bc-prop\','+idx+',bcProps,bcCalcAssets)"><i class="ti ti-x"></i></button>';
  el.appendChild(div); bcCalcAssets();
}

function bcCalcAssets(){
  var cash=bcV('bc_a_cash')+bcV('bc_a_term')+bcV('bc_a_shares');
  var propV=0; bcProps.forEach(function(p){ if(p)propV+=parseFloat(p.value)||0; });
  var other=bcV('bc_a_vehicles')+bcV('bc_a_contents')+bcV('bc_a_business');
  var exSup=cash+propV+other;
  var el=document.getElementById('bc-asset-totals'); if(!el)return;
  el.innerHTML='<div class="bc-g4"><div class="bc-sc"><div class="bc-sl">Cash & Investments</div><div class="bc-sv bc-green">'+bcFmt(cash)+'</div></div>'+
    '<div class="bc-sc"><div class="bc-sl">Property Value</div><div class="bc-sv">'+bcFmt(propV)+'</div></div>'+
    '<div class="bc-sc"><div class="bc-sl">Other Assets</div><div class="bc-sv">'+bcFmt(other)+'</div></div>'+
    '<div class="bc-sc"><div class="bc-sl">Total (excl. Super)</div><div class="bc-sv bc-pink">'+bcFmt(exSup)+'</div></div></div>';
}

function bcAddCC(data){
  var idx=bcCC.length; var item=data||{name:'',limit:0}; bcCC.push(item);
  var el=document.getElementById('bc-cc-list'); var div=document.createElement('div');
  div.id='bc-cc-'+idx; div.className='bc-ir bc-ir3';
  div.innerHTML='<div class="bc-field"><label>Card Name / Bank</label><input type="text" placeholder="e.g. ANZ Visa" onchange="bcCC['+idx+'].name=this.value;bcSave()"'+(item.name?' value="'+bcEsc(item.name)+'"':'')+'></div>'+
    '<div class="bc-field"><label>Credit Limit</label><div class="bc-pfx"><span>$</span><input type="number" class="bc-mono" placeholder="0" onchange="bcCC['+idx+'].limit=parseFloat(this.value)||0;bcCalcLiabs();bcSave()"'+(item.limit?' value="'+item.limit+'"':'')+'></div><div class="bc-helper">3%/month assessed</div></div>'+
    '<button class="bc-del" onclick="bcRmItem(\'bc-cc\','+idx+',bcCC,bcCalcLiabs)"><i class="ti ti-x"></i></button>';
  el.appendChild(div); bcCalcLiabs();
}

function bcAddLoan(data){
  var idx=bcLoans.length; var item=data||{name:'',balance:0,repayment:0}; bcLoans.push(item);
  var el=document.getElementById('bc-loan-list'); var div=document.createElement('div');
  div.id='bc-loan-'+idx; div.className='bc-ir bc-ir4';
  div.innerHTML='<div class="bc-field"><label>Description</label><input type="text" placeholder="e.g. Car Loan" onchange="bcLoans['+idx+'].name=this.value;bcSave()"'+(item.name?' value="'+bcEsc(item.name)+'"':'')+'></div>'+
    '<div class="bc-field"><label>Balance</label><div class="bc-pfx"><span>$</span><input type="number" class="bc-mono" placeholder="0" onchange="bcLoans['+idx+'].balance=parseFloat(this.value)||0;bcCalcLiabs();bcSave()"'+(item.balance?' value="'+item.balance+'"':'')+'></div></div>'+
    '<div class="bc-field"><label>Monthly Repayment</label><div class="bc-pfx"><span>$</span><input type="number" class="bc-mono" placeholder="0" onchange="bcLoans['+idx+'].repayment=parseFloat(this.value)||0;bcCalcLiabs();bcSave()"'+(item.repayment?' value="'+item.repayment+'"':'')+'></div></div>'+
    '<button class="bc-del" onclick="bcRmItem(\'bc-loan\','+idx+',bcLoans,bcCalcLiabs)"><i class="ti ti-x"></i></button>';
  el.appendChild(div); bcCalcLiabs();
}

function bcAddMortgage(data){
  var idx=bcMorts.length; var item=data||{property:'',balance:0,repayment:0,rate:0}; bcMorts.push(item);
  var el=document.getElementById('bc-mortgage-list'); var div=document.createElement('div');
  div.id='bc-emort-'+idx; div.className='bc-ir bc-ir5';
  div.innerHTML='<div class="bc-field"><label>Property</label><input type="text" placeholder="e.g. Current Home" onchange="bcMorts['+idx+'].property=this.value;bcSave()"'+(item.property?' value="'+bcEsc(item.property)+'"':'')+'></div>'+
    '<div class="bc-field"><label>Balance Owing</label><div class="bc-pfx"><span>$</span><input type="number" class="bc-mono" placeholder="0" onchange="bcMorts['+idx+'].balance=parseFloat(this.value)||0;bcCalcLiabs();bcSave()"'+(item.balance?' value="'+item.balance+'"':'')+'></div></div>'+
    '<div class="bc-field"><label>Monthly Repayment</label><div class="bc-pfx"><span>$</span><input type="number" class="bc-mono" placeholder="0" onchange="bcMorts['+idx+'].repayment=parseFloat(this.value)||0;bcCalcLiabs();bcSave()"'+(item.repayment?' value="'+item.repayment+'"':'')+'></div></div>'+
    '<div class="bc-field"><label>Rate (% p.a.)</label><input type="number" class="bc-mono" placeholder="6.50" step="0.01" onchange="bcMorts['+idx+'].rate=parseFloat(this.value)||0;bcSave()"'+(item.rate?' value="'+item.rate+'"':'')+'></div>'+
    '<button class="bc-del" onclick="bcRmItem(\'bc-emort\','+idx+',bcMorts,bcCalcLiabs)"><i class="ti ti-x"></i></button>';
  el.appendChild(div); bcCalcLiabs();
}

function bcRmItem(pfx,idx,arr,fn){ var el=document.getElementById(pfx+'-'+idx); if(el)el.remove(); arr[idx]=null; fn(); bcSave(); }

function bcCalcLiabs(){
  var ccL=0,ccM=0; bcCC.forEach(function(c){ if(c){ ccL+=parseFloat(c.limit)||0; ccM+=(parseFloat(c.limit)||0)*.03; } });
  var lR=0; bcLoans.forEach(function(l){ if(l) lR+=parseFloat(l.repayment)||0; });
  var mR=0; bcMorts.forEach(function(m){ if(m) mR+=parseFloat(m.repayment)||0; });
  var el=document.getElementById('bc-liab-summary'); if(!el)return;
  el.innerHTML='<div class="bc-g4"><div class="bc-sc"><div class="bc-sl">CC Assessment (monthly)</div><div class="bc-sv bc-red">'+bcFmt(ccM)+'</div><div class="bc-ss">3% of '+bcFmt(ccL)+' limits</div></div>'+
    '<div class="bc-sc"><div class="bc-sl">Loan Repayments</div><div class="bc-sv bc-amber">'+bcFmt(lR)+'</div><div class="bc-ss">per month</div></div>'+
    '<div class="bc-sc"><div class="bc-sl">Existing Mortgage Repayments</div><div class="bc-sv bc-amber">'+bcFmt(mR)+'</div><div class="bc-ss">per month</div></div>'+
    '<div class="bc-sc"><div class="bc-sl">Total Monthly Commitments</div><div class="bc-sv bc-pink">'+bcFmt(ccM+lR+mR)+'</div></div></div>';
}

function bcCalcLoan(){
  var rate=bcV('bc_interest_rate')||6.5; var buf=rate+3;
  var bd=document.getElementById('bc-buf-display'); if(bd)bd.textContent=buf.toFixed(2)+'%';
  var pv=bcV('bc_property_value'); var dep=bcV('bc_deposit'); var la=bcV('bc_loan_amount')||(pv-dep);
  var term=parseInt(bcS('bc_loan_term'))||30; var type=bcS('bc_repay_type'); var n=term*12;
  var el=document.getElementById('bc-loan-calc-content'); if(!el)return;
  if(la<=0||rate<=0){ el.innerHTML='<p class="bc-muted">Enter property value and interest rate above.</p>'; return; }
  var r=rate/100/12; var rB=buf/100/12;
  var ma=type==='io'?la*r:la*(r*Math.pow(1+r,n))/(Math.pow(1+r,n)-1);
  var mb=type==='io'?la*rB:la*(rB*Math.pow(1+rB,n))/(Math.pow(1+rB,n)-1);
  var lvr=pv>0?la/pv*100:0; var sd=bcCalcSD(pv,bcS('bc_state'),bcS('bc_fhb')==='yes');
  var lc=lvr>90?'bc-red':lvr>80?'bc-amber':'bc-green';
  el.innerHTML='<div class="bc-g3">'+
    '<div class="bc-sc"><div class="bc-sl">Proposed Loan</div><div class="bc-sv">'+bcFmt(la)+'</div></div>'+
    '<div class="bc-sc"><div class="bc-sl">LVR</div><div class="bc-sv '+lc+'">'+bcFmtPct(lvr)+'</div><div class="bc-ss">'+(lvr>80?'⚠️ LMI may apply':'✓ No LMI required')+'</div></div>'+
    '<div class="bc-sc"><div class="bc-sl">Monthly Repayment</div><div class="bc-sv">'+bcFmt(ma)+'</div><div class="bc-ss">at contract rate</div></div>'+
    '<div class="bc-sc"><div class="bc-sl">Assessed Repayment</div><div class="bc-sv bc-amber">'+bcFmt(mb)+'</div><div class="bc-ss">at APRA buffer rate</div></div>'+
    '<div class="bc-sc"><div class="bc-sl">Total Interest</div><div class="bc-sv">'+bcFmt(ma*n-la)+'</div><div class="bc-ss">over '+term+' years</div></div>'+
    '<div class="bc-sc"><div class="bc-sl">Est. Stamp Duty</div><div class="bc-sv bc-pink">'+bcFmt(sd)+'</div><div class="bc-ss">'+bcS('bc_state')+(bcS('bc_fhb')==='yes'?' FHB':'')+'</div></div></div>';
}

// Stamp duty (approximate, current thresholds)
function bcCalcSD(val,st,fhb){
  if(!val||val<=0)return 0; var d=0;
  if(st==='NSW'){ d=bcNsw(val); if(fhb&&val<=800000)d=0; else if(fhb&&val<=1000000)d=d*(val-800000)/200000; }
  else if(st==='VIC'){ d=bcVic(val); if(fhb&&val<=600000)d=0; else if(fhb&&val<=750000)d=d*(val-600000)/150000; }
  else if(st==='QLD'){ d=bcQld(val); if(fhb&&val<=500000)d=Math.max(0,d-8750); }
  else if(st==='WA')d=bcWa(val); else d=val*.03;
  return Math.max(0,Math.round(d));
}
function bcNsw(v){ if(v<=14000)return v*.0125; if(v<=32000)return 175+(v-14000)*.015; if(v<=85000)return 445+(v-32000)*.0175; if(v<=319000)return 1372.5+(v-85000)*.035; if(v<=1064000)return 9612.5+(v-319000)*.045; if(v<=3131000)return 43117.5+(v-1064000)*.055; return 156853.5+(v-3131000)*.07; }
function bcVic(v){ if(v<=25000)return v*.014; if(v<=130000)return 350+(v-25000)*.024; if(v<=440000)return 2870+(v-130000)*.05; if(v<=550000)return 18370+(v-440000)*.06; return 24970+(v-550000)*.065; }
function bcQld(v){ if(v<=5000)return 0; if(v<=75000)return(v-5000)*.015; if(v<=540000)return 1050+(v-75000)*.035; if(v<=1000000)return 17325+(v-540000)*.045; return 38025+(v-1000000)*.0575; }
function bcWa(v){ if(v<=120000)return v*.019; if(v<=150000)return 2280+(v-120000)*.0285; if(v<=360000)return 3135+(v-150000)*.038; if(v<=725000)return 11115+(v-360000)*.0475; return 28453+(v-725000)*.051; }

// ══════════════════════════════════════════════════════════════
// CAPACITY
// ══════════════════════════════════════════════════════════════
function bcGetCapacity(){
  var totalInc=bcV('bc_b1_salary')+bcV('bc_b1_overtime')*.8+bcV('bc_b1_bonus')*.8+bcV('bc_b2_salary')+bcV('bc_b2_overtime')*.8+bcV('bc_b2_bonus')*.8+bcV('bc_rental_income')*.8+bcV('bc_invest_income')+bcV('bc_gov_income')+bcV('bc_other_income');
  var gross=bcV('bc_b1_salary')+bcV('bc_b2_salary');
  var hr=0; if(gross>120000)hr=.10;else if(gross>100000)hr=.085;else if(gross>80000)hr=.07;else if(gross>60000)hr=.05;else if(gross>47014)hr=.01;
  var hm=bcV('bc_hecs')>0?gross*hr/12:0;
  var mthInc=totalInc/12;
  var bm=bcGetHEM();
  var declB=bcV('bc_exp_groceries')+bcV('bc_exp_utilities')+bcV('bc_exp_comms')+bcV('bc_exp_transport')+bcV('bc_exp_kids_clothing')+bcV('bc_exp_personal');
  var hemB=bm.groceries+bm.utilities+bm.comms+bm.transport+bm.personal;
  var declD=bcV('bc_exp_dining')+bcV('bc_exp_entertainment')+bcV('bc_exp_clothing')+bcV('bc_exp_alcohol')+bcV('bc_exp_childcare')+bcV('bc_exp_subs');
  var hemD=bm.dining+bm.entertainment+bm.clothing+bm.childcare;
  var committed=bcV('bc_exp_insurance')+bcV('bc_exp_school')+bcV('bc_exp_other');
  var totalExp=Math.max(declB,hemB)+Math.max(declD,hemD)+committed;
  var ccM=0; bcCC.forEach(function(c){ if(c)ccM+=(parseFloat(c.limit)||0)*.03; });
  var lR=0; bcLoans.forEach(function(l){ if(l)lR+=parseFloat(l.repayment)||0; });
  var mR=0; bcMorts.forEach(function(m){ if(m)mR+=parseFloat(m.repayment)||0; });
  var totalCommit=totalExp+ccM+lR+mR+hm;
  var available=Math.max(0,Math.min(mthInc*.35,mthInc-totalCommit));
  var rate=bcV('bc_interest_rate')||6.5; var buf=rate+3; var term=parseInt(bcS('bc_loan_term'))||30; var n=term*12;
  var rB=buf/100/12; var type=bcS('bc_repay_type');
  var maxLoan=0;
  if(available>0&&rB>0){ maxLoan=type==='io'?available/rB:available*(Math.pow(1+rB,n)-1)/(rB*Math.pow(1+rB,n)); }
  var dtiCap=totalInc*6; var cappedDTI=maxLoan>dtiCap; maxLoan=Math.min(maxLoan,dtiCap);
  var pv=bcV('bc_property_value'); var dep=bcV('bc_deposit'); var la=bcV('bc_loan_amount')||(pv-dep);
  var r=rate/100/12;
  var ma=type==='io'?la*r:(la>0&&r>0?la*(r*Math.pow(1+r,n))/(Math.pow(1+r,n)-1):0);
  var mb=type==='io'?la*rB:(la>0&&rB>0?la*(rB*Math.pow(1+rB,n))/(Math.pow(1+rB,n)-1):0);
  var dsr=mthInc>0?(totalCommit+mb)/mthInc*100:0;
  var totalAssets=bcV('bc_a_cash')+bcV('bc_a_term')+bcV('bc_a_shares')+bcV('bc_a_vehicles')+bcV('bc_a_contents')+bcV('bc_a_business');
  bcProps.forEach(function(p){ if(p)totalAssets+=parseFloat(p.value)||0; });
  var totalLiabs=0;
  bcCC.forEach(function(c){ if(c)totalLiabs+=parseFloat(c.limit)||0; });
  bcLoans.forEach(function(l){ if(l)totalLiabs+=parseFloat(l.balance)||0; });
  bcMorts.forEach(function(m){ if(m)totalLiabs+=parseFloat(m.balance)||0; });
  return {totalInc:totalInc,mthInc:mthInc,hm:hm,totalExp:totalExp,ccM:ccM,lR:lR,mR:mR,totalCommit:totalCommit,available:available,
    maxLoan:maxLoan,cappedDTI:cappedDTI,rate:rate,buf:buf,term:term,n:n,type:type,pv:pv,dep:dep,la:la,ma:ma,mb:mb,dsr:dsr,
    totalAssets:totalAssets,totalLiabs:totalLiabs,netWorth:totalAssets-totalLiabs};
}

// ══════════════════════════════════════════════════════════════
// REPORT
// ══════════════════════════════════════════════════════════════
function bcGenerateReport(){
  var r=bcGetCapacity();
  var lvr=r.pv>0?r.la/r.pv*100:0; var lmi=lvr>80;
  var sd=bcCalcSD(r.pv,bcS('bc_state'),bcS('bc_fhb')==='yes');
  var totalCash=r.dep+sd+2500+800+1000+(lmi?r.la*.02:0);
  var affPct=r.maxLoan>0?Math.min(110,r.la/r.maxLoan*100):0;
  var gPos=Math.min(95,affPct);
  var affLbl,affCls;
  if(affPct<=60){affLbl='✓ Comfortable';affCls='bc-c-green';}
  else if(affPct<=85){affLbl='⚠ Moderate';affCls='bc-c-amber';}
  else if(affPct<=100){affLbl='⚠ Near Limit';affCls='bc-c-amber';}
  else{affLbl='✗ Exceeds Est. Capacity';affCls='bc-c-red';}
  var dsrC=r.dsr<30?'bc-green':r.dsr<45?'bc-amber':'bc-red';
  var lvrC=lvr>90?'bc-red':lvr>80?'bc-amber':'bc-green';
  var now=new Date();
  var dateStr=now.toLocaleDateString('en-AU',{day:'numeric',month:'long',year:'numeric'});
  var pdl=document.getElementById('bc-print-date-line');
  if(pdl)pdl.textContent='Prepared: '+dateStr+' · Applicant(s): '+(bcS('bc_b1_name')||'Borrower 1')+(bcS('bc_b2_name')?' & '+bcS('bc_b2_name'):'');
  var purpMap={owner_occ:'Owner Occupied — P&I',owner_io:'Owner Occupied — IO',invest_pi:'Investment — P&I',invest_io:'Investment — IO',refinance:'Refinance'};
  var empL=function(x){return{paye:'PAYG / Salaried',self:'Self-Employed',contractor:'Contractor',casual:'Casual',part:'Part-Time',none:'N/A'}[x]||x;};
  var locL=function(x){return{major:'Major City',other_city:'Other Capital City',regional:'Regional',rural:'Rural'}[x]||x;};
  var b2bit=bcS('bc_b2_name')&&bcS('bc_b2_emp')!=='none'?'<br>Borrower 2: <strong>'+bcEsc(bcS('bc_b2_name'))+'</strong> — '+empL(bcS('bc_b2_emp')):'';
  var ccRows=''; bcCC.forEach(function(c){ if(c)ccRows+='<tr><td>'+bcEsc(c.name)+'</td><td class="bc-mono bc-r">'+bcFmt(parseFloat(c.limit)||0)+'</td><td class="bc-mono bc-amber bc-r">'+bcFmt((parseFloat(c.limit)||0)*.03)+'/mo</td></tr>'; });
  var lRows=''; bcLoans.forEach(function(l){ if(l)lRows+='<tr><td>'+bcEsc(l.name)+'</td><td class="bc-mono bc-r">'+bcFmt(parseFloat(l.balance)||0)+'</td><td class="bc-mono bc-amber bc-r">'+bcFmt(parseFloat(l.repayment)||0)+'/mo</td></tr>'; });
  var mRows=''; bcMorts.forEach(function(m){ if(m)mRows+='<tr><td>'+bcEsc(m.property)+'</td><td class="bc-mono bc-r">'+bcFmt(parseFloat(m.balance)||0)+'</td><td class="bc-mono bc-amber bc-r">'+bcFmt(parseFloat(m.repayment)||0)+'/mo</td></tr>'; });
  var pRows=''; bcProps.forEach(function(p){ if(p)pRows+='<tr><td>'+bcEsc(p.address)+'</td><td class="bc-mono bc-r">'+bcFmt(parseFloat(p.value)||0)+'</td><td class="bc-mono bc-muted bc-r">'+bcFmt(parseFloat(p.mortgage)||0)+'</td></tr>'; });

  var importSummary='';
  if(bcImportLog.length){
    importSummary='<div class="bc-report-src"><strong class="bc-green">Data sourced live from your app</strong> · '+
      bcImportLog.filter(function(l){return l.type==='success';}).length+' data sets synced. All figures reviewed and confirmed.</div>';
  }

  var html=
    '<div class="bc-hero">'+
      '<div class="bc-hero-top">'+
        '<div><div class="bc-res-label">ESTIMATED MAXIMUM BORROWING CAPACITY</div>'+
        '<div class="bc-res-amt">'+bcFmt(r.maxLoan)+'</div>'+
        '<div class="bc-res-sub">APRA 3% buffer at '+r.buf.toFixed(2)+'% assessment rate'+(r.cappedDTI?' · DTI cap (6× income) applied':'')+' · '+r.term+'-year loan</div></div>'+
        '<div class="bc-r"><div class="bc-res-label">REQUESTED LOAN</div>'+
          '<div class="bc-mono bc-mono--22">'+bcFmt(r.la)+'</div>'+
          '<span class="bc-chip bc-mt5 '+affCls+'">'+affLbl+'</span></div>'+
      '</div>'+
      '<div class="bc-chips">'+
        '<span class="bc-chip bc-c-blue">📅 '+dateStr+'</span>'+
        '<span class="bc-chip bc-c-blue">🏦 '+bcS('bc_state')+'</span>'+
        '<span class="bc-chip bc-c-blue">📊 '+r.rate.toFixed(2)+'% contract rate</span>'+
        '<span class="bc-chip bc-c-blue">⏱ '+r.term+' years</span>'+
        (lmi?'<span class="bc-chip bc-c-amber">⚠️ LMI may apply ('+lvr.toFixed(0)+'% LVR)</span>':'<span class="bc-chip bc-c-green">✓ No LMI required ('+lvr.toFixed(0)+'% LVR)</span>')+
        (bcS('bc_fhb')==='yes'?'<span class="bc-chip bc-c-pink">🏡 First Home Buyer</span>':'')+
      '</div>'+importSummary+
    '</div>'+

    '<div class="bc-card"><div class="bc-card-title"><i class="ti ti-target"></i> Affordability Position</div>'+
      '<div class="bc-gauge-head"><span>Requested loan vs. estimated maximum capacity</span>'+
        '<span class="'+(affPct<=100?'bc-green':'bc-red')+' bc-mono bc-fw600">'+affPct.toFixed(0)+'%</span></div>'+
      '<div class="bc-gauge-bar"><div class="bc-gauge-ptr" style="left:'+gPos+'%"></div></div>'+
      '<div class="bc-gauge-lbl"><span>Conservative (&lt;60%)</span><span>Moderate (60–85%)</span><span>Near limit (&gt;85%)</span></div>'+
      '<div class="bc-metric-row">'+
        '<div><div class="bc-metric-lbl">Debt Serviceability Ratio</div><div class="bc-mono bc-metric-val '+dsrC+'">'+r.dsr.toFixed(1)+'%</div><div class="bc-metric-sub">Total commitments ÷ gross income. Lenders prefer &lt;40%</div></div>'+
        '<div><div class="bc-metric-lbl">Available for New Mortgage</div><div class="bc-mono bc-metric-val bc-green">'+bcFmt(r.available)+'/mo</div><div class="bc-metric-sub">After all existing commitments</div></div>'+
        '<div><div class="bc-metric-lbl">Monthly Repayment (Contract)</div><div class="bc-mono bc-metric-val">'+bcFmt(r.ma)+'</div><div class="bc-metric-sub">At '+r.rate.toFixed(2)+'% — tested at '+r.buf.toFixed(2)+'% ('+bcFmt(r.mb)+')</div></div>'+
      '</div>'+
    '</div>'+

    '<div class="bc-card"><div class="bc-card-title"><i class="ti ti-user"></i> Applicant Details</div>'+
      '<div class="bc-applicant">Borrower 1: <strong>'+(bcEsc(bcS('bc_b1_name'))||'—')+'</strong> — '+empL(bcS('bc_b1_emp'))+b2bit+'<br>'+
        'Household: <strong>'+['0','1','2','3','4+'][parseInt(bcS('bc_dependants'))||0]+' dependant(s)</strong> · Location: <strong>'+locL(bcS('bc_location'))+'</strong><br>'+
        'Purpose: <strong>'+(purpMap[bcS('bc_purpose')]||'—')+'</strong> · State: <strong>'+bcS('bc_state')+'</strong></div>'+
    '</div>'+

    '<div class="bc-g2">'+
      '<div class="bc-card"><div class="bc-card-title"><i class="ti ti-cash"></i> Income Summary</div>'+
        '<table class="bc-dt"><tr><th>Source</th><th class="bc-r">Annual</th><th class="bc-r">Assessed</th></tr>'+
        '<tr><td>B1 Base Salary</td><td class="bc-mono bc-r">'+bcFmt(bcV('bc_b1_salary'))+'</td><td class="bc-mono bc-green bc-r">'+bcFmt(bcV('bc_b1_salary'))+'</td></tr>'+
        (bcV('bc_b1_overtime')>0?'<tr><td>B1 Overtime</td><td class="bc-mono bc-r">'+bcFmt(bcV('bc_b1_overtime'))+'</td><td class="bc-mono bc-r">'+bcFmt(bcV('bc_b1_overtime')*.8)+' <span class="bc-muted">(80%)</span></td></tr>':'')+
        (bcV('bc_b1_bonus')>0?'<tr><td>B1 Bonus</td><td class="bc-mono bc-r">'+bcFmt(bcV('bc_b1_bonus'))+'</td><td class="bc-mono bc-r">'+bcFmt(bcV('bc_b1_bonus')*.8)+' <span class="bc-muted">(80%)</span></td></tr>':'')+
        (bcV('bc_b2_salary')>0?'<tr><td>B2 Base Salary</td><td class="bc-mono bc-r">'+bcFmt(bcV('bc_b2_salary'))+'</td><td class="bc-mono bc-green bc-r">'+bcFmt(bcV('bc_b2_salary'))+'</td></tr>':'')+
        (bcV('bc_rental_income')>0?'<tr><td>Rental Income</td><td class="bc-mono bc-r">'+bcFmt(bcV('bc_rental_income'))+'</td><td class="bc-mono bc-r">'+bcFmt(bcV('bc_rental_income')*.8)+' <span class="bc-muted">(80%)</span></td></tr>':'')+
        (bcV('bc_invest_income')+bcV('bc_gov_income')+bcV('bc_other_income')>0?'<tr><td>Other Income</td><td class="bc-mono bc-r">'+bcFmt(bcV('bc_invest_income')+bcV('bc_gov_income')+bcV('bc_other_income'))+'</td><td class="bc-mono bc-r">'+bcFmt(bcV('bc_invest_income')+bcV('bc_gov_income')+bcV('bc_other_income'))+'</td></tr>':'')+
        '<tr class="bc-tr"><td><strong>Total Assessed (p.a.)</strong></td><td></td><td class="bc-mono bc-green bc-r"><strong>'+bcFmt(r.totalInc)+'</strong></td></tr>'+
        '<tr class="bc-tr"><td><strong>Monthly Gross</strong></td><td></td><td class="bc-mono bc-green bc-r"><strong>'+bcFmt(r.mthInc)+'</strong></td></tr></table></div>'+

      '<div class="bc-card"><div class="bc-card-title"><i class="ti ti-receipt"></i> Monthly Commitments</div>'+
        '<table class="bc-dt"><tr><th>Item</th><th class="bc-r">Monthly</th></tr>'+
        '<tr><td>Living Expenses (HEM-adjusted)</td><td class="bc-mono bc-amber bc-r">'+bcFmt(r.totalExp)+'</td></tr>'+
        '<tr><td>Credit Card Assessment (3% of limits)</td><td class="bc-mono bc-red bc-r">'+bcFmt(r.ccM)+'</td></tr>'+
        '<tr><td>Personal Loan Repayments</td><td class="bc-mono bc-amber bc-r">'+bcFmt(r.lR)+'</td></tr>'+
        '<tr><td>Existing Mortgage Repayments</td><td class="bc-mono bc-amber bc-r">'+bcFmt(r.mR)+'</td></tr>'+
        '<tr><td>HECS-HELP (estimated)</td><td class="bc-mono bc-amber bc-r">'+bcFmt(r.hm)+'</td></tr>'+
        '<tr class="bc-tr"><td><strong>Total Commitments</strong></td><td class="bc-mono bc-red bc-r"><strong>'+bcFmt(r.totalCommit)+'</strong></td></tr>'+
        '<tr class="bc-tr"><td><strong>Available for New Mortgage</strong></td><td class="bc-mono bc-green bc-r"><strong>'+bcFmt(r.available)+'</strong></td></tr></table></div>'+
    '</div>'+

    '<div class="bc-card"><div class="bc-card-title"><i class="ti ti-home"></i> Proposed Loan Snapshot</div>'+
      '<div class="bc-g4">'+
        '<div class="bc-sc"><div class="bc-sl">Property Value</div><div class="bc-sv">'+bcFmt(r.pv)+'</div></div>'+
        '<div class="bc-sc"><div class="bc-sl">Deposit</div><div class="bc-sv bc-green">'+bcFmt(r.dep)+'</div></div>'+
        '<div class="bc-sc"><div class="bc-sl">Proposed Loan</div><div class="bc-sv">'+bcFmt(r.la)+'</div></div>'+
        '<div class="bc-sc"><div class="bc-sl">LVR</div><div class="bc-sv '+lvrC+'">'+bcFmtPct(lvr)+'</div><div class="bc-ss">'+(lmi?'⚠️ LMI may apply':'✓ No LMI required')+'</div></div>'+
        '<div class="bc-sc"><div class="bc-sl">Contract Rate</div><div class="bc-sv">'+r.rate.toFixed(2)+'%</div></div>'+
        '<div class="bc-sc"><div class="bc-sl">Assessment Rate</div><div class="bc-sv bc-amber">'+r.buf.toFixed(2)+'%</div><div class="bc-ss">+3% APRA buffer</div></div>'+
        '<div class="bc-sc"><div class="bc-sl">Monthly Repayment</div><div class="bc-sv">'+bcFmt(r.ma)+'</div></div>'+
        '<div class="bc-sc"><div class="bc-sl">Assessed Repayment</div><div class="bc-sv bc-amber">'+bcFmt(r.mb)+'</div></div>'+
      '</div></div>'+

    '<div class="bc-g2">'+
      '<div class="bc-card"><div class="bc-card-title"><i class="ti ti-building-bank"></i> Assets</div>'+
        '<table class="bc-dt"><tr><th>Asset</th><th class="bc-r">Value</th></tr>'+
        '<tr><td>Cash & Savings</td><td class="bc-mono bc-r">'+bcFmt(bcV('bc_a_cash'))+'</td></tr>'+
        '<tr><td>Term Deposits</td><td class="bc-mono bc-r">'+bcFmt(bcV('bc_a_term'))+'</td></tr>'+
        '<tr><td>Shares / ETFs</td><td class="bc-mono bc-r">'+bcFmt(bcV('bc_a_shares'))+'</td></tr>'+
        (pRows?'<tr><td colspan="2" class="bc-sub-hd">PROPERTY</td></tr>'+pRows:'')+
        '<tr><td>Motor Vehicles</td><td class="bc-mono bc-r">'+bcFmt(bcV('bc_a_vehicles'))+'</td></tr>'+
        '<tr><td>Superannuation</td><td class="bc-mono bc-muted bc-r">'+bcFmt(bcV('bc_a_super'))+' (excl.)</td></tr>'+
        '<tr class="bc-tr"><td><strong>Total Assets (excl. Super)</strong></td><td class="bc-mono bc-green bc-r"><strong>'+bcFmt(r.totalAssets)+'</strong></td></tr></table></div>'+

      '<div class="bc-card"><div class="bc-card-title"><i class="ti ti-clipboard-list"></i> Liabilities</div>'+
        '<table class="bc-dt"><tr><th>Liability</th><th class="bc-r">Balance</th><th class="bc-r">Commitment</th></tr>'+
        (ccRows?ccRows:'<tr><td colspan="3" class="bc-muted">No credit cards entered</td></tr>')+(lRows||'')+(mRows||'')+
        '<tr class="bc-tr"><td><strong>Total Liabilities</strong></td><td class="bc-mono bc-red bc-r"><strong>'+bcFmt(r.totalLiabs)+'</strong></td><td></td></tr></table>'+
        '<div class="bc-divider"></div><div class="bc-nw-row"><span>Net Worth</span>'+
          '<span class="bc-mono '+(r.netWorth>=0?'bc-green':'bc-red')+' bc-mono--17">'+bcFmt(r.netWorth)+'</span></div></div>'+
    '</div>'+

    '<div class="bc-card"><div class="bc-card-title"><i class="ti ti-calculator"></i> Estimated Purchase Costs</div>'+
      '<table class="bc-dt bc-dt--narrow">'+
        '<tr><td>Property Price</td><td class="bc-mono bc-r">'+bcFmt(r.pv)+'</td></tr>'+
        '<tr><td>Stamp Duty ('+bcS('bc_state')+(bcS('bc_fhb')==='yes'?' — FHB':'')+')</td><td class="bc-mono bc-amber bc-r">'+bcFmt(sd)+'</td></tr>'+
        '<tr><td>Legal / Conveyancing</td><td class="bc-mono bc-r">$2,500</td></tr>'+
        '<tr><td>Building & Pest Inspection</td><td class="bc-mono bc-r">$800</td></tr>'+
        '<tr><td>Lender / Application Fees</td><td class="bc-mono bc-r">$1,000</td></tr>'+
        (lmi?'<tr><td>LMI (LVR '+lvr.toFixed(0)+'%)</td><td class="bc-mono bc-red bc-r">~'+bcFmt(r.la*.02)+'</td></tr>':'')+
        '<tr class="bc-tr"><td><strong>Total Cash Required</strong></td><td class="bc-mono bc-pink bc-r"><strong>'+bcFmt(totalCash)+'</strong></td></tr></table></div>'+

    '<div class="bc-card bc-disclaimer">'+
      '<div class="bc-disc-title">⚠️ Important Disclaimer</div>'+
      '<div class="bc-disc-body">This report is a general estimate only and does not constitute financial advice. Income, expenses and asset figures are sourced from your app data and reviewed by you. '+
      'Borrowing capacity uses the APRA 3% serviceability buffer and HEM benchmarks. Actual capacity varies by lender. Stamp duty and LMI figures are indicative only. '+
      '<strong>Speak with a licensed mortgage broker or financial adviser before making property decisions. Prepared: '+dateStr+'</strong></div></div>';

  var el=document.getElementById('bc-report-content'); if(el)el.innerHTML=html;
}

// ══════════════════════════════════════════════════════════════
// EXPORTS  (dependency-free — print + CSV)
// ══════════════════════════════════════════════════════════════
function bcExportPDF(){
  bcGenerateReport();
  document.body.classList.add('bc-printing');
  setTimeout(function(){ window.print(); setTimeout(function(){ document.body.classList.remove('bc-printing'); }, 200); }, 250);
}

function bcExportCSV(){
  var r=bcGetCapacity(); var sd=bcCalcSD(r.pv,bcS('bc_state'),bcS('bc_fhb')==='yes'); var lvr=r.pv>0?r.la/r.pv*100:0;
  var q=function(x){ x=String(x==null?'':x); return /[",\n]/.test(x)?'"'+x.replace(/"/g,'""')+'"':x; };
  var rows=[
    ['Kelda Finance — Borrowing Power Report',''],
    ['Prepared', new Date().toLocaleDateString('en-AU')],
    ['Applicants', (bcS('bc_b1_name')||'')+(bcS('bc_b2_name')?' & '+bcS('bc_b2_name'):'')],
    ['',''],
    ['BORROWING CAPACITY',''],
    ['Estimated Maximum Borrowing Capacity', Math.round(r.maxLoan)],
    ['Requested Loan Amount', Math.round(r.la)],
    ['Assessment Rate (%)', r.buf.toFixed(2)],
    ['DTI Cap Applied', r.cappedDTI?'Yes':'No'],
    ['Debt Serviceability Ratio (%)', r.dsr.toFixed(1)],
    ['',''],
    ['INCOME (annual assessed)',''],
    ['B1 Base Salary', bcV('bc_b1_salary')],
    ['B2 Base Salary', bcV('bc_b2_salary')],
    ['Rental Income (gross)', bcV('bc_rental_income')],
    ['Other Income', bcV('bc_invest_income')+bcV('bc_gov_income')+bcV('bc_other_income')],
    ['Total Assessed Income', Math.round(r.totalInc)],
    ['Monthly Gross', Math.round(r.mthInc)],
    ['',''],
    ['MONTHLY COMMITMENTS',''],
    ['Living Expenses (HEM-adjusted)', Math.round(r.totalExp)],
    ['Credit Card Assessment', Math.round(r.ccM)],
    ['Loan Repayments', Math.round(r.lR)],
    ['Existing Mortgage Repayments', Math.round(r.mR)],
    ['HECS-HELP Repayment', Math.round(r.hm)],
    ['Total Commitments', Math.round(r.totalCommit)],
    ['Available for New Mortgage', Math.round(r.available)],
    ['',''],
    ['PROPOSED LOAN',''],
    ['Property Value', r.pv],['Deposit', r.dep],['Loan Amount', Math.round(r.la)],
    ['LVR (%)', lvr.toFixed(1)],['Interest Rate (%)', r.rate],['Assessment Rate (%)', r.buf.toFixed(2)],
    ['Loan Term (years)', bcS('bc_loan_term')],['Repayment Type', bcS('bc_repay_type')==='io'?'Interest Only':'P&I'],
    ['Monthly Repayment (contract)', Math.round(r.ma)],['Assessed Repayment (buffer)', Math.round(r.mb)],['Stamp Duty', sd],
    ['',''],
    ['NET WORTH',''],
    ['Total Assets', Math.round(r.totalAssets)],['Total Liabilities', Math.round(r.totalLiabs)],['Net Worth', Math.round(r.netWorth)],
    ['',''],
    ['Estimate only. Not financial advice. Synced from your app data and reviewed by you.','']
  ];
  var csv=rows.map(function(row){ return row.map(q).join(','); }).join('\n');
  var blob=new Blob([csv],{type:'text/csv;charset=utf-8'});
  var a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='Kelda-Borrowing-Report-'+new Date().toISOString().split('T')[0]+'.csv';
  document.body.appendChild(a); a.click();
  setTimeout(function(){ document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 100);
  if(typeof toast==='function') toast('📊 Borrowing report exported');
}

// ══════════════════════════════════════════════════════════════
// MARKUP + ENTRY POINT
// ══════════════════════════════════════════════════════════════
function bcStepTabs(){
  var steps=[
    ['review','Review','ti-refresh'],['income','Income','ti-cash'],['expenses','Expenses','ti-receipt'],
    ['assets','Assets','ti-building-bank'],['liabilities','Liabilities','ti-clipboard-list'],
    ['loandetails','Loan','ti-home'],['results','Report','ti-chart-bar']
  ];
  return '<div class="bc-steps">'+steps.map(function(s,i){
    return '<button class="bc-tab'+(i===0?' active':'')+'" id="bc-tab-'+s[0]+'" onclick="bcGo(\''+s[0]+'\')"><i class="ti '+s[2]+'"></i><span>'+s[1]+'</span></button>';
  }).join('')+'</div>';
}

function bcMarkup(){
  return ''+
  '<div class="page-title-row"><div class="page-title"><i class="ti ti-calculator"></i> Borrowing Power</div></div>'+
  '<p class="bc-intro">Estimate how much you could borrow — using the APRA 3% serviceability buffer and HEM benchmarks, synced from your live app data. <strong>Estimate only, not financial advice.</strong></p>'+
  bcStepTabs()+
  '<div class="bc-root">'+

  // REVIEW
  '<div class="bc-section active" id="bc-sec-review">'+
    '<div class="bc-page-header"><div class="bc-eyebrow">Step 1 — Data Review</div><h2>Review Synced Data</h2>'+
      '<p>Data has been pulled from your app (transactions, accounts, mortgage, liabilities, insurance). Review it, correct anything that looks off, then work through the steps.</p></div>'+
    '<div id="bc-review-banner"></div><div id="bc-review-content"></div>'+
    '<div class="bc-btn-row"><button class="bc-btn bc-btn-primary" onclick="bcGo(\'income\')">Looks good — Review Income →</button>'+
      '<button class="bc-btn bc-btn-secondary" onclick="bcSync()"><i class="ti ti-refresh"></i> Re-sync from app</button></div>'+
  '</div>'+

  // INCOME
  '<div class="bc-section" id="bc-sec-income">'+
    '<div class="bc-page-header"><div class="bc-eyebrow">Step 2 of 6</div><h2>Income</h2>'+
      '<p>Imported from your transaction history (last 12 months). Irregular income (overtime, bonuses, rental) is shaded to 80% by most lenders.</p></div>'+
    '<div class="bc-card"><div class="bc-card-title"><i class="ti ti-briefcase"></i> Employment Income — Borrower 1</div><div class="bc-g3">'+
      '<div class="bc-field"><label>Base Salary (gross p.a.) <span class="bc-src-badge" id="bc_b1sal-src">manual</span></label><div class="bc-pfx"><span>$</span><input type="number" id="bc_b1_salary" class="bc-mono" placeholder="0" min="0" oninput="bcSave();bcCalcIncome()"></div></div>'+
      '<div class="bc-field"><label>Overtime / Allowances (p.a.)</label><div class="bc-pfx"><span>$</span><input type="number" id="bc_b1_overtime" class="bc-mono" placeholder="0" min="0" oninput="bcSave();bcCalcIncome()"></div><div class="bc-helper">Assessed at 80%</div></div>'+
      '<div class="bc-field"><label>Bonuses / Commissions (p.a.)</label><div class="bc-pfx"><span>$</span><input type="number" id="bc_b1_bonus" class="bc-mono" placeholder="0" min="0" oninput="bcSave();bcCalcIncome()"></div><div class="bc-helper">Assessed at 80%</div></div>'+
    '</div></div>'+
    '<div class="bc-card"><div class="bc-card-title"><i class="ti ti-briefcase"></i> Employment Income — Borrower 2</div><div class="bc-g3">'+
      '<div class="bc-field"><label>Base Salary (gross p.a.) <span class="bc-src-badge" id="bc_b2sal-src">manual</span></label><div class="bc-pfx"><span>$</span><input type="number" id="bc_b2_salary" class="bc-mono" placeholder="0" min="0" oninput="bcSave();bcCalcIncome()"></div></div>'+
      '<div class="bc-field"><label>Overtime / Allowances (p.a.)</label><div class="bc-pfx"><span>$</span><input type="number" id="bc_b2_overtime" class="bc-mono" placeholder="0" min="0" oninput="bcSave();bcCalcIncome()"></div><div class="bc-helper">Assessed at 80%</div></div>'+
      '<div class="bc-field"><label>Bonuses / Commissions (p.a.)</label><div class="bc-pfx"><span>$</span><input type="number" id="bc_b2_bonus" class="bc-mono" placeholder="0" min="0" oninput="bcSave();bcCalcIncome()"></div><div class="bc-helper">Assessed at 80%</div></div>'+
    '</div></div>'+
    '<div class="bc-card"><div class="bc-card-title"><i class="ti ti-building-community"></i> Other Income</div><div class="bc-g3">'+
      '<div class="bc-field"><label>Rental Income (p.a.) <span class="bc-src-badge" id="bc_rental-src">manual</span></label><div class="bc-pfx"><span>$</span><input type="number" id="bc_rental_income" class="bc-mono" placeholder="0" min="0" oninput="bcSave();bcCalcIncome()"></div><div class="bc-helper">Assessed at 80%</div></div>'+
      '<div class="bc-field"><label>Dividends / Investments (p.a.)</label><div class="bc-pfx"><span>$</span><input type="number" id="bc_invest_income" class="bc-mono" placeholder="0" min="0" oninput="bcSave();bcCalcIncome()"></div></div>'+
      '<div class="bc-field"><label>Government Payments (p.a.)</label><div class="bc-pfx"><span>$</span><input type="number" id="bc_gov_income" class="bc-mono" placeholder="0" min="0" oninput="bcSave();bcCalcIncome()"></div><div class="bc-helper">FTB, Centrelink etc.</div></div>'+
      '<div class="bc-field"><label>Other Income (p.a.)</label><div class="bc-pfx"><span>$</span><input type="number" id="bc_other_income" class="bc-mono" placeholder="0" min="0" oninput="bcSave();bcCalcIncome()"></div></div>'+
      '<div class="bc-field"><label>HECS-HELP Balance</label><div class="bc-pfx"><span>$</span><input type="number" id="bc_hecs" class="bc-mono" placeholder="0" min="0" oninput="bcSave();bcCalcIncome()"></div><div class="bc-helper">Monthly repayment deducted from capacity</div></div>'+
    '</div><div class="bc-divider"></div><div class="bc-g4" id="bc-income-summary"></div></div>'+
    '<div class="bc-card"><div class="bc-card-title"><i class="ti ti-user"></i> Borrower Details</div><div class="bc-g2">'+
      '<div class="bc-field"><label>Borrower 1 Name</label><input type="text" id="bc_b1_name" placeholder="e.g. Alex Smith" oninput="bcSave()"></div>'+
      '<div class="bc-field"><label>Borrower 2 Name (if applicable)</label><input type="text" id="bc_b2_name" placeholder="Leave blank if single applicant" oninput="bcSave()"></div>'+
      '<div class="bc-field"><label>B1 Employment Type</label><select id="bc_b1_emp" onchange="bcSave()"><option value="paye">PAYG / Salaried</option><option value="self">Self-Employed</option><option value="contractor">Contractor</option><option value="casual">Casual</option><option value="part">Part-Time</option></select></div>'+
      '<div class="bc-field"><label>B2 Employment Type</label><select id="bc_b2_emp" onchange="bcSave();bcCalcHEM()"><option value="none">Not Applicable</option><option value="paye">PAYG / Salaried</option><option value="self">Self-Employed</option><option value="contractor">Contractor</option><option value="casual">Casual</option><option value="part">Part-Time</option></select></div>'+
      '<div class="bc-field"><label>Dependants</label><select id="bc_dependants" onchange="bcSave();bcCalcHEM()"><option value="0">0</option><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4+</option></select></div>'+
      '<div class="bc-field"><label>Location</label><select id="bc_location" onchange="bcSave();bcCalcHEM()"><option value="major">Major City (Syd/Mel/Bris)</option><option value="other_city">Other Capital City</option><option value="regional">Regional</option><option value="rural">Rural / Remote</option></select></div>'+
    '</div></div>'+
    '<div class="bc-btn-row"><button class="bc-btn bc-btn-secondary" onclick="bcGo(\'review\')">← Back</button><button class="bc-btn bc-btn-primary" onclick="bcGo(\'expenses\')">Next: Living Expenses →</button></div>'+
  '</div>'+

  // EXPENSES
  '<div class="bc-section" id="bc-sec-expenses">'+
    '<div class="bc-page-header"><div class="bc-eyebrow">Step 3 of 6</div><h2>Living Expenses</h2>'+
      '<p>Imported from your transaction categories (3-month average). Lenders use the <strong>higher</strong> of your declared expenses or the HEM benchmark.</p></div>'+
    '<div class="bc-card"><div class="bc-card-title"><i class="ti ti-shopping-cart"></i> HEM — Absolute Basics</div><div class="bc-g3">'+
      '<div class="bc-field"><label>Groceries (monthly) <span class="bc-src-badge" id="bc_gr-src">manual</span></label><div class="bc-pfx"><span>$</span><input type="number" id="bc_exp_groceries" class="bc-mono" placeholder="0" min="0" oninput="bcSave();bcCalcHEM()"></div></div>'+
      '<div class="bc-field"><label>Utilities — Power, Gas, Water <span class="bc-src-badge" id="bc_ut-src">manual</span></label><div class="bc-pfx"><span>$</span><input type="number" id="bc_exp_utilities" class="bc-mono" placeholder="0" min="0" oninput="bcSave();bcCalcHEM()"></div></div>'+
      '<div class="bc-field"><label>Phone &amp; Internet <span class="bc-src-badge" id="bc_ph-src">manual</span></label><div class="bc-pfx"><span>$</span><input type="number" id="bc_exp_comms" class="bc-mono" placeholder="0" min="0" oninput="bcSave();bcCalcHEM()"></div></div>'+
      '<div class="bc-field"><label>Transport — Fuel, Rego, PT <span class="bc-src-badge" id="bc_tr-src">manual</span></label><div class="bc-pfx"><span>$</span><input type="number" id="bc_exp_transport" class="bc-mono" placeholder="0" min="0" oninput="bcSave();bcCalcHEM()"></div></div>'+
      '<div class="bc-field"><label>Children\'s Clothing</label><div class="bc-pfx"><span>$</span><input type="number" id="bc_exp_kids_clothing" class="bc-mono" placeholder="0" min="0" oninput="bcSave();bcCalcHEM()"></div></div>'+
      '<div class="bc-field"><label>Personal Care &amp; Health <span class="bc-src-badge" id="bc_pc-src">manual</span></label><div class="bc-pfx"><span>$</span><input type="number" id="bc_exp_personal" class="bc-mono" placeholder="0" min="0" oninput="bcSave();bcCalcHEM()"></div></div>'+
    '</div></div>'+
    '<div class="bc-card"><div class="bc-card-title"><i class="ti ti-tools-kitchen-2"></i> HEM — Discretionary</div><div class="bc-g3">'+
      '<div class="bc-field"><label>Dining Out &amp; Takeaway <span class="bc-src-badge" id="bc_di-src">manual</span></label><div class="bc-pfx"><span>$</span><input type="number" id="bc_exp_dining" class="bc-mono" placeholder="0" min="0" oninput="bcSave();bcCalcHEM()"></div></div>'+
      '<div class="bc-field"><label>Entertainment &amp; Leisure <span class="bc-src-badge" id="bc_en-src">manual</span></label><div class="bc-pfx"><span>$</span><input type="number" id="bc_exp_entertainment" class="bc-mono" placeholder="0" min="0" oninput="bcSave();bcCalcHEM()"></div></div>'+
      '<div class="bc-field"><label>Adult Clothing &amp; Footwear <span class="bc-src-badge" id="bc_cl-src">manual</span></label><div class="bc-pfx"><span>$</span><input type="number" id="bc_exp_clothing" class="bc-mono" placeholder="0" min="0" oninput="bcSave();bcCalcHEM()"></div></div>'+
      '<div class="bc-field"><label>Alcohol &amp; Tobacco <span class="bc-src-badge" id="bc_al-src">manual</span></label><div class="bc-pfx"><span>$</span><input type="number" id="bc_exp_alcohol" class="bc-mono" placeholder="0" min="0" oninput="bcSave();bcCalcHEM()"></div></div>'+
      '<div class="bc-field"><label>Childcare / School Fees <span class="bc-src-badge" id="bc_ch-src">manual</span></label><div class="bc-pfx"><span>$</span><input type="number" id="bc_exp_childcare" class="bc-mono" placeholder="0" min="0" oninput="bcSave();bcCalcHEM()"></div></div>'+
      '<div class="bc-field"><label>Subscriptions &amp; Streaming <span class="bc-src-badge" id="bc_su-src">manual</span></label><div class="bc-pfx"><span>$</span><input type="number" id="bc_exp_subs" class="bc-mono" placeholder="0" min="0" oninput="bcSave();bcCalcHEM()"></div></div>'+
    '</div></div>'+
    '<div class="bc-card"><div class="bc-card-title"><i class="ti ti-pin"></i> Committed Expenses</div><div class="bc-g3">'+
      '<div class="bc-field"><label>Health &amp; Life Insurance <span class="bc-src-badge" id="bc_ins-src">manual</span></label><div class="bc-pfx"><span>$</span><input type="number" id="bc_exp_insurance" class="bc-mono" placeholder="0" min="0" oninput="bcSave();bcCalcHEM()"></div></div>'+
      '<div class="bc-field"><label>Private School Fees</label><div class="bc-pfx"><span>$</span><input type="number" id="bc_exp_school" class="bc-mono" placeholder="0" min="0" oninput="bcSave();bcCalcHEM()"></div></div>'+
      '<div class="bc-field"><label>Other Committed Expenses</label><div class="bc-pfx"><span>$</span><input type="number" id="bc_exp_other" class="bc-mono" placeholder="0" min="0" oninput="bcSave();bcCalcHEM()"></div></div>'+
    '</div></div>'+
    '<div class="bc-card"><div class="bc-card-title"><i class="ti ti-ruler"></i> HEM Benchmark Comparison</div><div id="bc-hem-content"><p class="bc-muted">Enter expenses above to see comparison.</p></div></div>'+
    '<div class="bc-btn-row"><button class="bc-btn bc-btn-secondary" onclick="bcGo(\'income\')">← Back</button><button class="bc-btn bc-btn-primary" onclick="bcGo(\'assets\')">Next: Assets →</button></div>'+
  '</div>'+

  // ASSETS
  '<div class="bc-section" id="bc-sec-assets">'+
    '<div class="bc-page-header"><div class="bc-eyebrow">Step 4 of 6</div><h2>Assets</h2><p>Imported from your Bank Accounts, Investments, Super and Mortgages. Review and adjust as needed.</p></div>'+
    '<div class="bc-card"><div class="bc-card-title"><i class="ti ti-building-bank"></i> Savings &amp; Investments</div><div class="bc-g3">'+
      '<div class="bc-field"><label>Cash &amp; Savings <span class="bc-src-badge" id="bc_cash-src">manual</span></label><div class="bc-pfx"><span>$</span><input type="number" id="bc_a_cash" class="bc-mono" placeholder="0" min="0" oninput="bcSave();bcCalcAssets()"></div></div>'+
      '<div class="bc-field"><label>Term Deposits</label><div class="bc-pfx"><span>$</span><input type="number" id="bc_a_term" class="bc-mono" placeholder="0" min="0" oninput="bcSave();bcCalcAssets()"></div></div>'+
      '<div class="bc-field"><label>Shares / ETFs / Crypto</label><div class="bc-pfx"><span>$</span><input type="number" id="bc_a_shares" class="bc-mono" placeholder="0" min="0" oninput="bcSave();bcCalcAssets()"></div></div>'+
      '<div class="bc-field"><label>Superannuation (total) <span class="bc-src-badge" id="bc_super-src">manual</span></label><div class="bc-pfx"><span>$</span><input type="number" id="bc_a_super" class="bc-mono" placeholder="0" min="0" oninput="bcSave();bcCalcAssets()"></div><div class="bc-helper">Not used in borrowing calc — shown for net worth</div></div>'+
    '</div></div>'+
    '<div class="bc-card"><div class="bc-card-title"><i class="ti ti-home"></i> Property Assets</div><div id="bc-property-list"></div>'+
      '<button class="bc-btn bc-btn-secondary bc-btn-sm bc-mt10" onclick="bcAddProperty()">+ Add Property</button></div>'+
    '<div class="bc-card"><div class="bc-card-title"><i class="ti ti-car"></i> Other Assets</div><div class="bc-g3">'+
      '<div class="bc-field"><label>Motor Vehicles</label><div class="bc-pfx"><span>$</span><input type="number" id="bc_a_vehicles" class="bc-mono" placeholder="0" min="0" oninput="bcSave();bcCalcAssets()"></div></div>'+
      '<div class="bc-field"><label>Household Contents</label><div class="bc-pfx"><span>$</span><input type="number" id="bc_a_contents" class="bc-mono" placeholder="0" min="0" oninput="bcSave();bcCalcAssets()"></div></div>'+
      '<div class="bc-field"><label>Business Interests</label><div class="bc-pfx"><span>$</span><input type="number" id="bc_a_business" class="bc-mono" placeholder="0" min="0" oninput="bcSave();bcCalcAssets()"></div></div>'+
    '</div><div class="bc-divider"></div><div id="bc-asset-totals"></div></div>'+
    '<div class="bc-btn-row"><button class="bc-btn bc-btn-secondary" onclick="bcGo(\'expenses\')">← Back</button><button class="bc-btn bc-btn-primary" onclick="bcGo(\'liabilities\')">Next: Liabilities →</button></div>'+
  '</div>'+

  // LIABILITIES
  '<div class="bc-section" id="bc-sec-liabilities">'+
    '<div class="bc-page-header"><div class="bc-eyebrow">Step 5 of 6</div><h2>Liabilities</h2><p>Imported from your Liabilities and Mortgages. Credit card <em>limits</em> (not balances) are assessed at 3% per month.</p></div>'+
    '<div class="bc-card"><div class="bc-card-title"><i class="ti ti-credit-card"></i> Credit Cards</div><div id="bc-cc-list"></div>'+
      '<button class="bc-btn bc-btn-secondary bc-btn-sm bc-mt10" onclick="bcAddCC()">+ Add Credit Card</button>'+
      '<div class="bc-helper bc-mt8">⚠️ Banks assess 3% of total credit limit monthly — regardless of balance owed.</div></div>'+
    '<div class="bc-card"><div class="bc-card-title"><i class="ti ti-car"></i> Personal &amp; Vehicle Loans</div><div id="bc-loan-list"></div>'+
      '<button class="bc-btn bc-btn-secondary bc-btn-sm bc-mt10" onclick="bcAddLoan()">+ Add Loan</button></div>'+
    '<div class="bc-card"><div class="bc-card-title"><i class="ti ti-home"></i> Existing Mortgages <span class="bc-src-badge bc-ml6" id="bc_mort-src">manual</span></div><div id="bc-mortgage-list"></div>'+
      '<button class="bc-btn bc-btn-secondary bc-btn-sm bc-mt10" onclick="bcAddMortgage()">+ Add Existing Mortgage</button></div>'+
    '<div class="bc-card"><div class="bc-card-title"><i class="ti ti-chart-bar"></i> Liabilities Summary</div><div id="bc-liab-summary"><p class="bc-muted">Add liabilities above.</p></div></div>'+
    '<div class="bc-btn-row"><button class="bc-btn bc-btn-secondary" onclick="bcGo(\'assets\')">← Back</button><button class="bc-btn bc-btn-primary" onclick="bcGo(\'loandetails\')">Next: Loan Details →</button></div>'+
  '</div>'+

  // LOAN DETAILS
  '<div class="bc-section" id="bc-sec-loandetails">'+
    '<div class="bc-page-header"><div class="bc-eyebrow">Step 6 of 6</div><h2>Loan Details</h2><p>Enter the proposed loan. The APRA 3% serviceability buffer is applied automatically.</p></div>'+
    '<div class="bc-card"><div class="bc-card-title"><i class="ti ti-home"></i> Property &amp; Loan Parameters</div><div class="bc-g3">'+
      '<div class="bc-field"><label>Target Property Value</label><div class="bc-pfx"><span>$</span><input type="number" id="bc_property_value" class="bc-mono" placeholder="0" min="0" oninput="bcSave();bcCalcLoan()"></div></div>'+
      '<div class="bc-field"><label>Deposit / Equity Available</label><div class="bc-pfx"><span>$</span><input type="number" id="bc_deposit" class="bc-mono" placeholder="0" min="0" oninput="bcSave();bcCalcLoan()"></div></div>'+
      '<div class="bc-field"><label>Proposed Loan Amount</label><div class="bc-pfx"><span>$</span><input type="number" id="bc_loan_amount" class="bc-mono" placeholder="0" min="0" oninput="bcSave();bcCalcLoan()"></div><div class="bc-helper">Or auto: property − deposit</div></div>'+
      '<div class="bc-field"><label>Interest Rate (% p.a.)</label><input type="number" id="bc_interest_rate" class="bc-mono" value="6.50" min="0" max="20" step="0.01" oninput="bcSave();bcCalcLoan()"><div class="bc-helper">+3% APRA buffer → assessed at <span id="bc-buf-display">9.50%</span></div></div>'+
      '<div class="bc-field"><label>Loan Term</label><select id="bc_loan_term" onchange="bcSave();bcCalcLoan()"><option value="30">30 years</option><option value="25">25 years</option><option value="20">20 years</option><option value="15">15 years</option><option value="10">10 years</option></select></div>'+
      '<div class="bc-field"><label>Repayment Type</label><select id="bc_repay_type" onchange="bcSave();bcCalcLoan()"><option value="pi">Principal &amp; Interest</option><option value="io">Interest Only</option></select></div>'+
      '<div class="bc-field"><label>State / Territory</label><select id="bc_state" onchange="bcSave();bcCalcLoan()"><option value="NSW">New South Wales</option><option value="VIC">Victoria</option><option value="QLD">Queensland</option><option value="WA">Western Australia</option><option value="SA">South Australia</option><option value="TAS">Tasmania</option><option value="ACT">ACT</option><option value="NT">Northern Territory</option></select></div>'+
      '<div class="bc-field"><label>First Home Buyer?</label><select id="bc_fhb" onchange="bcSave();bcCalcLoan()"><option value="no">No</option><option value="yes">Yes</option></select></div>'+
      '<div class="bc-field"><label>Application Purpose</label><select id="bc_purpose" onchange="bcSave()"><option value="owner_occ">Owner Occupied — P&I</option><option value="owner_io">Owner Occupied — IO</option><option value="invest_pi">Investment — P&I</option><option value="invest_io">Investment — IO</option><option value="refinance">Refinance</option></select></div>'+
    '</div></div>'+
    '<div class="bc-card"><div class="bc-card-title"><i class="ti ti-calculator"></i> Loan Calculations</div><div id="bc-loan-calc-content"><p class="bc-muted">Enter property value and interest rate above.</p></div></div>'+
    '<div class="bc-btn-row"><button class="bc-btn bc-btn-secondary" onclick="bcGo(\'liabilities\')">← Back</button><button class="bc-btn bc-btn-primary" onclick="bcGo(\'results\')">View Affordability Report →</button></div>'+
  '</div>'+

  // RESULTS
  '<div class="bc-section" id="bc-sec-results">'+
    '<div class="bc-page-header bc-no-print"><div class="bc-eyebrow">Affordability Report</div><h2>Borrowing Snapshot</h2><p>Based on the APRA 3% buffer, HEM benchmarks, and your app data.</p></div>'+
    '<div class="bc-btn-row bc-no-print bc-mb16">'+
      '<button class="bc-btn bc-btn-success" onclick="bcExportPDF()"><i class="ti ti-printer"></i> Export PDF</button>'+
      '<button class="bc-btn bc-btn-amber" onclick="bcExportCSV()"><i class="ti ti-file-spreadsheet"></i> Export CSV</button>'+
      '<button class="bc-btn bc-btn-secondary" onclick="bcGenerateReport()"><i class="ti ti-refresh"></i> Recalculate</button>'+
      '<button class="bc-btn bc-btn-secondary" onclick="bcGo(\'review\')">← Edit Details</button></div>'+
    '<div class="bc-print-area">'+
      '<div class="bc-print-hdr"><div class="bc-print-title">Kelda Finance — Borrowing Power Report</div>'+
        '<div class="bc-print-date" id="bc-print-date-line"></div>'+
        '<div class="bc-print-disc">General estimate only. Not financial advice. For discussion with a licensed mortgage broker or lender.</div></div>'+
      '<div id="bc-report-content"></div>'+
    '</div>'+
  '</div>'+

  '</div>'; // .bc-root
}

// Entry point — called by the router in app.js on go('borrowing').
function renderBorrowing(){
  var host=document.getElementById('page-borrowing');
  if(!host) return;
  if(!bcMounted){
    host.innerHTML=bcMarkup();
    bcMounted=true;
  }
  // Always pull the latest app data on open. bcLoad() first restores the
  // user's persisted loan scenario + borrower details, which bcSync() never
  // overwrites — so the income/expenses/assets/liabilities always reflect
  // current app data while the forward-looking loan inputs are preserved.
  bcLoad();
  bcSync();
  var ir=document.getElementById('bc_interest_rate');
  if(ir && !ir.value) ir.value='6.50';
  bcGo('review');
}
