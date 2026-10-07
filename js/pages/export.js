// ══════════════════════════════════════════════════════════════
let _csvRaw=[], _csvHeaders=[], _csvParsed=[];

const CSV_FIELDS=[
  {v:'',      l:'— Ignore —'},
  {v:'date',  l:'Date (required)'},
  {v:'amount',l:'Amount (required)'},
  {v:'debit', l:'Debit / Withdrawal'},
  {v:'credit',l:'Credit / Deposit'},
  {v:'name',  l:'Merchant Name'},
  {v:'desc',  l:'Description / Notes'},
  {v:'cat',   l:'Category'},
  {v:'subcat',l:'Subcategory'},
  {v:'type',  l:'Type (income/expense)'},
  {v:'account',l:'Account'},
];

// Category matching now uses LCATS dynamically

// American Express exports list purchases as positive amounts and payments as
// negative, the reverse of bank exports, so step 2's "Positive amounts are
// spending" box starts ticked for them. Their "Appears On Your Statement As"
// and "Extended Details" columns don't appear in bank files.
function csvIsAmex(headers){
  return headers.some(h=>{
    const s=h.toLowerCase().replace(/[^a-z]/g,'');
    return s==='appearsonyourstatementas'||s==='extendeddetails';
  });
}

// Guess column mapping from header name
function csvGuess(h,amex){
  const s=h.toLowerCase().replace(/[^a-z]/g,'');
  if(amex){
    // Amex "Description" is the merchant. Reference, Category, Account # and the
    // address columns would otherwise be guessed as notes, category or account.
    if(s==='description')return'name';
    if(s==='extendeddetails')return'desc';
    if(!/^amount|date/.test(s))return'';
  }
  if(/date|day|time|posted|^trans(action)?s?$/.test(s))return'date';
  if(/debit|withdraw|charge/.test(s))return'debit';
  if(/credit|deposit/.test(s))return'credit';
  if(/amount|amt|sum|total/.test(s)&&!/balance/.test(s))return'amount';
  if(/merchant|vendor|payee|supplier|store|shop/.test(s))return'name';
  if(/subcat|subcategory|sub/.test(s))return'subcat';
  if(/^cat|category|class|group/.test(s))return'cat';
  if(/account|acct|wallet/.test(s))return'account';
  if(/type|kind/.test(s))return'type';
  if(/desc|memo|narr|note|ref|detail/.test(s))return'desc';
  return'';
}

// Parse CSV text → {headers, rows}
// Quoted cells may hold commas, line breaks (Amex addresses and extended
// details) and "" for a literal quote. Line breaks inside a cell become spaces.
function csvParse(text){
  const recs=[];let rec=[],cur='',inQ=false;
  text=String(text).replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(inQ){
      if(c==='"'){if(text[i+1]==='"'){cur+='"';i++;}else inQ=false;}
      else if(c==='\r'&&text[i+1]==='\n')continue;
      else cur+=(c==='\r'||c==='\n')?' ':c;
    }
    else if(c==='"'&&!cur.trim())inQ=true;
    else if(c===','){rec.push(cur.trim());cur='';}
    else if(c==='\n'||c==='\r'){
      if(c==='\r'&&text[i+1]==='\n')i++;
      rec.push(cur.trim());recs.push(rec);rec=[];cur='';
    }
    else cur+=c;
  }
  rec.push(cur.trim());recs.push(rec);
  const filled=recs.filter(v=>v.some(x=>x));
  // Some exports put a title or account summary above the header row. Use the
  // first row that names a date column and an amount column, else the first row.
  let hi=filled.findIndex(v=>{
    const g=v.map(h=>csvGuess(h));
    return g.includes('date')&&(g.includes('amount')||g.includes('debit')||g.includes('credit'));
  });
  if(hi<0)hi=0;
  if(filled.length-hi<2)return{headers:[],rows:[]};
  const headers=filled[hi];
  const rows=filled.slice(hi+1).map(v=>{
    const obj={};headers.forEach((h,j)=>{obj[h]=v[j]||'';});
    return obj;
  });
  return{headers,rows};
}

// Parse dollar string → float (handles $1,234.56 and (123) negatives)
function csvDollar(s){
  if(!s)return NaN;
  s=String(s).replace(/[$, ]/g,'').trim();
  if(/^\(.*\)$/.test(s))return-parseFloat(s.replace(/[()]/g,''));
  return parseFloat(s);
}

