// ══════════════════════════════════════════════════════════════
// UTILS
// ══════════════════════════════════════════════════════════════
const fmt=n=>'$'+Number(n||0).toLocaleString('en-AU',{minimumFractionDigits:2,maximumFractionDigits:2});
// Whole-dollar AUD with a true minus sign (U+2212) — used by the redesigned dashboard tiles.
const fmtWhole=n=>{const neg=Number(n||0)<0;const s='$'+Math.abs(Math.round(Number(n||0))).toLocaleString('en-AU');return neg?'−'+s:s;};
const today=()=>new Date().toISOString().split('T')[0];
const thisMonth=()=>new Date().toISOString().slice(0,7);

// Short relative-time label for epoch-ms timestamps — powers "Last in {…}" on the profile picker.
function relTime(ts){
  if(!ts) return 'never';
  var m=Math.floor((Date.now()-ts)/60000);
  if(m<1) return 'just now';
  if(m<60) return m+'m ago';
  var h=Math.floor(m/60);
  if(h<24) return h+'h ago';
  var d=Math.floor(h/24);
  if(d===1) return 'yesterday';
  if(d<7) return d+'d ago';
  var w=Math.floor(d/7);
  if(w<5) return w+'w ago';
  var mo=Math.floor(d/30);
  if(mo<12) return mo+'mo ago';
  return Math.floor(d/365)+'y ago';
}

// ── DATA HEALTH ───────────────────────────────────────────────
// Single source of truth for backup/import staleness. Consumed by the
// post-unlock welcome screen AND (as a fast-follow) the dashboard's
// notification bell — keep the threshold logic here, don't duplicate it.
// Backup cadence is looser (disaster-recovery net); CSV import is tighter
// (stale imports = stale insights/budgets). Missing key = never done = danger.
function getDataHealth(){
  var TH={ backup:{warn:14,danger:30}, csv:{warn:7,danger:14} };
  function daysSince(iso){
    if(!iso) return null;
    var then=new Date(iso+'T00:00:00');
    if(isNaN(then.getTime())) return null;
    return Math.floor((Date.now()-then.getTime())/86400000);
  }
  function sev(days,t){
    if(days===null) return 'danger';       // never done
    if(days>=t.danger) return 'danger';
    if(days>=t.warn) return 'warn';
    return 'ok';
  }
  var bIso=null,cIso=null;
  try{ bIso=load(K.lastFullBackup); }catch(e){}
  try{ cIso=load(K.lastCsvImport); }catch(e){}
  var bDays=daysSince(bIso), cDays=daysSince(cIso);
  return {
    backup:    { days:bDays, iso:bIso, severity:sev(bDays,TH.backup) },
    csvImport: { days:cDays, iso:cIso, severity:sev(cDays,TH.csv) }
  };
}


// Safe Chart.js wrapper — handles CDN load failure gracefully
function safeChart(canvas, config) {
  if (typeof Chart === 'undefined') {
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#8a8095';
      ctx.font = '13px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Charts unavailable — check internet connection', canvas.width / 2, canvas.height / 2);
    }
    return null;
  }
  try { return new Chart(canvas, config); }
  catch(e) { console.error('Chart error:', e); return null; }
}

// Legacy emoji prefix → toast type, so hundreds of existing toast('✅ ...')
// call sites upgrade to the new icon+color toast with zero call-site edits.
const TOAST_EMOJI_TYPE = {
  '✅':'success','✓':'success','✔':'success','✔️':'success','🎉':'success',
  '⚠':'warn','⚠️':'warn',
  '🗑':'danger','🗑️':'danger','❌':'danger','✕':'danger','🔴':'danger'
};
const TOAST_TYPE_ICON = { success:'circle-check-filled', warn:'alert-triangle', danger:'trash', info:'info-circle' };

function toast(msg,dur=2400,type){
  const t=document.getElementById('toast');
  let text = String(msg==null?'':msg);
  // Strip a leading legacy emoji + following space, inferring type if not given.
  const m = text.match(/^([\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}])️?\s*/u);
  if (m) {
    if (!type) type = TOAST_EMOJI_TYPE[m[1]] || TOAST_EMOJI_TYPE[m[0].trim()] || 'info';
    text = text.slice(m[0].length);
  }
  if (!type) type = 'info';
  const iconKey = TOAST_TYPE_ICON[type] || TOAST_TYPE_ICON.info;
  t.className = 'toast-' + type;
  t.innerHTML = (typeof ICON === 'function' ? ICON(iconKey, {cls:'toast-ico'}) : '') + '<span>' + text + '</span>';
  t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),dur);
}

// ══════════════════════════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════════════════════════
const PAGES=['dashboard','insights','transactions','bills','goals','mortgage','liabilities','cash','insurance','super','assets','bva','categories','smartrules','export','upload','forecast','transfers','equities','borrowing','investment','settings','dashboard-layout','quickstart'];

function go(id){
  var _ut=document.getElementById('undo-toast');if(_ut)_ut.remove();
  PAGES.forEach(p=>{
    var pg=document.getElementById('page-'+p);
    var nv=document.getElementById('n-'+p);
    if(pg) pg.classList.toggle('active',p===id);
    if(nv) nv.classList.toggle('active',p===id);
  });
  // Inject how-to guide once per page (idempotent)
  if (typeof renderHowTo === 'function') {
    var _htEl = document.getElementById('how-to-' + id);
    if (_htEl && !_htEl.dataset.filled) { _htEl.innerHTML = renderHowTo(id); _htEl.dataset.filled = '1'; }
  }
  try{
    if(id==='dashboard')renderDashboard();
    else if(id==='insights'){if(typeof renderInsights==='function')renderInsights();}
    else if(id==='transactions'){renderTx();}
    else if(id==='bills')renderBills();
    else if(id==='goals'){if(typeof renderGoalsPage==='function')renderGoalsPage();}
    else if(id==='mortgage')renderMortgage();
    else if(id==='liabilities'){if(typeof liabRenderPage==='function')liabRenderPage();}
    else if(id==='cash')renderCashTracker();
    else if(id==='insurance')renderInsurance();
    else if(id==='super')renderSuperPage();
    else if(id==='assets')renderAssets();
    else if(id==='export')renderExportPage();
    else if(id==='upload'){if(typeof csvMountOnPage==='function')csvMountOnPage();if(typeof csvReset==='function')csvReset();}
    else if(id==='bva')renderBVA();
    else if(id==='categories')renderCategories();
    else if(id==='smartrules'){if(typeof renderRulesList==='function')renderRulesList();}
    else if(id==='transfers'){if(typeof renderTransfers==='function')renderTransfers();}
    else if(id==='forecast'){if(typeof fc2PullBalance==='function')fc2PullBalance();renderForecast();}
    else if(id==='equities'){if(typeof renderEquitiesPage==='function')renderEquitiesPage();}
    else if(id==='borrowing'){if(typeof renderBorrowing==='function')renderBorrowing();}
    else if(id==='investment'){if(typeof renderInvestment==='function')renderInvestment();}
    else if(id==='settings'){if(typeof renderSettings==='function')renderSettings();}
    else if(id==='dashboard-layout'){if(typeof renderDashboardLayout==='function')renderDashboardLayout();}
    else if(id==='quickstart'){if(typeof renderQuickStart==='function')renderQuickStart();}
  }catch(e){console.warn('render error for page',id,e);}
  window.scrollTo(0,0);
  // Sync mobile tab bar
  var tabs=['dashboard','bva','bills','transactions','cash'];
  tabs.forEach(function(t){
    var btn=document.getElementById('tb-'+t);
    if(btn)btn.classList.toggle('active',t===id);
  });
  var stPages=['dashboard','insights','categories','smartrules','export','mortgage','liabilities','cash','insurance','super','assets','transfers','forecast'];
  var stBtn=document.getElementById('tb-settings');
  if(stBtn)stBtn.classList.toggle('active',stPages.indexOf(id)>=0);
  navSyncActive(id);
}

