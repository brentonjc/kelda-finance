// ══════════════════════════════════════════════════════════════
// AUTO-CATEGORISATION MODULE
// CatIds must match LCATS in data.js:
//   home, car_transport, health_beauty, fitness, food_eating_out,
//   children, pippen (display: "Pets"), insurance_utilities, entertainment,
//   holidays_travel, shopping, business, salary, bonus,
//   interest, capital_gains, transfers, other
// ══════════════════════════════════════════════════════════════
var AutoCat = (function() {

  var CONF_HIGH = 'HIGH';
  var CONF_LOW  = 'LOW';
  var CONF_NONE = 'NONE';
  var LEARNED_KEY = 'learnedMappings';

  // ── Keyword rules — catIds match actual LCATS in data.js ────
  var KEYWORD_RULES = [
    // TRANSFERS (checked before everything else)
    { catId:'transfers', subcat:'Loan Repayment',    keywords:['home loan','mortgage repayment','loan repayment','hl repay'] },
    { catId:'transfers', subcat:'Credit Card Payment',keywords:['credit card payment','visa payment','mastercard payment','amex payment','pay off credit','card payment'] },
    { catId:'transfers', subcat:'Savings Transfer',  keywords:['savings transfer','savings account transfer','high interest savings'] },
    { catId:'transfers', subcat:'Mortgage Offset',   keywords:['offset account','offset transfer'] },
    { catId:'transfers', subcat:'Between Accounts',  keywords:['transfer to','transfer from','trf to','trf from','tfr to','tfr from','int transfer','internal transfer','own account'] },
    { catId:'transfers', subcat:'External Transfer', keywords:['bpay','b-pay'] },

    // SALARY / INCOME
    { catId:'salary', subcat:'Regular Pay',   keywords:['salary','payroll','pay credit','wages','paycheque','paycheck','pay run'], incomeOnly:true },
    { catId:'bonus',  subcat:'Work Bonus',    keywords:['bonus','performance pay','incentive payment'], incomeOnly:true },
    { catId:'interest',subcat:'Savings Interest', keywords:['interest credit','interest earned','savings interest','term deposit interest','offset interest'], incomeOnly:true },
    { catId:'salary', subcat:'Regular Pay',   keywords:['centrelink','services australia','family tax benefit','child care subsidy','jobkeeper','jobseeker'], incomeOnly:true },

    // FOOD & EATING OUT
    { catId:'food_eating_out', subcat:'Groceries', keywords:['woolworths','coles','aldi','iga','spar','harris farm','foodworks','drakes','costco','supermarket'] },
    { catId:'food_eating_out', subcat:'Uber Eats and Delivery',  keywords:['uber eats','ubereats','doordash','menulog','deliveroo'] },
    { catId:'food_eating_out', subcat:'Eating Out (Cafes, Restaurant Food)', keywords:['restaurant','bistro','brasserie','dining','thai','chinese','japanese','indian','italian','greek','turkish','lebanese','vietnamese','korean','mexican','sushi','ramen','noodle','kebab','pizza','pasta','mcdonald','mcdonalds','kfc','hungry jacks','hungry jack','domino','pizza hut','subway','nandos','nando\'s','red rooster','oporto','guzman','taco bell','zambrero','grill\'d'] },
    { catId:'food_eating_out', subcat:'Cafe and Lunches',        keywords:['coffee','cafe','espresso','barista','gloria jeans','starbucks','hudsons coffee','boost juice','chatime','bakers delight','breadtop','donut king','muffin break','pie face'] },
    { catId:'food_eating_out', subcat:'Alcohol and Bars',        keywords:['dan murphy','bws','liquorland','vintage cellars','bottle shop','wine bar','craft beer','bar ','pub ','hotel bar','liquor'] },

    // CAR & TRANSPORT
    { catId:'car_transport', subcat:'Petrol',              keywords:['caltex','bp ','shell','7eleven','7-eleven','ampol','puma energy','liberty oil','united petroleum','petrol','fuel','servo'] },
    { catId:'car_transport', subcat:'Tolls',               keywords:['linkt','e-toll','citylink','transurban','m2 toll','harbour tunnel','roam express','eastlink','westconnex','toll'] },
    { catId:'car_transport', subcat:'Public Transport',    keywords:['opal','myki','go card','metrocard','translink','transperth','ptv','public transport','train fare','bus fare','ferry fare'] },
    { catId:'car_transport', subcat:'Ubers and Taxis',     keywords:['uber','didi','ola ride','taxify','bolt ride','rideshare','taxi'] },
    { catId:'car_transport', subcat:'Car Parking',         keywords:['parking','wilson parking','care park','secure parking','smart parking','ace parking'] },
    { catId:'car_transport', subcat:'Registration',        keywords:['vehicle registration','rego','transport nsw','vicroads','department of transport','roads and maritime'] },
    { catId:'car_transport', subcat:'Car Servicing',       keywords:['mechanic','car service','auto service','log book service','tyres','tyre','wheel alignment','midas','kmart tyre','beaurepaires','bridgestone','goodyear'] },
    { catId:'car_transport', subcat:'Car Insurance & Membership', keywords:['aami','nrma car','racv','racq','ract','ctp','comprehensive insurance','vehicle insurance','car insurance','racwa'] },

    // HOME
    { catId:'home', subcat:'Mortgage Repayments', keywords:['macquarie home','cba home','nab home','anz home','westpac home','ing home','home loan payment','mortgage payment'] },
    { catId:'home', subcat:'Council Rates',        keywords:['council rates','land rates','shire rates','city council','municipality','rate notice'] },
    { catId:'home', subcat:'Water Rates and Usage',keywords:['water rates','sydney water','yarra valley water','sa water','waternsw','unitywater','icon water','water corporation'] },
    { catId:'home', subcat:'Strata Fees',          keywords:['body corporate','strata levy','owners corp','strata management'] },
    { catId:'home', subcat:'Maintenance',          keywords:['plumber','electrician','handyman','tradesman','building maintenance','home repair','pest control','locksmith','builder'] },
    { catId:'home', subcat:'Power Bill',           keywords:['agl','origin energy','energyaustralia','energy australia','alinta energy','powershop','red energy','momentum energy','electricity','power bill'] },
    { catId:'home', subcat:'Gas Bill',             keywords:['natural gas','gas bill','agl gas','origin gas','jemena','agility','gas supply'] },
    { catId:'home', subcat:'Home Internet',        keywords:['nbn','internet bill','broadband','aussie broadband','iinet','internode','superloop','tpg internet'] },
    { catId:'home', subcat:'Home & Contents Insurance', keywords:['home insurance','home and contents','building insurance','suncorp home','aami home','nrma home','budget direct home'] },
    { catId:'home', subcat:'House Cleaning',       keywords:['cleaner','cleaning service','house clean','bond clean','end of lease clean'] },

    // HEALTH & BEAUTY
    { catId:'health_beauty', subcat:'Doctors, Health, Specialists', keywords:['medical centre','medical practice','general practice','bulk bill','doctor','gp ','physician','specialist','cardiologist','dermatologist','physiotherapy','physio','chiropractic','chiropractor','optometrist','audiologist','hospital','emergency dept','pathology','radiology','xray','x-ray','mri','ct scan','ultrasound','psychologist','psychiatrist','counsellor','therapist','headspace','medibank','hbf','bupa health','nib health','ahm health','health fund'] },
    { catId:'health_beauty', subcat:'Pharmacy',    keywords:['chemist','pharmacy','priceline','chemist warehouse','terry white','blooms the chemist','discount drug','amcal'] },
    { catId:'health_beauty', subcat:'Doctors, Health, Specialists', keywords:['dentist','dental','teeth','orthodontic','braces','crown','filling','hygienist'] },
    { catId:'health_beauty', subcat:'Nails, Beauty & Other Errands', keywords:['nail salon','nails','beauty salon','waxing','spray tan','eyelash','lash bar','blow dry','beauty'] },
    { catId:'health_beauty', subcat:'Haircuts',    keywords:['haircut','hairdresser','hair salon','barber','blow wave','hair colour','hair color','toni and guy','supercuts','just cuts'] },

    // FITNESS
    { catId:'fitness', subcat:'Brenton Gym',       keywords:['gym','fitness first','anytime fitness','snap fitness','f45','crossfit','yoga','pilates','swimming lesson','swim','tennis','golf','squash','bowling','surf lesson','park run','half marathon','marathon registration','planet fitness','virgin active','goodlife'] },

    // INSURANCE & UTILITIES
    { catId:'insurance_utilities', subcat:'Life & Income Insurance', keywords:['life insurance','term life','income protection','total permanent','tpd cover','tal ','zurich','aia insurance','onepath','clearview','asteron'] },
    { catId:'insurance_utilities', subcat:'Mobile Phone Bills', keywords:['telstra','optus','vodafone','amaysim','kogan mobile','boost mobile','circles life','felix mobile','mobile plan','prepaid recharge','phone bill'] },

    // ENTERTAINMENT
    { catId:'entertainment', subcat:'Netflix',           keywords:['netflix'] },
    { catId:'entertainment', subcat:'Amazon Prime',      keywords:['amazon prime'] },
    { catId:'entertainment', subcat:'Apple Subscriptions',keywords:['apple.com/bill','apple subscriptions','itunes','apple tv','icloud storage','apple music','app store'] },
    { catId:'entertainment', subcat:'Other Entertainment',keywords:['stan ','disney','binge','foxtel','kayo sports','paramount','spotify','youtube premium','google one','event cinemas','village cinemas','hoyts','reading cinemas','cinema ticket','movie ticket','ticketmaster','ticketek','moshtix','eventbrite','concert','festival','live music','theatre','comedy show','steam','playstation','xbox','nintendo','gaming'] },
    { catId:'entertainment', subcat:'Wine & Presents',   keywords:['wine','bottle of wine','gift card','wine gift'] },

    // HOLIDAYS & TRAVEL
    { catId:'holidays_travel', subcat:'Flights',       keywords:['qantas','virgin australia','jetstar','rex airlines','bonza','tigerair','airasia','singapore airlines','emirates','cathay pacific','united airlines','flight centre','webjet','skyscanner'] },
    { catId:'holidays_travel', subcat:'Accommodation', keywords:['airbnb','booking.com','hotels.com','expedia','wotif','trivago','hotel','motel','resort','hostel','b&b','bed and breakfast','holiday park','caravan park'] },
    { catId:'holidays_travel', subcat:'Car Rentals',   keywords:['avis','hertz','budget rent','europcar','thrifty car','enterprise rental','sixt','car hire','rental car'] },
    { catId:'holidays_travel', subcat:'Travel Insurance', keywords:['travel insurance','worldcare','cover-more','allianz travel','1cover','fast cover','southern cross travel'] },

    // SHOPPING
    { catId:'shopping', subcat:'Clothing & Shopping',  keywords:['cotton on','country road','david jones','myer','the iconic','h&m','zara','uniqlo','target','kmart','big w','bonds','lorna jane','rebel sport','city beach','glue store','factorie','jay jays','jeanswest','rivers','rockmans','autograph','millers','katies','crossroads','lowes','rivers clothing'] },
    { catId:'shopping', subcat:'Online Shopping',      keywords:['amazon','ebay','catch.com','kogan','aliexpress','etsy','paypal purchase','afterpay','zip pay','klarna','humm'] },
    { catId:'shopping', subcat:'Home Shopping',        keywords:['bunnings','mitre 10','total tools','bbqs galore','ikea','fantastic furniture','nick scali','amart furniture','harvey norman','jb hi-fi','jb hifi','the good guys','good guys','bing lee','officeworks'] },
    { catId:'shopping', subcat:'Gifts',                keywords:['florist','flowers','balloon','gift shop','prezzy box','flower bouquet'] },
    { catId:'shopping', subcat:'Donations',            keywords:['st vincent','salvation army','red cross','oxfam','world vision','unicef','beyond blue','cancer council','heart foundation','smith family','lifeline','mission australia','rspca','wwf','amnesty','donate'] },

    // CHILDREN
    { catId:'children', subcat:'Childcare',            keywords:['childcare','child care','daycare','day care','kindy','kindergarten','preschool','pre-school','after school care','vacation care','oshc'] },
    { catId:'children', subcat:'School Fees',          keywords:['school fee','tuition fee','enrolment fee','excursion','school levy','school camp'] },
    { catId:'children', subcat:'Children Activities',  keywords:['swimming lesson','dancing class','music lesson','sports class','gymnastics','martial arts','little athletics','cricket club','footy club','soccer club','netball'] },
    { catId:'children', subcat:'Toys and Presents',    keywords:['baby bunting','mothercare','nappies','formula','baby food','pram','stroller','cot','car seat','toy'] },
    { catId:'children', subcat:'Nannies & Carers',     keywords:['nanny','carer','babysitter','au pair','babysitting'] },

    // PETS (catId: pippen)
    { catId:'pippen', subcat:'Vet Bills',    keywords:['vet','veterinary','veterinarian','animal hospital','animal clinic'] },
    { catId:'pippen', subcat:'Pet Food',     keywords:['petbarn','petstock','pet circle','city farmers','greencross','pet food','dog food','cat food'] },
    { catId:'pippen', subcat:'Dog Grooming', keywords:['dog grooming','pet grooming','dog wash','dog bath','dog salon','poodle parlour'] },
    { catId:'pippen', subcat:'Pet Insurance',keywords:['pet insurance','bow wow meow','petplan','medibank pet','real pet insurance'] },

    // BUSINESS COSTS
    { catId:'business', subcat:'Tax Payments',     keywords:['ato payment','income tax','tax instalment','pay as you go','payg','bas payment','gst payment','business activity'] },
    { catId:'business', subcat:'Website and Digital', keywords:['adobe','microsoft 365','office 365','dropbox','notion','slack','zoom','google workspace','canva','figma','atlassian','github','aws','azure','digital ocean','cloudflare','godaddy','namecheap','domain registration'] },
    { catId:'business', subcat:'Education',        keywords:['udemy','coursera','linkedin learning','skillshare','masterclass','codecademy','pluralsight'] },
    { catId:'business', subcat:'Business Insurance', keywords:['accountant','accounting fee','tax agent','bas preparation','bookkeeper','solicitor','lawyer','legal fee','conveyancer','notary'] },
  ];

  // ── Transfer detection ───────────────────────────────────────
  var TRANSFER_WORDS = [
    'transfer to','transfer from','trf to','trf from','tfr to','tfr from',
    'int transfer','internal transfer','own account','savings transfer',
    'loan repayment from','credit card payment','pay off credit',
    'offset account','redraw','sweep','auto-transfer','autotransfer'
  ];
  var TRANSFER_BSB = /\b\d{3}-\d{3}\b/;

  var TRANSFER_SUBCAT_MAP = [
    { subcat:'Credit Card Payment', words:['credit card payment','visa payment','mastercard payment','amex payment'] },
    { subcat:'Savings Transfer',    words:['savings transfer','savings account','high interest savings'] },
    { subcat:'Mortgage Offset',     words:['offset account','offset transfer'] },
    { subcat:'Loan Repayment',      words:['loan repayment','home loan repayment','personal loan','car loan'] },
    { subcat:'Between Accounts',    words:['transfer to','transfer from','trf ','tfr '] },
  ];

  // ── Normalise string for learnedMappings key ─────────────────
  function normStr(s) {
    if (!s) return '';
    return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  // ── Load / save learnedMappings ──────────────────────────────
  function loadLearned() {
    try { return JSON.parse(localStorage.getItem(LEARNED_KEY) || '{}'); }
    catch(e) { return {}; }
  }
  function saveLearned(m) {
    try { localStorage.setItem(LEARNED_KEY, JSON.stringify(m)); } catch(e) {}
  }

  // ── Clean raw description ─────────────────────────────────────
  function clean(raw) {
    if (!raw) return '';
    var s = raw;
    s = s.replace(/^﻿/, '').replace(/[^\x20-\x7E]/g, ' ');
    s = s.replace(/^(EFTPOS|VISA|MASTERCARD|DIRECT DEBIT|DIRECT CREDIT|OSKO|NPP|BPAY|CHEQUE|ATM|POS|CHQ|D\/D|C\/R)\s+/i, '');
    s = s.replace(/^\d{2}[\/\-]\d{2}[\/\-]\d{2,4}\s*/, '');
    s = s.replace(/\s+\d{2}[\/\-]\d{2}[\/\-]\d{2,4}$/, '');
    s = s.replace(/\s+(NSW|VIC|QLD|WA|SA|TAS|ACT|NT)\s*$/i, '');
    s = s.replace(/\s*(ref|reference|ref no|txn|transaction id|receipt|rcpt|inv|invoice)[:\s#]*[\w\d]+/gi, '');
    s = s.replace(/\s{2,}/g, ' ').trim();
    return s;
  }

  // ── Transfer detection ────────────────────────────────────────
  function isTransfer(raw, cleaned) {
    var test = ((raw || '') + ' ' + (cleaned || '')).toLowerCase();
    if (TRANSFER_BSB.test(raw || '')) return true;
    for (var i = 0; i < TRANSFER_WORDS.length; i++) {
      if (test.indexOf(TRANSFER_WORDS[i]) !== -1) return true;
    }
    return false;
  }

  function transferSubcat(raw, cleaned) {
    var test = ((raw || '') + ' ' + (cleaned || '')).toLowerCase();
    for (var i = 0; i < TRANSFER_SUBCAT_MAP.length; i++) {
      var entry = TRANSFER_SUBCAT_MAP[i];
      for (var j = 0; j < entry.words.length; j++) {
        if (test.indexOf(entry.words[j]) !== -1) return entry.subcat;
      }
    }
    return 'Between Accounts';
  }

  // ── Check LRULES ─────────────────────────────────────────────
  function matchLRules(name) {
    if (!name) return null;
    var key = name.trim().toLowerCase();
    if (typeof LRULES === 'undefined') return null;
    var r = LRULES[key];
    if (!r) return null;
    if (typeof r === 'string') return { catId: r, subcat: '', confidence: CONF_HIGH };
    if (typeof r === 'object') return { catId: r.catId || r, subcat: r.subcat || '', confidence: CONF_HIGH };
    return null;
  }

  // ── Check learnedMappings ─────────────────────────────────────
  function matchLearned(name) {
    if (!name) return null;
    var key = normStr(name);
    var learned = loadLearned();
    var entry = learned[key];
    if (!entry || !entry.catId) return null;
    var conf = CONF_HIGH;
    var now = Date.now();
    var daysSince = entry.lastMatchedAt ? (now - entry.lastMatchedAt) / 86400000 : 999;
    if (entry.matchCount < 3 || daysSince > 180) conf = CONF_LOW;
    return { catId: entry.catId, subcat: entry.subcat || '', confidence: conf };
  }

  // ── Keyword matching ──────────────────────────────────────────
  function matchKeywords(cleaned, isCredit) {
    if (!cleaned) return null;
    var test = cleaned.toLowerCase();
    var matches = [];
    for (var i = 0; i < KEYWORD_RULES.length; i++) {
      var rule = KEYWORD_RULES[i];
      if (rule.incomeOnly && !isCredit) continue;
      if (rule.expenseOnly && isCredit) continue;
      for (var j = 0; j < rule.keywords.length; j++) {
        if (test.indexOf(rule.keywords[j]) !== -1) {
          matches.push({ catId: rule.catId, subcat: rule.subcat, keyword: rule.keywords[j] });
          break;
        }
      }
    }
    if (!matches.length) return null;
    matches.sort(function(a, b) { return b.keyword.length - a.keyword.length; });
    var conf = matches.length === 1 ? CONF_HIGH : CONF_LOW;
    return { catId: matches[0].catId, subcat: matches[0].subcat, confidence: conf };
  }

  // ── Amount signal ─────────────────────────────────────────────
  function amountSignal(amount, isCredit) {
    if (isCredit) {
      if (amount >= 1000 && amount <= 20000) return { catId: 'salary', subcat: 'Regular Pay', confidence: CONF_LOW };
    }
    return null;
  }

  // ── Duplicate detection ───────────────────────────────────────
  function isDuplicate(date, amount, name, existingTx) {
    if (!existingTx || !existingTx.length) return false;
    var nameLower = (name || '').toLowerCase().trim();
    for (var i = 0; i < existingTx.length; i++) {
      var t = existingTx[i];
      if (t.date === date && Math.abs(Number(t.amount) - Number(amount)) < 0.01) {
        var tName = (t.name || '').toLowerCase().trim();
        if (!nameLower || !tName || tName === nameLower) return true;
      }
    }
    return false;
  }

  // ── Main categorise function ──────────────────────────────────
  function categorise(name, desc, amount, txType) {
    var raw = name || desc || '';
    var cleaned = clean(raw);
    var isCredit = (txType === 'income');

    // 1. Transfer detection
    if (isTransfer(raw, cleaned)) {
      return { catId: 'transfers', subcat: transferSubcat(raw, cleaned), confidence: CONF_HIGH, source: 'transfer' };
    }

    // 2. LRULES (user-confirmed, highest priority)
    var fromLRules = matchLRules(name);
    if (fromLRules) return Object.assign({}, fromLRules, { source: 'rule' });

    // 3. learnedMappings HIGH confidence
    var fromLearned = matchLearned(name || cleaned);
    if (fromLearned && fromLearned.confidence === CONF_HIGH) {
      return Object.assign({}, fromLearned, { source: 'learned' });
    }

    // 4. Keyword match HIGH confidence
    var fromKeyword = matchKeywords(cleaned, isCredit);
    if (fromKeyword && fromKeyword.confidence === CONF_HIGH) {
      return Object.assign({}, fromKeyword, { source: 'keyword' });
    }

    // 5. learnedMappings LOW
    if (fromLearned) return Object.assign({}, fromLearned, { source: 'learned' });

    // 6. Keyword LOW
    if (fromKeyword) return Object.assign({}, fromKeyword, { source: 'keyword' });

    // 7. Amount signal
    var fromAmt = amountSignal(amount, isCredit);
    if (fromAmt) return Object.assign({}, fromAmt, { source: 'amount' });

    return { catId: 'other', subcat: '', confidence: CONF_NONE, source: 'none' };
  }

  // ── Save to learnedMappings ───────────────────────────────────
  function learn(merchantName, catId, subcat) {
    if (!merchantName || !catId || catId === 'other') return;
    var key = normStr(merchantName);
    if (!key) return;
    var learned = loadLearned();
    var existing = learned[key] || { matchCount: 0 };
    learned[key] = {
      catId:         catId,
      subcat:        subcat || '',
      matchCount:    (existing.matchCount || 0) + 1,
      lastMatchedAt: Date.now(),
      displayName:   merchantName.trim()
    };
    saveLearned(learned);
  }

  // ── Bulk reprocess ────────────────────────────────────────────
  var _reprocessSnapshot = null;

  function reprocess(onProgress, onDone) {
    _reprocessSnapshot = JSON.parse(JSON.stringify(TX));

    var txList = TX;
    var total  = txList.length;
    var idx    = 0;
    var changed = 0;
    var CHUNK  = 50;

    function processChunk() {
      var end = Math.min(idx + CHUNK, total);
      for (; idx < end; idx++) {
        var t = txList[idx];

        // Skip if resolved by a confirmed rule or manually assigned by the user
        if (matchLRules(t.name)) continue;
        if (t.userSet) continue;

        var result = categorise(t.name, t.description, t.amount, t.type);
        if (result.confidence === CONF_NONE) continue;
        if (result.catId === 'other') continue;

        var catObj  = (typeof LCATS !== 'undefined') ? LCATS.find(function(c){ return c.id === result.catId; }) : null;
        if (!catObj) continue; // skip if catId not valid in this user's LCATS

        var catName = catObj.name;
        if (t.catId !== result.catId || t.subcat !== (result.subcat || '')) {
          t.catId    = result.catId;
          t.category = catName;
          t.subcat   = result.subcat || t.subcat || '';
          changed++;

          // Populate learnedMappings so results are visible in Categories
          if (t.name) learn(t.name, result.catId, result.subcat);
        }
      }
      if (onProgress) onProgress(Math.round((idx / total) * 100), changed);
      if (idx < total) {
        setTimeout(processChunk, 10);
      } else {
        try { save(K.tx, TX); } catch(e) {}
        if (onDone) onDone(changed);
      }
    }
    processChunk();
  }

  function undoReprocess() {
    if (!_reprocessSnapshot) return false;
    TX = _reprocessSnapshot;
    try { save(K.tx, TX); } catch(e) {}
    _reprocessSnapshot = null;
    return true;
  }

  // ── Suggestion pill ───────────────────────────────────────────
  var _suggDebounce = null;

  function onNameInput(val) {
    clearTimeout(_suggDebounce);
    if (!val || val.trim().length < 3) { hideSuggestion(); return; }
    _suggDebounce = setTimeout(function() { showSuggestion(val); }, 400);
  }

  function showSuggestion(name) {
    var pill = document.getElementById('tx-autocat-pill');
    if (!pill) return;
    var txType = document.getElementById('tx-type') ? document.getElementById('tx-type').value : 'expense';
    var result = categorise(name, '', 0, txType);
    if (!result || result.confidence === CONF_NONE || result.catId === 'other') { hideSuggestion(); return; }
    var catObj = (typeof LCATS !== 'undefined') ? LCATS.find(function(c){ return c.id === result.catId; }) : null;
    if (!catObj) { hideSuggestion(); return; }
    var label = catObj.icon + ' ' + catObj.name + (result.subcat ? ' › ' + result.subcat : '');
    var confColor = result.confidence === CONF_HIGH ? 'var(--success)' : 'var(--warn)';
    pill.innerHTML = '<span style="color:var(--muted);font-size:.72rem">Suggested: </span>'
      + '<button class="btn btn-ghost btn-sm" style="color:' + confColor + ';font-size:.78rem;padding:3px 10px;border-color:' + confColor + '" '
      + 'onclick="acatApplySuggestion(\'' + result.catId + '\',\'' + (result.subcat || '') + '\')">'
      + label + '</button>'
      + '<button class="btn btn-ghost btn-sm" style="font-size:.72rem;padding:2px 8px;color:var(--muted)" '
      + 'onclick="document.getElementById(\'tx-autocat-pill\').style.display=\'none\'">✕</button>';
    pill.style.display = 'flex';
  }

  function hideSuggestion() {
    var pill = document.getElementById('tx-autocat-pill');
    if (pill) pill.style.display = 'none';
  }

  function applySuggestion(catId, subcat) {
    var catSel = document.getElementById('tx-cat');
    if (catSel) { catSel.value = catId; catSel.dispatchEvent(new Event('change')); }
    var subSel = document.getElementById('tx-subcat');
    if (subSel && subcat) {
      setTimeout(function() {
        var opt = subSel.querySelector('option[value="' + subcat + '"]');
        if (opt) subSel.value = subcat;
      }, 50);
    }
    hideSuggestion();
  }

  return {
    CONF_HIGH:      CONF_HIGH,
    CONF_LOW:       CONF_LOW,
    CONF_NONE:      CONF_NONE,
    clean:          clean,
    isTransfer:     isTransfer,
    transferSubcat: transferSubcat,
    matchLRules:    matchLRules,
    matchLearned:   matchLearned,
    matchKeywords:  matchKeywords,
    amountSignal:   amountSignal,
    isDuplicate:    isDuplicate,
    categorise:     categorise,
    learn:          learn,
    reprocess:      reprocess,
    undoReprocess:  undoReprocess,
    onNameInput:    onNameInput,
    showSuggestion: showSuggestion,
    hideSuggestion: hideSuggestion,
    applySuggestion:applySuggestion
  };
})();

// ── Global helpers ────────────────────────────────────────────
function acatApplySuggestion(catId, subcat) {
  AutoCat.applySuggestion(catId, subcat);
}

function acatReprocess() {
  var btn    = document.getElementById('acat-reprocess-btn');
  var prog   = document.getElementById('acat-progress');
  var result = document.getElementById('acat-result');
  if (btn) btn.disabled = true;
  if (prog) { prog.style.display = 'block'; prog.value = 0; }
  if (result) result.innerHTML = '<span style="color:var(--muted)">Processing...</span>';

  AutoCat.reprocess(
    function(pct, changed) {
      if (prog) prog.value = pct;
      if (result) result.innerHTML = '<span style="color:var(--muted)">Processing... ' + pct + '% (' + changed + ' updated)</span>';
    },
    function(changed) {
      if (btn) btn.disabled = false;
      if (prog) prog.style.display = 'none';
      if (result) {
        result.innerHTML = '<span style="color:var(--success)">Done — ' + changed + ' transactions updated.</span>'
          + ' <button class="btn btn-ghost btn-sm" style="margin-left:8px" onclick="acatUndoReprocess()">Undo</button>';
      }
      if (typeof renderTx === 'function') renderTx();
      if (typeof renderDashboard === 'function') renderDashboard();
      if (typeof renderRulesList === 'function') renderRulesList();
      toast('✅ Reprocessed ' + changed + ' transactions');
    }
  );
}

function acatUndoReprocess() {
  if (AutoCat.undoReprocess()) {
    var result = document.getElementById('acat-result');
    if (result) result.innerHTML = '<span style="color:var(--warn)">Undo complete — transactions restored.</span>';
    if (typeof renderTx === 'function') renderTx();
    if (typeof renderDashboard === 'function') renderDashboard();
    toast('↩️ Undo complete');
  }
}