// Parse date string → YYYY-MM-DD
function csvDate(s){
  if(!s)return null;
  s=s.trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;
  // Australian format DD/MM/YYYY: treat first number as day, second as month
  const parts=s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if(parts){let[,a,b,y]=parts;if(y.length===2)y='20'+y;return`${y}-${b.padStart(2,'0')}-${a.padStart(2,'0')}`;}
  // Month-name dates: "8 Oct 2026", "08-Oct-26", "Oct 8, 2026"
  const mon=m=>['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(m.slice(0,3).toLowerCase())+1;
  let mn=s.match(/^(\d{1,2})[ \-]([a-z]{3,9})\.?,?[ \-](\d{2}|\d{4})$/i),d,m,y;
  if(mn){[,d,m,y]=mn;}
  else if((mn=s.match(/^([a-z]{3,9})\.? (\d{1,2}),? (\d{4})$/i))){[,m,d,y]=mn;}
  if(mn&&mon(m)){if(y.length===2)y='20'+y;return`${y}-${String(mon(m)).padStart(2,'0')}-${d.padStart(2,'0')}`;}
  // Anything else the browser can read. Use the local calendar date: toISOString()
  // is UTC, which is the previous day for midnight in Australia.
  const nd=new Date(s);
  if(!isNaN(nd))return`${nd.getFullYear()}-${String(nd.getMonth()+1).padStart(2,'0')}-${String(nd.getDate()).padStart(2,'0')}`;
  return null;
}

// Guess category from description
function csvCatGuess(desc, merchant){
  const s=(desc||'').toLowerCase()+' '+(merchant||'').toLowerCase();
  if(!s.trim())return{cat:'Other',subcat:''};
  // Map to LCATS categories
  if(/woolworths|coles|aldi|iga|foodland|harris farm|supermarket/.test(s))return{cat:'Food & Eating Out',subcat:'Groceries'};
  if(/restaurant|dining|the grill|la piazza/.test(s))return{cat:'Food & Eating Out',subcat:'Eating Out (Cafes, Restaurant Food)'};
  if(/cafe|coffee|starbucks|muffin break|hudsons/.test(s))return{cat:'Food & Eating Out',subcat:'Cafe and Lunches'};
  if(/uber eats|doordash|menulog|deliveroo/.test(s))return{cat:'Food & Eating Out',subcat:'Uber Eats and Delivery'};
  if(/mcdonald|kfc|hungry jacks|dominos|pizza|subway/.test(s))return{cat:'Food & Eating Out',subcat:'Eating Out (Cafes, Restaurant Food)'};
  if(/dan murphy|bws|liquorland|wine|bottle shop|bar/.test(s))return{cat:'Food & Eating Out',subcat:'Alcohol and Bars'};
  if(/uber(?! eats)|lyft|taxi|ola|didi/.test(s))return{cat:'Car & Transport',subcat:'Ubers and Taxis'};
  if(/fuel|petrol|bp |caltex|shell|ampol|7.eleven/.test(s))return{cat:'Car & Transport',subcat:'Petrol'};
  if(/parking|wilson|secure|care park/.test(s))return{cat:'Car & Transport',subcat:'Car Parking'};
  if(/train|metro|opal|myki|go card|bus |ferry|transit/.test(s))return{cat:'Car & Transport',subcat:'Public Transport'};
  if(/toll|linkt|etag|e-toll/.test(s))return{cat:'Car & Transport',subcat:'Tolls'};
  if(/netflix/.test(s))return{cat:'Entertainment',subcat:'Netflix'};
  if(/amazon prime/.test(s))return{cat:'Entertainment',subcat:'Amazon Prime'};
  if(/apple|itunes/.test(s))return{cat:'Entertainment',subcat:'Apple Subscriptions'};
  if(/spotify|disney|foxtel|stan /.test(s))return{cat:'Entertainment',subcat:'Other Entertainment'};
  if(/agl|origin energy|energyaustralia|electricity/.test(s))return{cat:'Home',subcat:'Power Bill'};
  if(/telstra|optus|vodafone|amaysim|mobile/.test(s))return{cat:'Insurance & Utilities',subcat:'Mobile Phone Bills'};
  if(/nbn|internet|aussie broadband|iinet|tpg/.test(s))return{cat:'Home',subcat:'Home Internet'};
  if(/power|energy|gas|water|utility/.test(s))return{cat:'Home',subcat:'Power Bill'};
  if(/doctor|gp |medical centre|bulk bill/.test(s))return{cat:'Health & Beauty',subcat:'Doctors, Health, Specialists'};
  if(/chemist|pharmacy|priceline|terry white/.test(s))return{cat:'Health & Beauty',subcat:'Pharmacy'};
  if(/dental|dentist/.test(s))return{cat:'Health & Beauty',subcat:'Doctors, Health, Specialists'};
  if(/gym|fitness|f45|crossfit|yoga|anytime fitness/.test(s))return{cat:'Fitness',subcat:'Gym'};
  if(/salary|payroll|paycheck|wages|pay run/.test(s))return{cat:'Salary',subcat:'Regular Pay'};
  if(/bonus/.test(s))return{cat:'Bonus',subcat:''};
  if(/interest/.test(s))return{cat:'Interest',subcat:'Savings Interest'};
  if(/amazon(?! prime)|ebay|shop|kmart|target|big w|myer|david jones/.test(s))return{cat:'Shopping',subcat:'Online Shopping'};
  if(/booking|airbnb|hotel|flight|qantas|jetstar|virgin australia/.test(s))return{cat:'Holidays & Travel',subcat:''};
  if(/vet|animal|dog|pet/.test(s))return{cat:'Pets',subcat:''};
  if(/childcare|kinder|daycare|school/.test(s))return{cat:'Children Expenses',subcat:'Childcare'};
  return{cat:'Other',subcat:''};
}

// ── UI HELPERS ───────────────────────────────────────────────
function csvGoStep(n){
  [1,2,3].forEach(i=>{
    document.getElementById('csv-p'+i).classList.toggle('show',i===n);
    const sn=document.getElementById('csn'+i);
    const sl=document.getElementById('csl'+i);
    sn.className='csv-snum'+(i<n?' done':i===n?' active':'');
    sn.textContent=i<n?'✓':i;
    sl.className='csv-slbl'+(i===n?' active':'');
  });
  document.getElementById('csv-cancel-btn').style.display=n===1?'none':'';
}

// Step 2's "Positive amounts are spending" box, for credit card files
function csvSetPosSpend(on){
  const el=document.getElementById('csv-pos-spend');
  if(el)el.checked=on;
}
function csvPosIsSpend(){
  const el=document.getElementById('csv-pos-spend');
  return !!(el&&el.checked);
}

function csvReset(){
  _csvRaw=[];_csvHeaders=[];_csvParsed=[];
  csvSetPosSpend(false);
  document.getElementById('csv-file-input').value='';
  csvGoStep(1);
}

// ── CSV wizard host management ───────────────────────────────
// One wizard (#csv-wizard) is shared between the Upload Transactions page
// (#csv-mount, its default home) and the pop-up modal (#csv-modal-box).
// Relocating the node avoids duplicate element IDs.
function csvMountOnPage(){
  var w = document.getElementById('csv-wizard');
  var mount = document.getElementById('csv-mount');
  if (w && mount && w.parentNode !== mount) mount.appendChild(w);
}
function openCsvModal(){
  var w = document.getElementById('csv-wizard');
  var box = document.getElementById('csv-modal-box');
  if (w && box && w.parentNode !== box) box.appendChild(w);
  csvReset();
  var m = document.getElementById('csv-modal');
  if (m) m.classList.add('open');
}
function closeCsvModal(){
  var m = document.getElementById('csv-modal');
  if (m) m.classList.remove('open');
  csvMountOnPage();
}

// ── DRAG & DROP ──────────────────────────────────────────────
function csvDragOver(e){e.preventDefault();document.getElementById('csv-drop').classList.add('drag-over');}
function csvDragLeave(e){document.getElementById('csv-drop').classList.remove('drag-over');}
function csvDrop(e){
  e.preventDefault();document.getElementById('csv-drop').classList.remove('drag-over');
  const f=e.dataTransfer.files[0];if(f)csvProcess(f);
}
function csvFileChosen(e){if(e.target.files[0])csvProcess(e.target.files[0]);}

function csvProcess(file){
  if(!file.name.match(/\.(csv|txt)$/i)){toast('⚠️ Please upload a .csv file');return;}
  const r=new FileReader();
  r.onload=e=>{
    const{headers,rows}=csvParse(e.target.result);
    if(!headers.length||!rows.length){toast('⚠️ Could not read file — check the format');return;}
    _csvHeaders=headers;_csvRaw=rows;
    const amex=csvIsAmex(headers);
    csvSetPosSpend(amex);
    csvBuildMapTable(amex);csvGoStep(2);
    if(amex)toast('American Express file: “Positive amounts are spending” is ticked');
  };
  r.readAsText(file);
}

// ── MAPPING TABLE ────────────────────────────────────────────
function csvBuildMapTable(amex){
  const tbody=document.getElementById('csv-map-body');
  const html=[];
  // First matching column wins, so "Date Processed" or "Reference" can't
  // replace an earlier "Date" or "Description" when the preview reads the map
  const taken=new Set();
  _csvHeaders.forEach(h=>{
    const samples=_csvRaw.slice(0,3).map(r=>r[h]).filter(Boolean).join(', ');
    let guess=csvGuess(h,amex);
    if(taken.has(guess))guess='';
    if(guess)taken.add(guess);
    const opts=CSV_FIELDS.map(o=>`<option value="${o.v}"${o.v===guess?' selected':''}>${o.l}</option>`).join('');
    html.push(`<tr>
      <td class="up-map-col">${h}</td>
      <td class="up-map-sample">${samples||'(empty)'}</td>
      <td><select data-col="${h}" class="up-map-sel">${opts}</select></td>
    </tr>`);
  });
  tbody.innerHTML=html.join('');
}

// ── PREVIEW ──────────────────────────────────────────────────
function csvPreview(){
  // Collect mapping
  const map={};
  document.querySelectorAll('#csv-map-body select').forEach(sel=>{if(sel.value)map[sel.value]=sel.dataset.col;});
  if(!map.date){toast('⚠️ Please map a Date column');return;}
  if(!map.amount&&!map.debit&&!map.credit){toast('⚠️ Please map an Amount, Debit or Credit column');return;}

  // Only a single Amount column is flipped; Debit/Credit columns carry their own direction
  const flip=!!map.amount&&csvPosIsSpend();
  _csvParsed=_csvRaw.map((row,idx)=>{
    const r={_idx:idx,_err:null,_dup:false};

    // Date
    r.date=csvDate(row[map.date]);
    if(!r.date)r._err='Invalid date';

    // Amount
    let amt=NaN;
    if(map.amount){amt=csvDollar(row[map.amount]);if(flip)amt=-amt;}
    else{
      const d=csvDollar(row[map.debit]||'0');
      const c=csvDollar(row[map.credit]||'0');
      amt=(isNaN(c)?0:c)-(isNaN(d)?0:Math.abs(d));
    }
    if(isNaN(amt)){r._err=r._err||'Invalid amount';amt=0;}

    // Type
    if(map.type){
      const tv=(row[map.type]||'').toLowerCase();
      r.type=/credit|income|deposit/.test(tv)?'income':'expense';
    }else{r.type=amt>=0?'income':'expense';}
    r.amount=Math.abs(amt);

    // Merchant name
    r.name=map.name?(row[map.name]||'').trim():'';
    // Account
    r.account=map.account?(row[map.account]||'').trim().toLowerCase():'';
    // Description / Notes
    r.description=map.desc?(row[map.desc]||'').trim():'';
    // Category and subcategory — use AutoCat if available, fall back to legacy guesser
    var _acResult = (typeof AutoCat !== 'undefined')
      ? AutoCat.categorise(r.name, r.description, r.amount, r.type)
      : null;
    var csvGuessed = _acResult
      ? { cat: (function(){ var c=LCATS.find(function(x){return x.id===_acResult.catId;}); return c?c.name:'Other'; })(), subcat: _acResult.subcat||'' }
      : csvCatGuess(r.description, r.name);
    if(map.cat){
      const cv=(row[map.cat]||'').trim();
      // Try to match against LCATS names
      const matchedCat=LCATS.find(function(c){return c.name.toLowerCase()===cv.toLowerCase();});
      r.category=matchedCat?matchedCat.name:(cv||csvGuessed.cat);
      r.catId=matchedCat?matchedCat.id:catIdFor(r.category);
    }else{
      r.category=csvGuessed.cat;
      r.catId=_acResult?_acResult.catId:catIdFor(r.category);
    }
    // Subcategory — explicit mapping takes priority, then guessed
    if(map.subcat){
      r.subcat=(row[map.subcat]||'').trim()||csvGuessed.subcat;
    }else{
      r.subcat=csvGuessed.subcat;
    }
    if(!r.category)r.category='Other';

    // Duplicate check
    r._dup = (typeof AutoCat !== 'undefined')
      ? AutoCat.isDuplicate(r.date, r.amount, r.name, TX)
      : TX.some(t=>t.date===r.date&&Math.abs(Number(t.amount)-r.amount)<0.01&&(t.description||'').toLowerCase()===(r.description||'').toLowerCase());

    return r;
  });

  csvRefreshPreview();
  csvGoStep(3);
}

function csvRefreshPreview(){
  const skip=document.getElementById('csv-skip-dupes')?.checked;
  const tbody=document.getElementById('csv-prev-body');
  // Build the rows as one string: appending with innerHTML+= re-parses the whole
  // table per row, which is quadratic and runs iOS Safari out of memory on a
  // typical bank export (~1,000+ rows).
  const html=[];
  let total=0,dupes=0,errs=0,willImport=0;

  _csvParsed.forEach(r=>{
    total++;
    const isErr=!!r._err||r.amount===0;
    const isDup=r._dup;
    if(isDup)dupes++;if(isErr)errs++;
    const skipped=(isDup&&skip)||isErr;
    if(!skipped)willImport++;

    let status=isErr?`<span class="tag-err">${ICON('alert-triangle')} ${r._err||'Zero amount'}</span>`:
      isDup?`<span class="tag-dup">Duplicate</span>`:`<span class="tag-ok">${ICON('check')} Ready</span>`;

    const cls=isErr?'row-err':isDup?'row-dup':'';
    const subcatBadge=r.subcat?'<span class="up-subcat">'+r.subcat+'</span>':'—';
    html.push('<tr class="'+cls+(skipped?' row-skip':'') + '">'
      +'<td>'+(r.date||'—')+'</td>'
      +'<td><span class="badge '+(r.type==='income'?'b-income':'b-expense')+'">'+r.type+'</span></td>'
      +'<td class="up-td-name">'+(r.name||'—')+'</td>'
      +'<td class="up-td-cat">'+(r.category||'—')+'</td>'
      +'<td>'+subcatBadge+'</td>'
      +'<td class="up-td-desc">'+(r.description||'—')+'</td>'
      +'<td class="up-td-amt '+(r.type==='income'?'tone-green':'tone-pink')+'">'+  (r.type==='income'?'+':'-')+fmt(r.amount)+'</td>'
      +'<td>'+status+'</td>'
      +'</tr>');
  });
  tbody.innerHTML=html.join('');

  document.getElementById('csv-imp-stats').innerHTML=`
    <div class="imp-stat imp-stat--total"><div class="isn">${total}</div><div class="isl">Total rows</div></div>
    <div class="imp-stat imp-stat--ok"><div class="isn tone-green">${willImport}</div><div class="isl">Will import</div></div>
    <div class="imp-stat imp-stat--dup"><div class="isn tone-amber">${dupes}</div><div class="isl">Duplicates</div></div>
    <div class="imp-stat imp-stat--err"><div class="isn tone-danger">${errs}</div><div class="isl">Errors</div></div>`;
}

// ── CONFIRM IMPORT ───────────────────────────────────────────
function csvConfirmImport(){
  const skip=document.getElementById('csv-skip-dupes')?.checked;
  let count=0;
  _csvParsed.forEach(r=>{
    if(r._err||r.amount===0)return;
    if(r._dup&&skip)return;
    var catObj=LCATS.find(function(c){return c.name===r.category;});
    TX.unshift({id:Date.now()+Math.random(),date:r.date,type:r.type,
      category:r.category,catId:r.catId||(catObj?catObj.id:'other'),
      subcat:r.subcat||'',name:r.name||'',account:r.account||'',
      description:r.description||'',amount:r.amount,person:activeProfile,_imported:true});
    count++;
  });
  save(K.tx,TX);
  // Record the CSV-import timestamp (after auto-categorisation, which runs at
  // parse time) for the data-health insight cards.
  try { save(K.lastCsvImport, today()); } catch(e) {}
  csvReset();
  renderTx();renderDashboard();
  closeCsvModal();
  if (typeof go === 'function') go('transactions'); // show the imported rows
  toast(`✅ Imported ${count} transaction${count!==1?'s':''}!`);
  // Auto re-categorise every transaction against the current rules/engine so the
  // newly imported rows pick up any learned rules that parse-time didn't apply.
  if (count > 0 && typeof AutoCat !== 'undefined' && AutoCat.reprocess) {
    AutoCat.reprocess(null, function(changed) {
      renderTx(); if (typeof renderDashboard === 'function') renderDashboard();
      if (changed > 0) toast('🤖 ' + changed + ' transaction' + (changed !== 1 ? 's' : '') + ' re-categorised');
    });
  }
}

// ── TEMPLATE DOWNLOAD ────────────────────────────────────────
function csvDownloadTemplate(){
  const rows=[
    ['date','type','name','category','subcategory','description','amount'],
    ['2025-03-01','expense','Woolworths','Food & Eating Out','Groceries','Weekly shop','127.50'],
    ['2025-03-01','income','','Salary','Regular Pay','Profile 1 salary','9200.00'],
    ['2025-03-03','expense','AGL','Home','Power Bill','March electricity','180.00'],
    ['2025-03-05','expense','Netflix','Entertainment','Netflix','Monthly subscription','19.99'],
    ['2025-03-07','income','','Salary','Regular Pay','Profile 2 salary','7800.00'],
    ['2025-03-10','expense','The Grill Restaurant','Food & Eating Out','Eating Out (Cafes, Restaurant Food)','Anniversary dinner','95.00'],
    ['2025-03-12','expense','Ampol Fuel','Car & Transport','Petrol','Fill up','90.00'],
  ];
  const blob=new Blob([rows.map(r=>r.join(',')).join('\n')],{type:'text/csv'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);
  a.download='kelda-finance-template.csv';a.click();
  toast('📄 Template downloaded!');
}




// ══════════════════════════════════════════════════════════════
// EXPORT / IMPORT DATA
// ══════════════════════════════════════════════════════════════

function renderExportPage() {
  renderExportSectionList();
  renderExportDataSummary();
}

// ── Helper: trigger file download ────────────────────────────
function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 300);
}