// Sync top-nav back button, flyout category "active" state, and the notif dot on every route change.
function navSyncActive(id){
  var back=document.getElementById('tb-back');
  if(back) back.classList.toggle('hidden', id==='dashboard');
  document.querySelectorAll('#nav .nav-group').forEach(function(g){
    var cat=g.querySelector('.nav-cat');
    if(cat) cat.classList.toggle('cat-active', !!g.querySelector('.nav-fly-item.active'));
  });
  // Mirror active state onto pinned shortcuts
  document.querySelectorAll('#nav-pinned .nav-item[data-page]').forEach(function(a){
    a.classList.toggle('active', a.getAttribute('data-page')===id);
  });
  updateNotifDot();
  renderTopbarGreeting();
}

// Greeting + date shown in the top bar (item 4). Global — reflects the active profile.
function renderTopbarGreeting(){
  var hiEl=document.getElementById('tb-greeting');
  var dtEl=document.getElementById('tb-greetdate');
  if(!hiEl&&!dtEl) return;
  var now=new Date(), hr=now.getHours();
  var greet=hr<12?'Good morning':hr<18?'Good afternoon':'Good evening';
  var name='';
  if(typeof activeProfile!=='undefined'){
    name=activeProfile==='joint'?'':(typeof getUserName==='function'?getUserName(activeProfile):'');
  }
  if(hiEl) hiEl.textContent=name?(greet+', '+name):greet;
  if(dtEl) dtEl.textContent=now.toLocaleDateString('en-AU',{weekday:'short',day:'numeric',month:'short',year:'numeric'});
}


// ══════════════════════════════════════════════════════════════
// NAV — Quick Start visibility + user footer
// ══════════════════════════════════════════════════════════════
function navSyncQuickStart() {
  var data = null;
  try { data = load(K.quickstart); } catch(e) {}
  var done = data && data.completed;
  var coreItem     = document.getElementById('n-quickstart');
  var controlsItem = document.getElementById('qs-nav-controls');
  if (coreItem)     coreItem.style.display     = done ? 'none' : '';
  if (controlsItem) controlsItem.style.display = done ? ''     : 'none';
}

// Populates the nav rail's user footer (avatar initials + name), driven by the active profile.
function renderNavUser() {
  var avs  = document.getElementById('nav-avatars');
  var uname = document.getElementById('nav-username');
  if (!avs || !uname) return;
  avs.innerHTML = '';
  var p1name = (typeof getUserName === 'function' ? getUserName('brenton') : 'Profile 1') || 'Profile 1';
  var p2name = (typeof getUserName === 'function' ? getUserName('shelley') : 'Profile 2') || 'Profile 2';
  function initial(n) { return (n || '?').trim().charAt(0).toUpperCase() || '?'; }
  function makeAv(cls, letter) {
    var d = document.createElement('div');
    d.className = 'kd-av ' + cls;
    d.textContent = letter;
    return d;
  }
  if (activeProfile === 'joint') {
    avs.appendChild(makeAv('p1', initial(p1name)));
    avs.appendChild(makeAv('p2', initial(p2name)));
    uname.textContent = p1name + ' & ' + p2name;
  } else {
    var name = activeProfile === 'shelley' ? p2name : p1name;
    avs.appendChild(makeAv('p1', initial(name)));
    uname.textContent = name;
  }
}

// ══════════════════════════════════════════════════════════════
// NAV FLYOUT SUBMENUS (Financial Planning · App Controls)
// Category icons in the rail; sub-items appear as a hover flyout that
// extends out from the rail. Positioned with JS (fixed) so it escapes
// the rail's overflow clipping and clamps to the viewport.
// ══════════════════════════════════════════════════════════════
var _navFlyTimer = null;
function navFlyShow(group) {
  clearTimeout(_navFlyTimer);
  document.querySelectorAll('.nav-group.fly-open').forEach(function(g){ if (g !== group) g.classList.remove('fly-open'); });
  var fly = group.querySelector('.nav-flyout');
  var cat = group.querySelector('.nav-cat');
  if (!fly || !cat) return;
  var r = cat.getBoundingClientRect();
  var railW = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav-w-open')) || 200;
  fly.style.left = railW + 'px';
  var h = fly.offsetHeight || 260;
  var top = Math.max(8, r.top);
  if (top + h > window.innerHeight - 8) top = Math.max(8, window.innerHeight - 8 - h);
  fly.style.top = top + 'px';
  group.classList.add('fly-open');
  cat.setAttribute('aria-expanded', 'true');
}
function navFlyHideSoon(group) {
  clearTimeout(_navFlyTimer);
  _navFlyTimer = setTimeout(function(){
    group.classList.remove('fly-open');
    var cat = group.querySelector('.nav-cat');
    if (cat) cat.setAttribute('aria-expanded', 'false');
  }, 160);
}
function initNavFlyouts() {
  document.querySelectorAll('#nav .nav-group').forEach(function(g){
    g.addEventListener('mouseenter', function(){ navFlyShow(g); });
    g.addEventListener('mouseleave', function(){ navFlyHideSoon(g); });
    var cat = g.querySelector('.nav-cat');
    if (cat) {
      cat.addEventListener('focus', function(){ navFlyShow(g); });
      cat.addEventListener('keydown', function(e){
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navFlyShow(g); var first = g.querySelector('.nav-fly-item'); if (first) first.focus(); }
        else if (e.key === 'Escape') { g.classList.remove('fly-open'); }
      });
    }
  });
}

// ══════════════════════════════════════════════════════════════
// GRAPHS DEEP-LINKS — Income / Expenses scroll to a section of the
// Graphs (insights) page.
// ══════════════════════════════════════════════════════════════
function goInsights(section){
  go('insights');
  var targetId = section==='income' ? 'ins-income-section'
               : section==='expenses' ? 'ins-expense-section' : null;
  if (!targetId) return;
  setTimeout(function(){
    var el = document.getElementById(targetId);
    if (el) el.scrollIntoView({behavior:'smooth', block:'start'});
  }, 120);
}

// ══════════════════════════════════════════════════════════════
// PINNED NAV SHORTCUTS — pin any page to a "Pinned" row atop the rail.
// Stored as an ordered array of page keys in localStorage.
// ══════════════════════════════════════════════════════════════
var PIN_KEY = 'kf_pinned_pages';
function getPins(){
  try { var a = JSON.parse(localStorage.getItem(PIN_KEY) || '[]'); return Array.isArray(a) ? a : []; }
  catch(e){ return []; }
}
function setPins(arr){
  try { localStorage.setItem(PIN_KEY, JSON.stringify(arr)); } catch(e){}
}
function isPinned(page){ return getPins().indexOf(page) !== -1; }
function togglePin(ev, page){
  if (ev){ ev.stopPropagation(); ev.preventDefault(); }
  var pins = getPins();
  var i = pins.indexOf(page);
  if (i === -1) pins.push(page); else pins.splice(i,1);
  setPins(pins);
  renderPinned();
  // Refresh the source items' pin-button state
  document.querySelectorAll('#nav .nav-pin[data-page]').forEach(function(b){
    b.classList.toggle('pinned', isPinned(b.getAttribute('data-page')));
    b.title = isPinned(b.getAttribute('data-page')) ? 'Unpin from Core Features' : 'Pin to Core Features';
  });
}
// Map a nav element id (n-<page>) to its page key; only real pages are pinnable.
function _navPageKey(el){
  var id = el.id || '';
  if (id.indexOf('n-') !== 0) return null;
  var key = id.slice(2);
  return (PAGES.indexOf(key) !== -1) ? key : null;
}
function renderPinned(){
  var host = document.getElementById('nav-pinned');
  var wrap = document.getElementById('nav-pinned-wrap');
  if (!host || !wrap) return;
  var pins = getPins();
  host.innerHTML = '';
  pins.forEach(function(page){
    var src = document.getElementById('n-'+page);
    if (!src) return;
    var iconEl = src.querySelector('.ni');
    var icon = iconEl ? iconEl.innerHTML : '';
    var lblEl = src.querySelector('.nav-lbl') || src.querySelector('span:not(.ni)');
    var label = lblEl ? lblEl.textContent : page;
    var a = document.createElement('a');
    a.className = 'nav-item';
    a.setAttribute('data-page', page);
    a.setAttribute('onclick', "go('"+page+"')");
    a.innerHTML = '<span class="ni">'+icon+'</span><span class="nav-lbl">'+_esc(label)+'</span>'
      + '<button class="nav-pin pinned" data-page="'+page+'" title="Unpin from Core Features" '
      + 'aria-label="Unpin" onclick="togglePin(event,\''+page+'\')"><i class="ti ti-pin-filled"></i></button>';
    host.appendChild(a);
  });
  wrap.style.display = pins.length ? '' : 'none';
  navSyncActive(_currentPage());
}
function _currentPage(){
  var el = document.querySelector('#nav .nav-item.active[id], #nav .nav-fly-item.active[id]');
  return el ? (el.id||'').slice(2) : 'dashboard';
}
// Inject a pin toggle into every pinnable nav item / flyout item.
function initNavPins(){
  document.querySelectorAll('#nav .nav-item[id^="n-"], #nav .nav-fly-item[id^="n-"]').forEach(function(el){
    if (el.classList.contains('nav-cat')) return;
    if (el.querySelector('.nav-pin')) return;      // already injected
    var page = _navPageKey(el);
    if (!page) return;                              // only real pages are pinnable
    var btn = document.createElement('button');
    btn.className = 'nav-pin' + (isPinned(page) ? ' pinned' : '');
    btn.setAttribute('data-page', page);
    btn.setAttribute('aria-label', 'Pin');
    btn.title = isPinned(page) ? 'Unpin from Core Features' : 'Pin to Core Features';
    btn.setAttribute('onclick', "togglePin(event,'"+page+"')");
    btn.innerHTML = '<i class="ti ti-pin"></i>';
    el.appendChild(btn);
  });
  renderPinned();
}

// ══════════════════════════════════════════════════════════════
// GLOBAL SEARCH MODAL (top nav) — searches transactions from any page
// ══════════════════════════════════════════════════════════════
function _esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
function openSearchModal(){
  var m = document.getElementById('search-modal'); if (!m) return;
  m.classList.add('open');
  var inp = document.getElementById('search-modal-input');
  if (inp) { inp.value=''; setTimeout(function(){ try{ inp.focus(); }catch(e){} }, 30); }
  runGlobalSearch();
}
function closeSearchModal(){
  var m = document.getElementById('search-modal'); if (m) m.classList.remove('open');
}
function runGlobalSearch(){
  var inp = document.getElementById('search-modal-input');
  var host = document.getElementById('search-modal-results');
  if (!host) return;
  var q = ((inp && inp.value) || '').trim().toLowerCase();
  var txns = (typeof activeTX === 'function') ? activeTX().slice() : [];
  txns.sort(function(a,b){ return (b.date||'').localeCompare(a.date||''); });
  var list = q ? txns.filter(function(t){
    var hay = ((t.merchant||'')+' '+(t.description||t.desc||'')+' '+(t.category||'')+' '+(t.amount||'')).toLowerCase();
    return hay.indexOf(q) >= 0;
  }) : txns;
  if (!list.length) {
    host.innerHTML = '<div class="search-empty">' + (q ? 'No transactions match “' + _esc(q) + '”.' : 'Start typing to search your transactions.') + '</div>';
    return;
  }
  host.innerHTML = list.slice(0,30).map(function(t){
    var pos = t.type === 'income';
    var nm = t.merchant || t.description || t.desc || t.category || 'Transaction';
    var amt = (pos ? '+' : '−') + fmt(Math.abs(Number(t.amount)||0)).replace('−','').replace('-','');
    var col = pos ? 'var(--success)' : 'var(--text)';
    return '<div class="search-res" onclick="searchResultGo()">'
      + '<div class="search-res-main"><div class="search-res-name">' + _esc(nm) + '</div>'
      + '<div class="search-res-sub">' + _esc(t.date||'') + ' · ' + _esc(t.category||'—') + '</div></div>'
      + '<div class="search-res-amt" style="color:' + col + '">' + amt + '</div></div>';
  }).join('');
}
function searchResultGo(){ closeSearchModal(); if (typeof go === 'function') go('transactions'); }

// ══════════════════════════════════════════════════════════════
// NOTIFICATION DOT (top nav bell) — reflects action cards + nudges
// ══════════════════════════════════════════════════════════════
function updateNotifDot(){
  var dot = document.getElementById('tb-ndot'); if (!dot) return;
  var n = 0;
  try { if (typeof generateActionCards === 'function') n += (generateActionCards()||[]).length; } catch(e){}
  try { if (typeof generateNudges === 'function') n += (generateNudges()||[]).length; } catch(e){}
  dot.style.display = n > 0 ? 'block' : 'none';
}