// ── Filename helper ───────────────────────────────────────────
function exportFilename(prefix, ext) {
  const d = new Date().toISOString().slice(0, 10);
  return 'kelda-finance-' + prefix + '-' + d + '.' + ext;
}

// ── Backup scope ──────────────────────────────────────────────
// A full backup captures EVERY key the app owns (see appKeys() in storage.js),
// including the Investment Property module's data and the Borrowing Power
// scenario, so new features are included without editing a list. Skipped: state
// that belongs to this device/session and must not travel with a backup.
const BACKUP_SKIP   = ['cff_cat_version', 'cff_app_version', 'kf_pin_lock_until', 'kf_restore_toast'];
// Never removed by a restore, so restoring can't send an existing user back through setup.
const BACKUP_KEEP   = ['kelda_wizard_complete', 'kf_onboarding_complete'];
// v2 backups held these as top-level fields. v3 still writes them there (not in
// `storage`) so an older build can read a newer backup.
const BACKUP_LEGACY = {
  transactions: K.tx, budgets: K.budgets, goals: K.goals, bills: K.bills,
  billAliases: K.billAliases, billsDismissed: K.billsDismissed, mortgage: K.mortgage,
  cashTracker: K.ct, cashConfig: K.ctcfg, insurance: K.ins, super: K.superdata, pins: K.pins,
};