// ══════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════
function isTransfer(t){return TRANSFERS.some(tr=>tr.txIdA===t.id||tr.txIdB===t.id||tr.debitTxId===t.id||tr.creditTxId===t.id);}
function isTransferTx(txId){return TRANSFERS.some(function(p){return p.debitTxId===txId||p.creditTxId===txId||p.txIdA===txId||p.txIdB===txId;});}
function showUndoToast(message,durationMs,onUndo){
  var existing=document.getElementById('undo-toast');
  if(existing)existing.remove();
  var el=document.createElement('div');
  el.id='undo-toast';
  el.setAttribute('role','status');
  el.setAttribute('aria-live','polite');
  el.style.cssText='position:fixed;bottom:24px;left:50%;transform:translateX(-50%);'
    +'background:var(--card2);border:1px solid var(--border);border-radius:10px;'
    +'padding:12px 18px;display:flex;align-items:center;gap:14px;'
    +'font-size:.82rem;font-family:var(--font-body);color:var(--text);'
    +'box-shadow:0 8px 32px rgba(0,0,0,.45);z-index:9999;white-space:nowrap;';
  var msg=document.createElement('span');
  msg.textContent=message;
  var btn=document.createElement('button');
  btn.textContent='Undo';
  btn.style.cssText='background:var(--primary);color:#fff;border:none;border-radius:999px;'
    +'padding:6px 14px;font-size:.78rem;font-weight:600;cursor:pointer;min-height:32px;'
    +'font-family:var(--font-body);';
  btn.onclick=function(){el.remove();clearTimeout(timer);onUndo();};
  el.appendChild(msg);
  el.appendChild(btn);
  document.body.appendChild(el);
  var timer=setTimeout(function(){if(el.parentNode)el.remove();},durationMs);
  return timer;
}
function activeTX(){
  const base=TX.filter(t=>!isTransfer(t));
  // Joint view shows all transactions from both profiles
  if(activeProfile==='joint')return base;
  return base.filter(t=>!t.person||t.person===activeProfile||t.person==='joint');
}
function getMonthInc(ym=thisMonth()){return activeTX().filter(t=>t.type==='income'&&t.date.startsWith(ym)).reduce((s,t)=>s+Number(t.amount),0);}
function getMonthExp(ym=thisMonth()){return activeTX().filter(t=>t.type==='expense'&&t.date.startsWith(ym)).reduce((s,t)=>s+Number(t.amount),0);}
function getCatSpend(cat,ym=thisMonth()){return activeTX().filter(t=>t.type==='expense'&&t.category===cat&&t.date.startsWith(ym)).reduce((s,t)=>s+Number(t.amount),0);}
function getTotalBal(){return activeTX().reduce((s,t)=>t.type==='income'?s+Number(t.amount):s-Number(t.amount),0);}

// ══════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════
// ── DASHBOARD STATE ───────────────────────────────────────────

function goMob(pageId) {
  closeMobMenu();
  go(pageId);
  // Update tab bar active state
  var tabs = ['dashboard','bills','transactions','cash'];
  tabs.forEach(function(t) {
    var btn = document.getElementById('tb-' + t);
    if (btn) btn.classList.toggle('active', t === pageId);
  });
  // Settings btn active if settings-related page
  var settingsPages = ['categories','export','mortgage','cash','insurance','super','assets','transfers','forecast'];
  var settBtn = document.getElementById('tb-settings');
  if (settBtn) settBtn.classList.toggle('active', settingsPages.indexOf(pageId) >= 0);
}

function openMobMenu() {
  var overlay = document.getElementById('mob-menu-overlay');
  var menu    = document.getElementById('mob-menu');
  if (overlay) overlay.style.display = 'block';
  if (menu) {
    menu.style.display = 'block';
    setTimeout(function() { menu.classList.add('open'); }, 10);
  }
}

function closeMobMenu() {
  var overlay = document.getElementById('mob-menu-overlay');
  var menu    = document.getElementById('mob-menu');
  if (menu) {
    menu.classList.remove('open');
    setTimeout(function() { if (!menu.classList.contains('open')) menu.style.display = 'none'; }, 310);
  }
  if (overlay) overlay.style.display = 'none';
}



// ── USER & ACCOUNT CONFIG ─────────────────────────────────────
function getUserName(profileId) {
  if (profileId === 'brenton') return USER_CONFIG.p1name || 'Profile 1';
  if (profileId === 'shelley') return USER_CONFIG.p2name || 'Profile 2';
  return profileId;
}
function getUserIcon(profileId) {
  if (profileId === 'brenton') return USER_CONFIG.p1icon || '👤';
  if (profileId === 'shelley') return USER_CONFIG.p2icon || '👤';
  return '👤';
}
function getAccountName(acctId) {
  // Check ACCOUNTS first (covers custom + renamed core accounts)
  if (typeof ACCOUNTS !== 'undefined' && ACCOUNTS) {
    var acct = ACCOUNTS.find(function(a){ return a.id === acctId; });
    if (acct && acct.name) return acct.name;
  }
  var defaults = {offset:'Offset Account',home:'Home Transaction',sav1:'Savings Account 1',sav2:'Savings Account 2'};
  return USER_CONFIG['acct_' + acctId] || CTCFG[acctId + 'Lbl'] || defaults[acctId] || acctId;
}
function saveUserConfig() {
  try { localStorage.setItem('cff_userconfig', JSON.stringify(USER_CONFIG)); } catch(e) {}
}
function applyUserConfig() {
  // Profile buttons in login
  var pb1 = document.getElementById('pb-brenton');
  var pb2 = document.getElementById('pb-shelley');
  if (pb1) {
    var pi1 = pb1.querySelector('.pi');
    var pn1 = pb1.querySelector('.pn');
    if (pi1) pi1.textContent = getUserIcon('brenton');
    if (pn1) pn1.textContent = getUserName('brenton');
  }
  if (pb2) {
    var pi2 = pb2.querySelector('.pi');
    var pn2 = pb2.querySelector('.pn');
    if (pi2) pi2.textContent = getUserIcon('shelley');
    if (pn2) pn2.textContent = getUserName('shelley');
  }
  // Topbar + mob-user (if logged in)
  if (loggedIn) {
    var tu = document.getElementById('topbar-user');
    if (tu) tu.textContent = getUserName(activeProfile);
    var mu = document.getElementById('mob-user');
    if (mu) mu.textContent = getUserIcon(activeProfile) + ' ' + getUserName(activeProfile);
  }
  // Update account labels in CT_ACCTS live labels
  CT_ACCTS.forEach(function(a) {
    var customName = getAccountName(a.id);
    // Update CTCFG so ctLabel() picks it up
    if (a.id === 'offset') CTCFG.offsetLbl = USER_CONFIG.acct_offset || a.def;
    if (a.id === 'home')   CTCFG.homeLbl   = USER_CONFIG.acct_home   || a.def;
    if (a.id === 'sav1')   CTCFG.sav1Lbl   = USER_CONFIG.acct_sav1   || a.def;
    if (a.id === 'sav2')   CTCFG.sav2Lbl   = USER_CONFIG.acct_sav2   || a.def;
  });
  try { save(K.ctcfg, CTCFG); } catch(e) {}
  // Update [data-profile-label] elements
  document.querySelectorAll('[data-profile-label]').forEach(function(el) {
    var p = el.getAttribute('data-profile-label');
    var text = el.textContent;
    // Only carry a suffix if the text contains ' — ' (e.g. "Profile 1 — Tax Position")
    // If the text is just a plain name with no dash, suffix is empty.
    var replaced = text.replace(/^.*? — /, '');
    var suffix = (replaced !== text) ? (' — ' + replaced) : '';
    el.textContent = getUserName(p) + suffix;
  });
  // Update <option data-profile-name> elements (person/account selects)
  document.querySelectorAll('option[data-profile-name]').forEach(function(opt) {
    var p = opt.getAttribute('data-profile-name');
    var suffix = opt.getAttribute('data-label-suffix') || '';
    opt.textContent = getUserName(p) + suffix;
  });
  // Show/hide profile 2 and joint buttons based on wizard config
  if (typeof applyLoginProfileVis === 'function') applyLoginProfileVis();
}
function openUserSettings() {
  var panel = document.getElementById('user-settings-panel');
  if (!panel) return;
  // Pre-fill with current values
  var fields = {
    'usc-p1name': getUserName('brenton'),
    'usc-p1icon': getUserIcon('brenton'),
    'usc-p2name': getUserName('shelley'),
    'usc-p2icon': getUserIcon('shelley'),
    'usc-acct-offset': getAccountName('offset'),
    'usc-acct-home':   getAccountName('home'),
    'usc-acct-sav1':   getAccountName('sav1'),
    'usc-acct-sav2':   getAccountName('sav2'),
  };
  Object.keys(fields).forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = fields[id];
  });
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}
function saveUserSettings() {
  var g = function(id) { return (document.getElementById(id) || {}).value || ''; };
  USER_CONFIG.p1name = g('usc-p1name').trim() || 'Profile 1';
  USER_CONFIG.p1icon = g('usc-p1icon').trim() || '👤';
  USER_CONFIG.p2name = g('usc-p2name').trim() || 'Profile 2';
  USER_CONFIG.p2icon = g('usc-p2icon').trim() || '👤';
  USER_CONFIG.acct_offset = g('usc-acct-offset').trim() || 'Offset Account';
  USER_CONFIG.acct_home   = g('usc-acct-home').trim()   || 'Home Transaction';
  USER_CONFIG.acct_sav1   = g('usc-acct-sav1').trim()   || 'Savings Account 1';
  USER_CONFIG.acct_sav2   = g('usc-acct-sav2').trim()   || 'Savings Account 2';
  saveUserConfig();
  applyUserConfig();
  // Re-render any live views
  if (loggedIn) {
    if (typeof renderCashTracker === 'function') renderCashTracker();
    if (typeof renderDashboard   === 'function') renderDashboard();
    if (typeof renderInsurance   === 'function') renderInsurance();
    if (typeof renderSuperPage   === 'function') renderSuperPage();
  }
  var panel = document.getElementById('user-settings-panel');
  if (panel) panel.style.display = 'none';
  toast('Settings saved');
}