function isBackupKey(k) {
  return isAppKey(k) && BACKUP_SKIP.indexOf(k) === -1;
}
// Backed-up keys other than the legacy top-level ones.
function backupStorageKeys() {
  const legacy = Object.values(BACKUP_LEGACY);
  return appKeys().filter(k => isBackupKey(k) && legacy.indexOf(k) === -1).sort();
}

// ── 1. FULL JSON BACKUP ───────────────────────────────────────
function buildFullBackup() {
  const payload = {
    _app:      getAppName(),
    _version:  3,
    _exported: new Date().toISOString(),
    transactions: TX,
    budgets:      BUDGETS,
    goals:        GOALS,
    bills:        BILLS,
    billAliases:  BILL_ALIASES,
    billsDismissed: BILLS_DISMISSED,
    mortgage:     MORTGAGE,
    cashTracker:  CT,
    cashConfig:   CTCFG,
    insurance:    INS,
    super:        SUPER,
    pins:         PINS,
    storage:      {},   // every other key, as its raw stored string
  };
  backupStorageKeys().forEach(k => {
    const v = localStorage.getItem(k);
    if (v !== null) payload.storage[k] = v;
  });
  return payload;
}

function exportFullBackup() {
  downloadFile(JSON.stringify(buildFullBackup(), null, 2), exportFilename('backup', 'json'), 'application/json');
  // Record the full-backup timestamp for the data-health insight cards.
  try { save(K.lastFullBackup, today()); } catch(e) {}
  toast('✅ Full backup downloaded!');
}

// ── 2. RESTORE FROM JSON BACKUP ──────────────────────────────
// Writes a backup into storage. The caller reloads the app afterwards so every
// page (and the embedded Investment Property module) starts from the restored
// data rather than half-updated in-memory state.
function applyBackup(d) {
  Object.keys(BACKUP_LEGACY).forEach(field => {
    if (d[field]) save(BACKUP_LEGACY[field], d[field]);
  });
  if (!d.storage || typeof d.storage !== 'object') return;   // v2: legacy fields only
  // v3 is a complete snapshot: drop app keys the backup doesn't have, so data
  // added since it was taken (say, a new investment property) doesn't linger.
  backupStorageKeys().forEach(k => {
    if (BACKUP_KEEP.indexOf(k) === -1 && !Object.prototype.hasOwnProperty.call(d.storage, k)) {
      localStorage.removeItem(k);
    }
  });
  const legacy = Object.values(BACKUP_LEGACY);
  Object.keys(d.storage).forEach(k => {
    if (!isBackupKey(k) || legacy.indexOf(k) !== -1) return;
    const v = d.storage[k];
    localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  });
}

// Read a backup file, confirm, write it and reload. `report(text, isError)` shows
// progress where the restore was started. Used by the Export page and by the
// welcome screen's "Restore from backup" link (setupDone: true), where restoring
// replaces setting up — so the setup-complete flags are set even if an older
// backup doesn't carry them.
function restoreBackupFile(file, report, opts) {
  opts = opts || {};
  report('Reading file…', false);
  const reader = new FileReader();
  reader.onload = e => {
    let d;
    try {
      d = JSON.parse(e.target.result);
      if (!d._version || !d._app) throw new Error('Not a valid backup file');
    } catch (err) {
      report('Invalid file: ' + err.message, true);
      return;
    }

    const question = opts.setupDone
      ? 'Restore this backup?\n\nAnything already set up on this device will be replaced.'
      : '⚠️ This will REPLACE all your current data with the backup.\n\nAre you sure?';
    if (!confirm(question)) {
      report('Restore cancelled.', false);
      return;
    }

    const exportedDate = d._exported ? new Date(d._exported).toLocaleString('en-AU') : 'unknown date';
    let msg = '✅ Restored backup from ' + exportedDate;
    try {
      applyBackup(d);
      if (opts.setupDone) {
        localStorage.setItem('kf_onboarding_complete', 'true');
        localStorage.setItem('kelda_wizard_complete', 'true');
      }
    } catch (err) { msg = '⚠️ Restore incomplete: ' + err.message; }   // e.g. storage full
    // Reload even after a partial restore, so nothing stale in memory is saved over it.
    try { localStorage.setItem('kf_restore_toast', msg); } catch(e) {}
    report('Restored — reloading…', false);
    location.reload();
  };
  reader.onerror = () => report('Could not read that file.', true);
  reader.readAsText(file);
}