// ── APP NAME ─────────────────────────────────────────────────
var APP_NAME_KEY = 'cff_app_name';
var APP_SUB_KEY  = 'cff_app_sub';

function getAppName() {
  try { return localStorage.getItem(APP_NAME_KEY) || 'Kelda Finance'; } catch(e) { return 'Kelda Finance'; }
}
function getAppSub() {
  try { return localStorage.getItem(APP_SUB_KEY) || 'Family Finance Tracker · AUD'; } catch(e) { return 'Family Finance Tracker · AUD'; }
}
function setAppName(name, sub) {
  try {
    localStorage.setItem(APP_NAME_KEY, name || 'Kelda Finance');
    localStorage.setItem(APP_SUB_KEY,  sub  || 'Family Finance Tracker · AUD');
  } catch(e) {}
  applyAppName();
}
function applyAppName() {
  var name = getAppName();
  var sub  = getAppSub();
  // Update all app name display elements
  document.querySelectorAll('[data-app-name]').forEach(function(el) { el.textContent = name; });
  document.querySelectorAll('[data-app-sub]').forEach(function(el)  { el.textContent = sub;  });
  document.title = name;
}



function openUserSettingsDesktop() {
  var panel = document.getElementById('user-settings-desktop');
  if (!panel) return;
  var fill = function(deskId, val) { var e=document.getElementById(deskId); if(e) e.value=val; };
  fill('usc-p1icon-d', getUserIcon('brenton'));
  fill('usc-p1name-d', getUserName('brenton'));
  fill('usc-p2icon-d', getUserIcon('shelley'));
  fill('usc-p2name-d', getUserName('shelley'));
  fill('usc-acct-offset-d', getAccountName('offset'));
  fill('usc-acct-home-d',   getAccountName('home'));
  fill('usc-acct-sav1-d',   getAccountName('sav1'));
  fill('usc-acct-sav2-d',   getAccountName('sav2'));
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}
function saveDesktopUserSettings() {
  var g = function(id) { return (document.getElementById(id)||{}).value||''; };
  USER_CONFIG.p1icon = g('usc-p1icon-d').trim() || '👤';
  USER_CONFIG.p1name = g('usc-p1name-d').trim() || 'Profile 1';
  USER_CONFIG.p2icon = g('usc-p2icon-d').trim() || '👤';
  USER_CONFIG.p2name = g('usc-p2name-d').trim() || 'Profile 2';
  USER_CONFIG.acct_offset = g('usc-acct-offset-d').trim() || 'Offset Account';
  USER_CONFIG.acct_home   = g('usc-acct-home-d').trim()   || 'Home Transaction';
  USER_CONFIG.acct_sav1   = g('usc-acct-sav1-d').trim()   || 'Savings Account 1';
  USER_CONFIG.acct_sav2   = g('usc-acct-sav2-d').trim()   || 'Savings Account 2';
  saveUserConfig();
  applyUserConfig();
  if (loggedIn) {
    if (typeof renderCashTracker==='function') renderCashTracker();
    if (typeof renderDashboard==='function') renderDashboard();
  }
  document.getElementById('user-settings-desktop').style.display='none';
  toast('Settings saved');
}

function openDesktopRenameApp() {
  var panel = document.getElementById('rename-app-panel-desktop');
  if (!panel) return;
  document.getElementById('rename-app-name-d').value = getAppName();
  document.getElementById('rename-app-sub-d').value  = getAppSub();
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}
function saveDesktopAppName() {
  var name = (document.getElementById('rename-app-name-d')?.value||'').trim()||'Kelda Finance';
  var sub  = (document.getElementById('rename-app-sub-d')?.value||'').trim()||'Family Finance Tracker · AUD';
  setAppName(name, sub);
  document.getElementById('rename-app-panel-desktop').style.display='none';
  toast('App renamed to "'+name+'"');
}