function restoreBackup(event) {
  const file = event.target.files[0];
  event.target.value = '';   // lets the same file be picked again
  if (!file) return;
  const statusEl = document.getElementById('restore-status');
  restoreBackupFile(file, (text, isError) => {
    statusEl.innerHTML = isError
      ? '<span class="tone-danger">' + ICON('x') + ' ' + esc(text) + '</span>'
      : esc(text);
  });
}

// ── 3. TRANSACTIONS CSV ───────────────────────────────────────
function exportTransactionsCSV() {
  if (!TX.length) { toast('⚠️ No transactions to export'); return; }
  const headers = ['Date', 'Type', 'Person', 'Account', 'Name', 'Category', 'Subcategory', 'Description', 'Amount (AUD)'];
  const rows = [...TX]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(t => [
      t.date,
      t.type,
      t.person || 'joint',
      t.account || '',
      '"' + (t.name || '').replace(/"/g, '""') + '"',
      t.category || '',
      t.subcat || '',
      '"' + (t.description || '').replace(/"/g, '""') + '"',
      (t.type === 'expense' ? '-' : '') + Number(t.amount).toFixed(2),
    ].join(','));
  downloadFile([headers.join(','), ...rows].join('\n'), exportFilename('transactions', 'csv'), 'text/csv');
  toast('✅ Transactions exported (' + TX.length + ' rows)');
}

// ── 4. MONTHLY SUMMARY CSV ────────────────────────────────────
function exportSummaryCSV() {
  if (!TX.length) { toast('⚠️ No transactions to summarise'); return; }

  // Gather all unique months
  const monthsSet = new Set(TX.map(t => t.date.slice(0, 7)));
  const months = [...monthsSet].sort();

  // Gather all unique categories
  const catsSet = new Set(TX.filter(t => t.type === 'expense').map(t => t.category));
  const cats = [...catsSet].sort();

  const headers = ['Month', getUserName('brenton')+' Income', getUserName('shelley')+' Income', 'Joint Income', 'Total Income', 'Total Expenses', 'Net', ...cats.map(c => c + ' (Expense)')];

  const rows = months.map(m => {
    const bInc  = TX.filter(t => t.date.startsWith(m) && t.type === 'income'  && t.person === 'brenton').reduce((s,t) => s + Number(t.amount), 0);
    const sInc  = TX.filter(t => t.date.startsWith(m) && t.type === 'income'  && t.person === 'shelley').reduce((s,t) => s + Number(t.amount), 0);
    const jInc  = TX.filter(t => t.date.startsWith(m) && t.type === 'income'  && t.person === 'joint').reduce((s,t) => s + Number(t.amount), 0);
    const tInc  = bInc + sInc + jInc;
    const tExp  = TX.filter(t => t.date.startsWith(m) && t.type === 'expense').reduce((s,t) => s + Number(t.amount), 0);
    const catAmts = cats.map(c => TX.filter(t => t.date.startsWith(m) && t.type === 'expense' && t.category === c).reduce((s,t) => s + Number(t.amount), 0).toFixed(2));
    const mLabel = new Date(m + '-02').toLocaleString('en-AU', { month: 'long', year: 'numeric' });
    return [mLabel, bInc.toFixed(2), sInc.toFixed(2), jInc.toFixed(2), tInc.toFixed(2), tExp.toFixed(2), (tInc - tExp).toFixed(2), ...catAmts].join(',');
  });

  downloadFile([headers.join(','), ...rows].join('\n'), exportFilename('monthly-summary', 'csv'), 'text/csv');
  toast('✅ Monthly summary exported (' + months.length + ' months)');
}

// ── 5. SECTION-SPECIFIC EXPORTS ──────────────────────────────
const EXPORT_SECTIONS = [
  {
    key: 'transactions', label: 'Transactions', icon: 'credit-card',
    count: () => TX.length + ' transactions',
    exportJSON: () => { downloadFile(JSON.stringify({transactions: TX}, null, 2), exportFilename('transactions', 'json'), 'application/json'); },
    exportCSV:  () => exportTransactionsCSV(),
    clear: () => {
      if(confirm('Delete ALL transactions?\n\nNote: your auto-assignment rules will be KEPT so future imports are still auto-categorised. Only transaction records are deleted.')) {
        TX=[]; save(K.tx,TX); renderTx(); renderDashboard(); toast('🗑️ Transactions cleared — rules preserved'); renderExportPage();
      }
    }
  },
  {
    key: 'rules', label: 'Auto-Assignment Rules', icon: 'bolt',
    count: () => Object.keys(LRULES).length + ' rules',
    exportJSON: () => {
      downloadFile(JSON.stringify({rules: LRULES}, null, 2), exportFilename('rules', 'json'), 'application/json');
      toast('⚡ Rules exported (' + Object.keys(LRULES).length + ' rules)');
    },
    exportCSV: () => {
      var rows = Object.entries(LRULES).map(function(e) {
        var rule = ruleRead(e[0]);
        var cat  = LCATS.find(function(c) { return c.id === (rule ? rule.catId : e[1]); });
        var txCount = TX.filter(function(t) { return ruleKey(t) === e[0]; }).length;
        return '"' + e[0].replace(/"/g,'""') + '",'
          + (cat ? cat.name : (rule ? rule.catId : e[1])) + ','
          + (rule ? (rule.subcat || '') : '') + ','
          + txCount;
      });
      downloadFile(['Merchant,Category,Subcategory,Transactions Matched', ...rows].join('\n'), exportFilename('rules', 'csv'), 'text/csv');
      toast('⚡ Rules CSV exported');
    },
    importJSON: () => {
      var input = document.createElement('input');
      input.type = 'file'; input.accept = '.json';
      input.onchange = function(e) {
        var file = e.target.files[0]; if (!file) return;
        var reader = new FileReader();
        reader.onload = function(ev) {
          try {
            var d = JSON.parse(ev.target.result);
            if (!d.rules) throw new Error('Not a valid rules export');
            if (!confirm('Import ' + Object.keys(d.rules).length + ' rules? Existing rules with the same merchant will be overwritten.')) return;
            Object.assign(LRULES, d.rules);
            save(K.rules, LRULES);
            if (typeof renderRulesList === 'function') renderRulesList();
            renderExportPage();
            toast('⚡ ' + Object.keys(d.rules).length + ' rules imported');
          } catch(err) { toast('Invalid file: ' + err.message); }
        };
        reader.readAsText(file);
      };
      input.click();
    },
    clear: () => {
      if(confirm('Delete all auto-assignment rules? Transactions already categorised will keep their categories.')) {
        LRULES = {}; save(K.rules, LRULES);
        if (typeof renderRulesList === 'function') renderRulesList();
        toast('🗑️ Rules cleared'); renderExportPage();
      }
    }
  },
  {
    key: 'budgets', label: 'Budgets', icon: 'target',
    // Budget limits live in LBUDGETS ({ catId: monthly limit }), the store the Budget page uses.
    count: () => Object.keys(LBUDGETS).length + ' categories',
    exportJSON: () => { downloadFile(JSON.stringify({budgets: LBUDGETS}, null, 2), exportFilename('budgets', 'json'), 'application/json'); },
    exportCSV:  () => {
      const rows = Object.entries(LBUDGETS).map(([id, lim]) => '"' + catNameFor(id).replace(/"/g, '""') + '",' + lim);
      downloadFile(['Category,Monthly Limit', ...rows].join('\n'), exportFilename('budgets', 'csv'), 'text/csv');
      toast('✅ Budgets exported');
    },
    clear: () => {
      if(confirm('Clear all budget limits?')) {
        // Also drop any limits left in the pre-ledger store so nothing lingers.
        LBUDGETS = {}; save(K.lbudgets, LBUDGETS);
        BUDGETS = {};  save(K.budgets, BUDGETS);
        if (typeof renderBVA === 'function') renderBVA();
        toast('🗑️ Budgets cleared'); renderExportPage();
      }
    }
  },
  {
    key: 'goals', label: 'Savings Goals', icon: '⭐',
    count: () => GOALS.length + ' goals',
    exportJSON: () => { downloadFile(JSON.stringify({goals: GOALS}, null, 2), exportFilename('goals', 'json'), 'application/json'); },
    exportCSV:  () => {
      const rows = GOALS.map(g => '"' + g.name + '",' + g.target + ',' + g.saved);
      downloadFile(['Name,Target,Saved', ...rows].join('\n'), exportFilename('goals', 'csv'), 'text/csv');
      toast('✅ Goals exported');
    },
    clear: () => { if(confirm('Delete all savings goals?')) { GOALS=[]; save(K.goals,GOALS); renderGoals(); toast('🗑️ Goals cleared'); renderExportPage(); } }
  },
  {
    key: 'bills', label: 'Bills', icon: 'calendar',
    count: () => BILLS.length + ' bills',
    exportJSON: () => { downloadFile(JSON.stringify({bills: BILLS}, null, 2), exportFilename('bills', 'json'), 'application/json'); },
    exportCSV:  () => {
      const rows = BILLS.map(b => '"'+(b.displayName||'')+'",'+b.amount+','+(b.frequency||'')+','+(b.nextDueDate||'')+','+(b.billType||'')+','+(b.status||''));
      downloadFile(['Name,Amount,Frequency,Next Due,Type,Status', ...rows].join('\n'), exportFilename('bills', 'csv'), 'text/csv');
      toast('✅ Bills exported');
    },
    clear: () => { if(confirm('Delete all bills?')) { BILLS=[]; BILL_ALIASES={}; BILLS_DISMISSED=[]; save(K.bills,BILLS); save(K.billAliases,BILL_ALIASES); save(K.billsDismissed,BILLS_DISMISSED); renderBills(); toast('🗑️ Bills cleared'); renderExportPage(); } }
  },
  {
    key: 'mortgage', label: 'Mortgage', icon: 'home-2',
    count: () => MORTGAGE.balance ? 'Balance: ' + fmt(MORTGAGE.balance) : 'Not set',
    exportJSON: () => { downloadFile(JSON.stringify({mortgage: MORTGAGE}, null, 2), exportFilename('mortgage', 'json'), 'application/json'); },
    exportCSV:  () => {
      const rows = Object.entries(MORTGAGE).map(([k,v]) => k + ',' + v);
      downloadFile(['Field,Value', ...rows].join('\n'), exportFilename('mortgage', 'csv'), 'text/csv');
      toast('✅ Mortgage exported');
    },
    clear: () => { if(confirm('Clear mortgage details?')) { MORTGAGE={}; save(K.mortgage,MORTGAGE); renderMortgage(); toast('🗑️ Mortgage cleared'); renderExportPage(); } }
  },
  {
    key: 'cash', label: 'Cash Tracker', icon: 'building-bank',
    count: () => {
      const mos = [...new Set(Object.values(CT).flatMap(d => Object.keys(d||{})))];
      return mos.length + ' months × 4 accounts';
    },
    exportJSON: () => { downloadFile(JSON.stringify({cashTracker: CT, cashConfig: CTCFG}, null, 2), exportFilename('cash-tracker', 'json'), 'application/json'); },
    exportCSV:  () => ctExportCSV(),
    clear: () => { if(confirm('Clear all cash tracker balances?')) { CT={}; save(K.ct,CT); renderCashTracker(); toast('🗑️ Cash tracker cleared'); renderExportPage(); } }
  },
  {
    key: 'insurance', label: 'Insurance', icon: 'shield-check',
    count: () => INS.length + ' policies',
    exportJSON: () => { downloadFile(JSON.stringify({insurance: INS}, null, 2), exportFilename('insurance', 'json'), 'application/json'); },
    exportCSV:  () => {
      const headers = 'Name,Type,Provider,Premium,Frequency,Annual Cost,Renewal Date,Covered,Sum Insured,Notes';
      const freq = {monthly:12,annual:1,quarterly:4,fortnightly:26};
      const rows = INS.map(p => [
        '"'+p.name+'"', p.type, p.prov||'', p.prem, p.freq,
        ((p.prem||0)*(freq[p.freq]||1)).toFixed(2),
        p.renewal||'', p.covered||'joint', p.cover||0, '"'+(p.notes||'')+'"'
      ].join(','));
      downloadFile([headers, ...rows].join('\n'), exportFilename('insurance', 'csv'), 'text/csv');
      toast('✅ Insurance exported');
    },
    clear: () => { if(confirm('Delete all insurance policies?')) { INS=[]; save(K.ins,INS); renderInsurance(); toast('🗑️ Insurance cleared'); renderExportPage(); } }
  },
  {
    key: 'super', label: 'Superannuation', icon: 'briefcase',
    count: () => {
      const b = SUPER.b?.balance ? 'B: ' + fmt(SUPER.b.balance) : '';
      const s = SUPER.s?.balance ? 'S: ' + fmt(SUPER.s.balance) : '';
      return [b, s].filter(Boolean).join(' · ') || 'Not set';
    },
    exportJSON: () => { downloadFile(JSON.stringify({super: SUPER}, null, 2), exportFilename('super', 'json'), 'application/json'); },
    exportCSV:  () => {
      const rows = ['person,balance,age,retirement_age,salary,sgc_rate,extra_contributions,inflation'];
      ['b','s'].forEach(p => {
        const d = SUPER[p];
        if (!d) return;
        rows.push([p==='b'?getUserName('brenton'):getUserName('shelley'), d.balance||0, d.age||0, d.retire||67, d.salary||0, d.sgc||11.5, d.extra||0, d.inflation||2.5].join(','));
      });
      downloadFile(rows.join('\n'), exportFilename('super', 'csv'), 'text/csv');
      toast('✅ Super exported');
    },
    clear: () => { if(confirm('Clear all super data?')) { SUPER={}; save(K.superdata,SUPER); renderSuperPage(); toast('🗑️ Super cleared'); renderExportPage(); } }
  },
];

function renderExportSectionList() {
  const el = document.getElementById('export-section-list');
  if (!el) return;
  el.innerHTML = EXPORT_SECTIONS.map(s => {
    var importBtn = s.importJSON
      ? '<button class="btn btn-ghost btn-sm" onclick="EXPORT_SECTIONS.find(x=>x.key===\'' + s.key + '\').importJSON()">' + ICON('download') + ' Import</button>'
      : '';
    return '<div class="export-section-row">'
      + '<div class="export-section-info">'
      + '<div class="export-section-name">' + iconTag(s.icon) + ' ' + s.label + '</div>'
      + '<div class="export-section-count">' + s.count() + '</div>'
      + '</div>'
      + '<div class="export-section-btns">'
      + importBtn
      + '<button class="btn btn-ghost btn-sm" onclick="EXPORT_SECTIONS.find(x=>x.key===\'' + s.key + '\').exportCSV()">CSV</button>'
      + '<button class="btn btn-ghost btn-sm" onclick="EXPORT_SECTIONS.find(x=>x.key===\'' + s.key + '\').exportJSON()">JSON</button>'
      + '</div>'
      + '</div>';
  }).join('');
}

function renderExportDataSummary() {
  const sumEl = document.getElementById('export-data-summary');
  const clearEl = document.getElementById('export-clear-btns');
  if (!sumEl || !clearEl) return;

  // Everything a full backup contains
  const totalSize = backupStorageKeys().concat(Object.values(BACKUP_LEGACY)).reduce((s, k) => {
    const v = localStorage.getItem(k);
    return s + (v ? v.length : 0);
  }, 0);
  const sizeKB = (totalSize / 1024).toFixed(1);
  const ipProps = load('kf_ip_properties') || [];

  sumEl.innerHTML = [
    [ICON('credit-card') + ' Transactions',     TX.length + ' records'],
    [ICON('bolt') + ' Auto-Assignment Rules', Object.keys(LRULES).length + ' rules'],
    [ICON('target') + ' Budget Categories', Object.keys(LBUDGETS).length + ' limits'],
    [ICON('star') + ' Savings Goals',     GOALS.length + ' goals'],
    [ICON('calendar') + ' Bills',             BILLS.length + ' bills'],
    [ICON('shield-check') + ' Insurance Policies', INS.length + ' policies'],
    [ICON('building-bank') + ' Cash Tracker Months', [...new Set(Object.values(CT).flatMap(d => Object.keys(d||{})))].length + ' months'],
    [ICON('briefcase') + ' Super Profiles',    ([SUPER.b?.balance, SUPER.s?.balance].filter(Boolean).length) + ' / 2 set'],
    [ICON('building-community') + ' Investment Properties', ipProps.length + (ipProps.length === 1 ? ' property' : ' properties')],
    [ICON('device-floppy') + ' Total Data Size',   sizeKB + ' KB'],
  ].map(([k, v]) => '<div class="dr"><span class="dr-k">' + k + '</span><span class="dr-v">' + v + '</span></div>').join('');

  clearEl.innerHTML = EXPORT_SECTIONS.map(s => {
    return '<button class="btn btn-danger btn-sm" onclick="EXPORT_SECTIONS.find(x=>x.key===\'' + s.key + '\').clear()" title="Clear ' + s.label + '">'
      + iconTag(s.icon) + ' ' + s.label + '</button>';
  }).join('');
}


// ══════════════════════════════════════════════════════════════