function openRenameApp() {
  var name = getAppName();
  var sub  = getAppSub();
  var nameEl = document.getElementById('rename-app-name');
  var subEl  = document.getElementById('rename-app-sub');
  if (nameEl) nameEl.value = name;
  if (subEl)  subEl.value  = sub;
  var panel = document.getElementById('rename-app-panel');
  if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

function saveAppName() {
  var name = (document.getElementById('rename-app-name')?.value || '').trim() || 'Kelda Finance';
  var sub  = (document.getElementById('rename-app-sub')?.value  || '').trim() || 'Family Finance Tracker · AUD';
  setAppName(name, sub);
  var panel = document.getElementById('rename-app-panel');
  if (panel) panel.style.display = 'none';
  toast('App name updated to "' + name + '"');
}


// ── HOW-TO GUIDE ─────────────────────────────────────────────
var _HOW_TO = {
  transactions: { title:'Recording Transactions', items:[
    {icon:'plus', h:'Adding a transaction', b:'Fill in the date, type (income or expense), name, amount and category then tap Add. The name field auto-suggests a category based on the merchant name.'},
    {icon:'folder', h:'Categories & subcategories', b:'Assign every transaction a category so the Budget vs Actuals and Insights pages can analyse your spending accurately.'},
    {icon:'search', h:'Filtering & searching', b:'Use the month filter and search box to narrow down transactions. Bulk-select rows to reassign categories in one go.'},
    {icon:'upload', h:'Importing from CSV', b:'Use the Export tab to import a bank CSV. Columns are mapped to the app fields and auto-categorisation rules are applied.'}
  ]},
  bills: { title:'Managing Bills', items:[
    {icon:'plus', h:'Adding a bill', b:'Enter the name, amount, next due date and frequency. The due day-of-month is extracted from the date you pick and used for recurring tracking.'},
    {icon:'check', h:'Marking paid', b:'Tap "Paid" on a bill once you\'ve paid it. This clears it from upcoming alerts on the Dashboard. Reset at month start with "Undo".'},
    {icon:'bulb', h:'Auto-detect', b:'The app scans your transactions for recurring insurance, utility, phone and childcare payments and suggests them as bills to add.'},
    {icon:'calendar', h:'Frequency', b:'Set the correct frequency (monthly, fortnightly, yearly etc.) so the summary totals correctly reflect your actual commitments.'}
  ]},
  goals: { title:'Savings Goals', items:[
    {icon:'target', h:'Creating a goal', b:'Enter a name, target amount and optional target date. Tap an emoji icon from the preset row or type your own.'},
    {icon:'link', h:'Linking to Cash Tracker', b:'Link a goal to one of your savings accounts — the goal progress will automatically reflect the live balance from your Cash Tracker.'},
    {icon:'pencil', h:'Editing a goal', b:'Tap "Edit" on any goal card to update the name, icon, target amount, current amount, date or linked account.'},
    {icon:'chart-bar', h:'Projection', b:'The goal card shows an estimated completion date based on the gap between current and target, or the target date if you set one.'}
  ]},
  bva: { title:'Budget vs Actuals', items:[
    {icon:'coin', h:'Setting budgets', b:'Enter a monthly limit for each spending category. Budgets persist month to month — you only need to set them once.'},
    {icon:'chart-bar', h:'Reading the report', b:'Green = under budget. Amber = 70–99% used. Red = exceeded. The "Used" column shows actual spending from your transactions.'},
    {icon:'calendar', h:'Month navigation', b:'Use the arrows to review past months. The budget limits are fixed; actual spending is pulled from your transaction history.'},
    {icon:'alert-triangle', h:'Budget alerts', b:'Alerts appear on the Dashboard for any category at 70%+ of its limit. Smart Insights on the dashboard also reference the top overrun.'}
  ]},
  forecast: { title:'Cash Flow Forecast', items:[
    {icon:'calendar', h:'How it works', b:'Each of the next 12 months is based on the same month last year, from the income and spending in your transactions. Months with no data a year ago use your average monthly net, marked "avg proxy".'},
    {icon:'refresh', h:'Starting balance', b:'Each time you open this tab, your latest combined Cash Tracker balance becomes the starting balance. Sync Balance does the same and shows the amount it used.'},
    {icon:'pencil', h:'Adjustments', b:'Add known changes, like a bonus or a holiday, with + Add Adjustment: One-off for a single month, or Recurring monthly, quarterly or annually. Income is positive, spending negative. Tap any month to see its breakdown.'},
    {icon:'trending-up', h:'Cumulative view', b:'Switch from Bar Chart to Cumulative to see your starting balance plus each month\'s net as a running total. It needs a starting balance, and the line turns red below zero.'}
  ]},
  assets: { title:'Net Assets', items:[
    {icon:'building-bank', h:'What is shown', b:'Net Assets = Gross Assets (bank + super + property + equities) minus Total Liabilities (mortgage + other debts). This is your true financial position.'},
    {icon:'home-2', h:'Property value', b:'The full home value is included in gross assets. The mortgage balance sits in liabilities — so net property equity flows through correctly.'},
    {icon:'chart-bar', h:'Donuts', b:'The Assets Breakdown donut shows allocation by class. The Liabilities donut shows debt breakdown. Tap any segment to navigate to that page.'},
    {icon:'trending-up', h:'Debt ratio', b:'Liabilities ÷ Gross Assets. Below 30% is strong. Above 60% is high. Use this alongside the Health Score for a full picture.'}
  ]},
  super: { title:'Superannuation Projections', items:[
    {icon:'briefcase', h:'Entering your details', b:'Enter your current balance, age, retirement age and salary. The SGC rate defaults to 11.5% (current legal minimum). Add extra contributions if you salary sacrifice.'},
    {icon:'trending-up', h:'Growth scenarios', b:'Choose a scenario (Conservative / Balanced / Growth / High Growth) based on ASFA standard return assumptions. The return rate and fees fields auto-fill — you can override them.'},
    {icon:'bulb', h:'Inflation adjustment', b:'The projection shows both nominal (raw) and real (inflation-adjusted) values. The real figure reflects actual purchasing power at retirement.'},
    {icon:'alert-triangle', h:'Estimates only', b:'These projections are illustrative only and not financial advice. Speak with a licensed financial adviser for personalised super planning.'}
  ]},
  insights: { title:'Insights & Analytics', items:[
    {icon:'calendar', h:'Period navigation', b:'Switch between Monthly and Yearly views using the toggle. Navigate with the arrows or tap "Today" to return to the current period.'},
    {icon:'trending-up', h:'Net worth chart', b:'Shows your recorded net worth over time from the Cash Tracker history. Each point is a monthly snapshot — update your Cash Tracker regularly for accurate trend data.'},
    {icon:'cash-off', h:'Income flow (Sankey)', b:'The Sankey diagram shows how your income splits across spending categories. Hover or tap any flow to see the exact amount and percentage.'},
    {icon:'search', h:'Category drilldown', b:'The category and subcategory charts let you drill into exactly where money is going. Use the subcategory chart to find high-spend areas.'}
  ]},
  transfers: { title:'Transfers & Reconciliation', items:[
    {icon:'refresh', h:'What are transfers', b:'Transfers are movements between your own accounts (e.g. offset → savings). They are excluded from income/expense analysis to avoid double-counting.'},
    {icon:'circle-check-filled', h:'Auto-detected pairs', b:'The app auto-matches same-amount income/expense pairs on the same or adjacent days. Confirm to tag them as transfers, or Dismiss to keep them in analysis.'},
    {icon:'link', h:'Manual linking', b:'If auto-detection missed a pair, use the manual link panel. Search for the two transactions, select both checkboxes, then tap "Link Selected".'},
    {icon:'arrow-back-up', h:'Unlinking', b:'Confirmed transfers can be unlinked at any time. Both transactions return to the "Other" category and reappear in your analysis.'}
  ]},
  quickstart: { title:'Quick Start Guide', items:[
    {icon:'books', h:'About this guide', b:'The Quick Start Guide walks you through the 7 essential steps to set up and master Kelda Finance in your own way.'},
    {icon:'check', h:'Track your progress', b:'Check off each step as you complete it. The app auto-completes steps as you take actions (add a transaction, create a rule, etc.).'},
    {icon:'target', h:'Follow your path', b:'Each step has a dedicated "Go" button that takes you directly to that feature. Work through them in order or jump to what you need.'},
    {icon:'confetti', h:'Celebrate completion', b:'When you finish all 7 steps, you\'ll see a celebration animation and a badge on your Dashboard. You\'re ready to manage your finances!'}
  ]},
  categories: { title:'Categories & Rules', items:[
    {icon:'folder', h:'Default categories', b:'The app comes with 16 expense categories and 83 subcategories spanning household, transport, health, entertainment and more. Customise as needed.'},
    {icon:'pencil', h:'Custom categories', b:'Create custom categories to match your spending. Edit name, icon, and colour. Delete unused categories anytime (archived transactions keep their assignment).'},
    {icon:'bolt', h:'Smart Rules', b:'Auto-categorisation rules live in their own Smart Rules tab. Head there to create Exact or Contains rules — e.g. "contains Woolies" → Groceries.'},
    {icon:'refresh', h:'Bulk recategorise', b:'Select multiple transactions in the list and reassign them to a new category in bulk. Useful for catching past transactions your rules didn\'t catch.'}
  ]},
  smartrules: { title:'Smart Rules', items:[
    {icon:'bolt', h:'Confirmed Rules', b:'Rules you create or confirm manually. These have the highest priority and are always applied first. Use Exact match for specific merchants, Contains for chains like "Coles" that add location suffixes.'},
    {icon:'robot', h:'Auto-Learned patterns', b:'Every time you manually categorise a transaction, the app learns that merchant → category mapping. Once a merchant is seen 3+ times it gains high confidence. Promote any learned pattern to a confirmed rule with one click.'},
    {icon:'= vs ◡', h:'Exact vs Contains matching', b:'Exact match: the cleaned merchant name must match precisely (case-insensitive). Contains match: the transaction name only needs to include your keyword — ideal for "Starbucks" matching "Starbucks Sydney CBD".'},
    {icon:'123', h:'Rule priority order', b:'Transfers are detected first, then your Confirmed Rules, then high-confidence Learned patterns, then the built-in keyword database, then low-confidence learned patterns, and finally an amount signal as a last resort.'}
  ]},
  equities: { title:'Equities & Holdings', items:[
    {icon:'trending-up', h:'Add a holding', b:'Enter the ticker (ASX code), quantity, cost base ($/share) and purchase date. The app calculates current value using current price data.'},
    {icon:'chart-candle', h:'Track performance', b:'See the gain/loss and percentage return for each holding. The total equities value flows into your Net Assets summary on the Dashboard and Insights.'},
    {icon:'pencil', h:'Edit & delete', b:'Update holdings when you buy/sell more shares. Delete entries when you exit a position. Historical entries can be archived instead of deleted.'},
    {icon:'target', h:'Portfolio view', b:'The Equities page shows all holdings and total portfolio value. Filter by category (ASX, ETFs, International) for a clearer breakdown.'}
  ]},
  mortgage: { title:'Mortgage & Home', items:[
    {icon:'home', h:'Home details', b:'Enter your home value, purchase date, and property location. This establishes your gross asset value for net worth calculations.'},
    {icon:'credit-card', h:'Mortgage balance', b:'Enter the current outstanding mortgage balance. This is treated as a liability in your Net Assets calculation. Update quarterly as you pay it down.'},
    {icon:'settings', h:'Offset account', b:'Link your mortgage offset account to the Cash Tracker. The offset balance reduces your effective mortgage balance, improving equity and reducing interest accrual.'},
    {icon:'chart-bar', h:'Equity tracker', b:'The Mortgage page shows your home equity (home value - balance). As you pay down the loan, equity grows. A key component of your long-term wealth.'}
  ]},
  liabilities: { title:'Liabilities & Debts', items:[
    {icon:'credit-card', h:'Add a liability', b:'Record loans, credit cards, and personal debts. Enter name, current balance, interest rate (if applicable), and liability type (mortgage, car, credit card, personal).'},
    {icon:'chart-bar', h:'Debt breakdown', b:'See the total liabilities and breakdown by type. This is subtracted from your gross assets to calculate net wealth. Lower is better.'},
    {icon:'pencil', h:'Update balance', b:'Track payments by updating the balance as you pay down debt. The app shows progress and remaining balance for each liability.'},
    {icon:'alert-triangle', h:'Debt ratio', b:'Your total liabilities as a percentage of gross assets. Shown on the Assets page. Below 30% is strong; above 60% is concerning.'}
  ]},
  insurance: { title:'Insurance Policies', items:[
    {icon:'clipboard-list', h:'Policy details', b:'Record all insurance policies: life, income protection, home, contents, car, etc. Enter the policy name, type, insurer, and monthly premium.'},
    {icon:'calendar', h:'Renewal tracking', b:'Set the renewal date for each policy. The app shows upcoming renewals so you can shop around and lock in the best rates.'},
    {icon:'coin', h:'Premium management', b:'See total annual and monthly insurance costs. Compare costs across policies to identify savings opportunities or consolidation options.'},
    {icon:'pencil', h:'Edit & archive', b:'Update policy details as you switch insurers or adjust coverage. Archive policies that lapse instead of deleting them.'}
  ]},
};

function renderHowTo(pageId) {
  var cfg = _HOW_TO[pageId];
  if (!cfg) return '';
  var itemsHtml = cfg.items.map(function(it) {
    return '<div class="how-to-item">'
      + '<div class="how-to-icon">' + ICON(it.icon) + '</div>'
      + '<div><div class="how-to-title">' + it.h + '</div>'
      + '<div class="how-to-text">' + it.b + '</div></div>'
      + '</div>';
  }).join('');
  return '<div class="card how-to-card mb">'
    + '<div class="how-to-hd" onclick="this.parentNode.querySelector(\'.how-to-body\').style.display=this.parentNode.querySelector(\'.how-to-body\').style.display===\'none\'?\'grid\':\'none\';this.querySelector(\'.how-to-chev\').style.transform=this.parentNode.querySelector(\'.how-to-body\').style.display===\'none\'?\'\':\' rotate(180deg)\'">'
    + '<div style="display:flex;align-items:center;gap:10px"><span style="font-size:1.1rem">' + ICON('books') + '</span>'
    + '<div><div style="font-weight:700;font-size:.88rem;color:var(--text)">How to use — ' + cfg.title + '</div>'
    + '<div style="font-size:.72rem;color:var(--muted)">Tap to expand guide</div></div></div>'
    + '<span class="how-to-chev" style="font-size:.9rem;color:var(--muted);transition:transform .2s">▼</span>'
    + '</div>'
    + '<div class="how-to-body" style="display:none;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">'
    + itemsHtml
    + '</div>'
    + '</div>';
}

// ── FAB RADIAL MENU ──────────────────────────────────────────
function toggleFabMenu() {
  var menu = document.getElementById('fab-menu');
  var isOpen = menu && menu.classList.contains('open');
  if (isOpen) { closeFabMenu(); } else { openFabMenu(); }
}
function openFabMenu() {
  var menu    = document.getElementById('fab-menu');
  var fab     = document.getElementById('fab');
  var overlay = document.getElementById('fab-overlay');
  if (menu)    { menu.style.display = 'block'; setTimeout(function(){ menu.classList.add('open'); }, 10); }
  if (fab)     fab.classList.add('open');
  if (overlay) overlay.style.display = 'block';
}
function closeFabMenu() {
  var menu    = document.getElementById('fab-menu');
  var fab     = document.getElementById('fab');
  var overlay = document.getElementById('fab-overlay');
  if (menu)    { menu.classList.remove('open'); setTimeout(function(){ if (!menu.classList.contains('open')) menu.style.display = 'none'; }, 260); }
  if (fab)     fab.classList.remove('open');
  if (overlay) overlay.style.display = 'none';
}
function fabAction(action) {
  closeFabMenu();
  if (action === 'transaction') {
    goMob('transactions');
    setTimeout(function() {
      var addBtn = document.getElementById('tx-add-toggle');
      if (addBtn) addBtn.click();
    }, 300);
  } else if (action === 'import') {
    goMob('upload');
  } else if (action === 'bill') {
    goMob('bills');
  } else if (action === 'cash') {
    goMob('cash');
  } else if (action === 'transfer') {
    goMob('transfers');
  }
}

// ── THEME MANAGEMENT (palette × mode) ─────────────────────────
// Colour is two independent axes: a palette (5 options) and a mode (dark|light),
// each persisted under its own key. See css/tokens.css for the token blocks.
var PALETTES = ['kelda','fintech','emerald','slate','harvest'];

function applyThemeAttrs(palette, mode){
  var root = document.documentElement;
  root.setAttribute('data-palette', palette);
  root.setAttribute('data-mode', mode);
  // Keep the address-bar / PWA chrome colour in sync with the page background.
  try {
    var bg = getComputedStyle(root).getPropertyValue('--bg').trim();
    document.querySelectorAll('meta[name="theme-color"]').forEach(function(m){ m.setAttribute('content', bg); });
  } catch(e) {}
  syncThemeControls(palette, mode);
  // Charts read CSS vars at construction time only — re-render the visible page
  // so every chart picks up the new colours without a full reload.
  rerenderActivePage();
}

function setPalette(palette){
  if(PALETTES.indexOf(palette) < 0) palette = 'kelda';
  try { localStorage.setItem('cff_palette', palette); } catch(e) {}
  applyThemeAttrs(palette, getMode());
}

function setMode(mode){
  mode = (mode === 'light') ? 'light' : 'dark';
  try { localStorage.setItem('cff_mode', mode); } catch(e) {}
  applyThemeAttrs(getPalette(), mode);
}

// Flip between light and dark — used by the always-available top-nav button.
function toggleMode(){
  setMode(getMode() === 'dark' ? 'light' : 'dark');
}

function getPalette(){
  var p; try { p = localStorage.getItem('cff_palette'); } catch(e) {}
  return (PALETTES.indexOf(p) >= 0) ? p : 'kelda';
}
function getMode(){
  var m; try { m = localStorage.getItem('cff_mode'); } catch(e) {}
  return (m === 'light' || m === 'dark') ? m : 'dark';
}

// Reflect the current palette/mode across every theme control (Settings +
// mobile menu can both be in the DOM, so sync by class not id).
function syncThemeControls(palette, mode){
  document.querySelectorAll('.palette-select').forEach(function(sel){ sel.value = palette; });
  document.querySelectorAll('.mode-toggle-btn').forEach(function(b){
    b.classList.toggle('active', b.dataset.mode === mode);
  });
  // Top-nav quick toggle: show the icon for the mode you'll switch TO.
  document.querySelectorAll('.tb-mode-toggle').forEach(function(btn){
    var toLight = (mode === 'dark');
    var icon = btn.querySelector('i');
    if(icon) icon.className = 'ti ti-' + (toLight ? 'sun' : 'moon');
    var lbl = toLight ? 'Switch to light mode' : 'Switch to dark mode';
    btn.setAttribute('aria-label', lbl);
    btn.setAttribute('title', lbl);
  });
}

// Chart.js reads CSS vars at construction time, so charts keep stale colours
// after a palette/mode switch. Re-run the render fn for the visible page, but
// only for pages that actually draw charts — other pages update via CSS alone,
// and re-rendering them would needlessly rebuild the DOM and jump the scroll.
var CHART_PAGES = ['dashboard','insights','mortgage','insurance','forecast',
                   'assets','cash','equities','bills','transfers'];
function rerenderActivePage(){
  var active = document.querySelector('.page.active');
  if(!active || !active.id) return;
  var id = active.id.replace(/^page-/, '');
  if(CHART_PAGES.indexOf(id) >= 0 && typeof go === 'function') { try { go(id); } catch(e) {} }
}

// One-time migration from the old single-key theme system (cff_theme).
//   dark  → kelda/dark      light → kelda/light
//   system→ kelda/(OS mode) mint|ocean|unknown → kelda/dark
function migrateLegacyTheme(){
  var legacy; try { legacy = localStorage.getItem('cff_theme'); } catch(e) {}
  if(!legacy) return;
  var palette = 'kelda', mode = 'dark';
  if(legacy === 'light') mode = 'light';
  else if(legacy === 'system'){
    mode = (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
  }
  // dark / mint / ocean / anything else → kelda/dark (defaults above)
  try {
    localStorage.setItem('cff_palette', palette);
    localStorage.setItem('cff_mode', mode);
    localStorage.removeItem('cff_theme');
  } catch(e) {}
}

// The landing/login screen (and the pre-auth onboarding wizard) is dark-only by
// design — it's branded artwork that doesn't hold up in light mode. The user's
// light/dark preference only takes effect once they're inside the app. This
// applies the right mode for the current context WITHOUT touching their saved
// cff_mode, so their preference is preserved for when they unlock.
function applyThemeForContext(){
  var inApp = (typeof loggedIn !== 'undefined' && loggedIn);
  applyThemeAttrs(getPalette(), inApp ? getMode() : 'dark');
}

function loadTheme() {
  var hasNew = false;
  try { hasNew = !!localStorage.getItem('cff_palette') || !!localStorage.getItem('cff_mode'); } catch(e) {}
  if(!hasNew) migrateLegacyTheme();
  applyThemeForContext();
}

// ══════════════════════════════════════════════════════════════
// MOBILE NAV
// ══════════════════════════════════════════════════════════════
function toggleNav(){
  const nav=document.getElementById('nav');
  const ov=document.getElementById('nav-overlay');
  const hb=document.getElementById('hamburger');
  const open=nav.classList.toggle('open');
  ov.classList.toggle('show',open);
  hb.classList.toggle('open',open);
}
function closeNav(){
  document.getElementById('nav').classList.remove('open');
  document.getElementById('nav-overlay').classList.remove('show');
  document.getElementById('hamburger').classList.remove('open');
}
// Auto-close nav on link tap (mobile)
document.addEventListener('DOMContentLoaded',()=>{
  document.querySelectorAll('#nav .nav-item, #nav .nav-fly-item').forEach(a=>{
    a.addEventListener('click',()=>{if(window.innerWidth<=680)closeNav();});
  });
  if (typeof initNavFlyouts === 'function') initNavFlyouts();
  if (typeof initNavPins === 'function') initNavPins();
});

// ══════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════
// login.js (which defines selProfile) loads after this file, so guard the call
// to avoid a ReferenceError at parse time. The real boot-time init runs from
// index.html's inline boot once every script has loaded.
if (typeof selProfile === 'function') selProfile('brenton');
