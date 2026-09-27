// ══════════════════════════════════════════════════════════════
// AUTO-CATEGORISATION ENGINE v2.0
// Pipeline: preprocess → BPAY → exact-LRULES → alias → matchLRules → keyword → fuzzy
// CatIds match LCATS in data.js (slugs, not display names)
// ══════════════════════════════════════════════════════════════

// ── Display name overrides ────────────────────────────────────
var DISPLAY_OVERRIDES = {
  'bp':'BP','nrma':'NRMA','ato':'ATO','agl':'AGL','bws':'BWS','iga':'IGA',
  'atm':'ATM','bpay':'BPAY','ing':'ING','anz':'ANZ','nab':'NAB','cba':'CBA',
  'tpg':'TPG','asx':'ASX','rms':'RMS','hcf':'HCF','nib':'NIB','qbe':'QBE',
  'gio':'GIO','aami':'AAMI','rac':'RAC','racv':'RACV','racq':'RACQ',
  'eftpos':'EFTPOS','aws':'AWS',
  'jb hi fi':'JB Hi-Fi','jb hi-fi':'JB Hi-Fi',
  'medicare':'Medicare','centrelink':'Centrelink',
  'australia post':'Australia Post','woolworths':'Woolworths',
  'mcdonalds':"McDonald's",'7-eleven':'7-Eleven','harvey norman':'Harvey Norman',
  'uber eats':'Uber Eats','amazon prime':'Amazon Prime',
  'kayo sports':'Kayo Sports','disney plus':'Disney+',
  'paramount plus':'Paramount+','youtube premium':'YouTube Premium'
};

function makeDisplayMerchant(preprocessed) {
  if (!preprocessed) return '';
  if (DISPLAY_OVERRIDES[preprocessed]) return DISPLAY_OVERRIDES[preprocessed];
  return preprocessed.replace(/\b\w/g, function(c) { return c.toUpperCase(); });
}

// ── Debounced rules persist ───────────────────────────────────
var _rulesPersistTimer = null;
function scheduleRulesPersist() {
  if (_rulesPersistTimer) clearTimeout(_rulesPersistTimer);
  _rulesPersistTimer = setTimeout(function() {
    try { localStorage.setItem(K.rules, JSON.stringify(LRULES)); }
    catch(e) { console.warn('Kelda: rules persist failed', e); }
    _rulesPersistTimer = null;
  }, 2000);
}

// ── Refund detection ──────────────────────────────────────────
function detectRefund(raw) {
  if (!raw) return false;
  return /^(REFUND FROM|REFUND -|CREDIT FROM|REVERSAL FROM|REVERSAL -)/i.test(raw);
}

// ── Pre-processing pipeline ───────────────────────────────────
function preprocessMerchantString(raw) {
  if (!raw) return '';
  var s = raw;
  s = s.replace(/\s\*\s?/g, ' ');
  var prefixes = [
    'VISA PURCHASE','VISA DEBIT','EFTPOS',
    'BPAY PAYMENT TO','BPAY REF','BPAY',
    'DIRECT DEBIT','INTERNET TRANSFER','INTERNET PURCHASE',
    'DEBIT CARD','DIRECT CREDIT','RECURRING','AUTOPAY','EFT',
    'REFUND FROM','REFUND -','CREDIT FROM','REVERSAL FROM','REVERSAL -',
    'SQ ','PP ','SP '
  ];
  s = s.replace(/^CARD\s+\d{2}-\d{4}\s+/i, '');
  s = s.replace(/^PAYPAL\s*\*?\s*/i, '');
  for (var p = 0; p < prefixes.length; p++) {
    var re = new RegExp('^' + prefixes[p].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*', 'i');
    s = s.replace(re, '');
  }
  s = s.replace(/\s(NSW|VIC|QLD|SA|WA|TAS|NT|ACT)(\s\d{4})?$/i, '');
  s = s.replace(/\s\d{4}$/, '');
  s = s.replace(/\s\*?(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*[0-9])[A-Z0-9]{5,}\b/gi, '');
  s = s.replace(/\*[A-Z0-9]+/g, '');
  s = s.replace(/\s[\d\-().]{7,}/g, '');
  s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  s = s.toLowerCase().trim().replace(/\s+/g, ' ').replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
  if (s.length < 3) return '';
  return s;
}

// ── BPAY biller extraction ────────────────────────────────────
function extractBpayBiller(preprocessed) {
  if (preprocessed.indexOf('bpay') !== 0) return preprocessed;
  var biller = preprocessed.slice(4).trim();
  biller = biller.replace(/\s+\d{6,}$/, '');
  biller = biller.replace(/\s+(ref|receipt|reference|payment)\s*\d*/i, '').trim();
  return biller || preprocessed;
}

// ── Merchant alias table ──────────────────────────────────────
var MERCHANT_ALIASES = {
  // Supermarkets & Liquor
  'woolies':'woolworths','woolw ':'woolworths','ww ':'woolworths',
  'woolworths metro':'woolworths','woolworths petrol':'woolworths petrol',
  'coles supermarkets':'coles','coles supermar':'coles','coles metro':'coles',
  'coles online':'coles','coles ':'coles','coles express':'coles express',
  'aldi stores':'aldi','aldi ':'aldi','iga xpress':'iga','iga ':'iga',
  'harris farms':'harris farm markets','harris farm':'harris farm markets',
  'costco whsl':'costco',
  'coles liquor':'liquorland','bws bottle':'bws','bws ':'bws',
  'dan murphys':'dan murphy','dan murphey':'dan murphy','dan murphy':'dan murphy',
  'dans ':'dan murphy','first choice liq':'first choice liquor',
  // Fuel
  'bp australia':'bp','bp connect':'bp','bp express':'bp','bpconnect':'bp','bp ':'bp',
  'caltex woolworths':'woolworths petrol','caltex australia':'ampol','caltex':'ampol',
  'ampol':'ampol','shell coles express':'coles express','shell ':'shell',
  'united petroleum':'united petroleum','united petrol':'united petroleum',
  '7eleven':'7-eleven','7 eleven':'7-eleven',
  'liberty oil':'liberty oil','liberty ':'liberty oil',
  'puma energy':'puma energy','metro petrol':'metro petroleum',
  // Fast food & dining
  'mcdonalds':'mcdonalds','mcdonald':'mcdonalds','maccas':'mcdonalds',
  "macca's":'mcdonalds','mcd ':'mcdonalds',
  'hungry jacks':'hungry jacks','hungry j':'hungry jacks',"hj's":'hungry jacks',
  'kfc australia':'kfc','kfc-':'kfc','kfc ':'kfc',
  'subway*':'subway','subway ':'subway',
  "domino's":'dominos pizza','domino pizza':'dominos pizza','dominos':'dominos pizza',
  'pizza hut':'pizza hut','red rooster':'red rooster',
  "nando's":'nandos','nandos':'nandos','grill\'d':"grill'd",'grilld':"grill'd",
  'oporto':'oporto','starbucks coffee':'starbucks','starbucks':'starbucks',
  'the coffee club':'the coffee club','coffee club':'the coffee club',
  'boost juice':'boost juice','boost ':'boost juice',
  'zambrero':'zambrero','guzman y gomez':'guzman y gomez','gyg ':'guzman y gomez',
  'schnitz':'schnitz',
  // Food delivery
  'uber* eats':'uber eats','uber *eats':'uber eats','ubereats':'uber eats',
  'door dash':'doordash','doordash':'doordash','deliveroo':'deliveroo',
  'menu log':'menulog','menulog':'menulog',
  'hello fresh':'hellofresh','hellofresh':'hellofresh',
  'every plate':'everyplate','everyplate':'everyplate',
  'marley spoon':'marley spoon','dinnerly':'dinnerly','youfoodz':'youfoodz',
  // Utilities & Energy
  'origin energy':'origin energy','origin ':'origin energy',
  'agl energy':'agl','agl ':'agl',
  'energy australia':'energyaustralia','alinta energy':'alinta energy','alinta ':'alinta energy',
  'powershop':'powershop','red energy pty':'red energy','redenergy':'red energy',
  'sydney water corp':'sydney water','sydneywater':'sydney water',
  // Telco
  'telstra ':'telstra','telstra':'telstra','optus*':'optus','optus ':'optus',
  'voda ':'vodafone','tpg internet':'tpg','tpg ':'tpg',
  'iinet ':'iinet','iinet':'iinet','aussie broadband':'aussie broadband',
  'aussie bb':'aussie broadband','superloop':'superloop',
  'dodo services':'dodo','dodo ':'dodo','amaysim':'amaysim',
  'boost mobile':'boost mobile',
  // Streaming & subscriptions
  'netflix.com':'netflix','netflx':'netflix',
  'spotify.com':'spotify','spotify*':'spotify',
  'stan.com':'stan','stan ':'stan','binge.com':'binge','binge ':'binge',
  'kayo ':'kayo sports','foxtel*':'foxtel',
  "paramount+":'paramount plus','paramount':'paramount plus',
  'disney+':'disney plus','disneyplus':'disney plus',
  'primevideo':'amazon prime','prime video':'amazon prime',
  'apple tv':'apple tv plus','apple itunes':'apple','apple.com/bill':'apple',
  'itunes':'apple','google play':'google play','google*':'google','goog*':'google',
  'msft*':'microsoft','microsoft':'microsoft',
  'adobe*':'adobe','adobe ':'adobe','canva*':'canva','canva':'canva',
  'dropbox*':'dropbox','dropbox':'dropbox',
  'youtube':'youtube premium','twitch':'twitch','audible':'audible',
  // Retail & department stores
  'kmart aust':'kmart','kmart ':'kmart',
  'target australia':'target','target ':'target',
  'bigw':'big w','big w':'big w','myer ':'myer',
  "dj's":'david jones',
  'harvey norm':'harvey norman','harv norm':'harvey norman',
  'jb hi-fi':'jb hi fi','jb hifi':'jb hi fi','jbhifi':'jb hi fi',
  'the good guys':'the good guys','good guys':'the good guys',
  'office works':'officeworks','ikea aust':'ikea',
  'bunnings war':'bunnings','bunnings w':'bunnings',
  'mitre10':'mitre 10','mitre 10':'mitre 10',
  'the reject':'the reject shop','reject shop':'the reject shop',
  'best&less':'best and less','best & less':'best and less',
  'cotton:on':'cotton on','cotton on':'cotton on',
  'h&m ':'h&m','zara ':'zara','country road':'country road',
  'witchery':'witchery','supre ':'supre','glue store':'glue store',
  'rebel ':'rebel sport','anaconda':'anaconda','bcf ':'bcf',
  'kathmandu':'kathmandu','lorna jane':'lorna jane','city beach':'city beach',
  'asos':'asos','catch.com':'catch','catch ':'catch',
  'kogan.com':'kogan','kogan':'kogan',
  // Amazon
  'amazon web':'amazon web services','amazon marketplace':'amazon',
  'amazon mktplace':'amazon','amazon.com':'amazon','amazon au':'amazon',
  'amzn mktp':'amazon','amzn':'amazon','aws ':'amazon web services',
  // Transport & travel
  'uber trip':'uber','uber au':'uber','uber*':'uber','uber ':'uber',
  'ola ':'ola','didi ':'didi','13cabs':'13cabs',
  'opal card':'opal transport','opal ':'opal transport',
  'myki ':'myki','translink':'translink',
  'qantas airways':'qantas','jetstar airw':'jetstar','jetstar':'jetstar',
  'virgin australia':'virgin australia','virgin aust':'virgin australia',
  'rex ':'rex airlines','regional express':'rex airlines',
  'airbnb.com':'airbnb','booking.com':'booking.com',
  'hotels.com':'hotels.com','wotif':'wotif','expedia':'expedia',
  'avis ':'avis','hertz ':'hertz','thrifty':'thrifty car rental',
  'transurban':'tolls','eastlink':'tolls','citylink':'tolls',
  'linkt ':'linkt','linkt au':'linkt','linkt e-toll':'linkt',
  'roam express':'tolls','eway toll':'tolls','e-toll':'tolls','etoll':'tolls',
  // Health & pharmacy
  'chemist wareh':'chemist warehouse','cw ':'chemist warehouse',
  'priceline':'priceline pharmacy','amcal':'amcal pharmacy',
  'terry white':'terry white chemmart','twc ':'terry white chemmart',
  'guardian pharm':'guardian pharmacy','blooms the':'blooms the chemist',
  'medibank private':'medibank','medibank':'medibank',
  'bupa australia':'bupa','bupa ':'bupa','hcf ':'hcf',
  'nib ':'nib health','ahm ':'ahm health',
  'bulk billing':'medical','pathology':'pathology',
  'sonic healthcare':'pathology','douglass hanly':'pathology',
  // Financial services
  'commonwealth bank':'commonwealth bank','commbank':'commonwealth bank',
  'netbank':'commonwealth bank','cba ':'commonwealth bank',
  'westpac bank':'westpac','westpac':'westpac',
  'national aust':'nab','nab ':'nab',
  'anz bank':'anz','anz ':'anz',
  'macquarie bank':'macquarie','macquarie ':'macquarie',
  'ing direct':'ing','ing ':'ing',
  'st george':'st george bank','bankwest':'bankwest',
  'bendigo bank':'bendigo bank','suncorp bank':'suncorp','suncorp':'suncorp',
  'up bank':'up bank','revolut':'revolut',
  'transferwise':'wise','wise ':'wise',
  'paypal*':'paypal','pp*':'paypal','paypal':'paypal',
  'after pay':'afterpay','afterpay':'afterpay',
  'zipmoney':'zip money','zippay':'zip money','zip ':'zip money',
  'commsec':'commsec','selfwealth':'selfwealth','pearler':'pearler',
  'raiz ':'raiz invest','spaceship':'spaceship invest',
  'vanguard':'vanguard','betashares':'betashares','stake ':'stake',
  'coinspot':'coinspot','coinbase':'coinbase','binance':'binance','swyftx':'swyftx',
  // Insurance
  'nrma insur':'nrma','nrma ':'nrma','racv ':'racv','racq ':'racq','rac ':'rac wa',
  'aami ':'aami','allianz aust':'allianz','allianz':'allianz',
  'budget direct':'budget direct','real insurance':'real insurance',
  'youi ':'youi','qbe ':'qbe insurance','gio insurance':'gio','gio ':'gio',
  // Government
  'aus tax off':'australian tax office','ato ':'australian tax office',
  'services aust':'centrelink','centrelink':'centrelink','medicare':'medicare',
  'revenue nsw':'revenue nsw','vic roads':'vicroads','vicroads':'vicroads',
  'service nsw':'service nsw','transport nsw':'transport nsw',
  'roads and mar':'rms nsw','rms ':'rms nsw',
  'australia post':'australia post','auspost':'australia post',
  'aus post':'australia post','ap ':'australia post',
  // Home & garden
  'fantastic furn':'fantastic furniture','nick scali':'nick scali',
  'amart furn':'amart furniture','amart ':'amart furniture',
  'beacon light':'beacon lighting','freedom furn':'freedom furniture',
  'freedom ':'freedom furniture','temple & webster':'temple and webster',
  'temple&webster':'temple and webster','wayfair':'wayfair',
  // Automotive
  'supercheap':'supercheap auto','super cheap':'supercheap auto','sca ':'supercheap auto',
  'repco ':'repco','autobarn':'autobarn','midas ':'midas',
  'ultratune':'ultra tune','ultra tune':'ultra tune',
  'bridgestone':'bridgestone','tyreright':'tyreright',
  // Specific variants
  'ampolfoodary':'ampol foodary','toyota motor':'chatswood toyota',
  'crystal carwash':'crystal car wash','fmc park':'fmc parking',
  'roads maritime':'roads maritime services e toll',
  'rms e-toll':'roads maritime services e toll',
  'e-toll nsw':'roads maritime services e toll',
  'syd airport park':'sydney airport parking','sydney airport car':'sydney airport parking',
  'taxipay':'taxipay australia','taxi pay':'taxipay australia',
  'uber* cash':'uber cash','uber one':'uber one membership',
  'uber pass':'uber one membership',
  'wilsons parking':'wilson parking','wilson park':'wilson parking',
  // Children
  'baby bunt':'baby bunting','babybunting':'baby bunting',
  'yoto player':'sp yoto australi','yoto ':'sp yoto australi',
  // Fitness
  'ezi*fit':'ezi*fit health club','ezifit':'ezi*fit health club',
  'ezi fit':'ezi*fit health club',
  'body fit training':'from body fit trainin','bft fitness':'from body fit trainin',
  'bft ':'from body fit trainin','fit health club':'from fit health club',
  // Home variants
  'deft payment':'deft strata','deft insure':'deft insurance',
  'red energy pty':'red energy',
  // Insurance variants
  'metlife':'from metlife','met life':'from metlife','pay stay':'paystay',
  // Pets
  'pet barn':'petbarn','petbarn au':'petbarn','pet sure':'petsure',
  'scratch pet':'scratch dog food','scratchpetfood':'scratch dog food',
  'pawtion':'sp pawtion pet food','the dog parlour':'sq *the dog parlour',
  'dog parlour':'sq *the dog parlour',
  // Shopping
  'amazon gc':'amazon gift card','amazon gift':'amazon gift card',
  'cancer council':'cancer council daffodil day',
  'daffodil day':'cancer council daffodil day',
  'haighs':"sq *haigh's chatswood","haigh's chocolates":"sq *haigh's chatswood",
  "sq *haighs":"sq *haigh's chatswood",
  'lifeline au':'lifeline harbour',
  'jb gift card':'jb hi-fi gift card','jbhifi gift':'jb hi-fi gift card',
  'vinnies':'st vincent de paul','st vinnies':'st vincent de paul',
  'st vincents de paul':'st vincent de paul',
  'tennis aus':'tennis australia','tennis aust':'tennis australia',
  'uber eats gc':'uber eats gift card','uber gift':'uber eats gift card',
  // Woolworths variants
  'woolworths everyday':'woolworths everyday extra',
  'ww everyday extra':'woolworths everyday extra',
  'woolworths.com.au':'woolworths online','woolies online':'woolworths online',
  'ww gift card':'woolworths gift card','woolworths gc':'woolworths gift card',
  // Health & beauty variants
  'blooms pharmacy':'blooms chemist','medicare aust':'medicare benefits',
  // Travel variants
  '1cover':'1cover com au','1cover travel':'1cover com au',
  'airbnb.com':'airbnb','air bnb':'airbnb',
  // Tax
  'bpay ato':'bpay tax office','tax office bpay':'bpay tax office',
  // Payment processor prefixes (strip and re-match remainder)
  'afterpay *':'_strip_prefix','via paypal':'_strip_prefix',
  'paypal *':'_strip_prefix','apple pay':'_strip_prefix',
  'goog *':'_strip_prefix','zip *':'_strip_prefix',
  'pp *':'_strip_prefix','sp *':'_strip_prefix','sq *':'_strip_prefix'
};

// ── Alias key sorting & resolution ───────────────────────────
var SORTED_ALIAS_KEYS = null;

function initAliasKeys() {
  SORTED_ALIAS_KEYS = Object.keys(MERCHANT_ALIASES).sort(function(a, b) {
    return b.length - a.length;
  });
}

function resolveAlias(preprocessed) {
  if (!SORTED_ALIAS_KEYS) initAliasKeys();
  for (var i = 0; i < SORTED_ALIAS_KEYS.length; i++) {
    var key = SORTED_ALIAS_KEYS[i];
    if (preprocessed.indexOf(key) === 0) {
      var resolved = MERCHANT_ALIASES[key];
      if (resolved === '_strip_prefix') {
        var remainder = preprocessed.slice(key.length).trim();
        return resolveAlias(remainder) || remainder;
      }
      return resolved;
    }
  }
  return preprocessed;
}

// ── Seed rules from real transaction data ─────────────────────
var SEED_VERSION = '2026-09-27-v1';

var SEED_LRULES = {
  // Business Costs
  'apple':                        { catId:'business',          subcat:'Website and Digital',     pattern:'exact',    source:'manual', confidence:'HIGH' },
  'godaddy':                      { catId:'business',          subcat:'Website and Digital',     pattern:'exact',    source:'manual', confidence:'HIGH' },
  'google g suite':               { catId:'business',          subcat:'Website and Digital',     pattern:'exact',    source:'manual', confidence:'HIGH' },
  'google workspace openf sydney':{ catId:'business',          subcat:'Website and Digital',     pattern:'contains', source:'manual', confidence:'HIGH' },
  'sqsp* websit':                 { catId:'business',          subcat:'Website and Digital',     pattern:'contains', source:'manual', confidence:'HIGH' },
  // Bonus — employee share plan (RSU) sale proceeds are pay arriving as cash, not a capital gain
  'from citibank morgan stanley smi':{ catId:'bonus',          subcat:'Work Bonus',             pattern:'contains', source:'manual', confidence:'HIGH' },
  // Car & Transport
  '7-eleven':                     { catId:'car_transport',     subcat:'Petrol',                  pattern:'exact',    source:'manual', confidence:'HIGH', amountThresholds:[{maxAmount:10,catId:'food_eating_out',subcat:'Cafe and Lunches'},{maxAmount:80,catId:'car_transport',subcat:'Petrol'}] },
  'ampol foodary':                { catId:'car_transport',     subcat:'Petrol',                  pattern:'contains', source:'manual', confidence:'HIGH' },
  'bp':                           { catId:'car_transport',     subcat:'Petrol',                  pattern:'contains', source:'manual', confidence:'HIGH', amountThresholds:[{maxAmount:10,catId:'food_eating_out',subcat:'Cafe and Lunches'}] },
  'bp artarmon':                  { catId:'car_transport',     subcat:'Petrol',                  pattern:'contains', source:'manual', confidence:'HIGH' },
  'bp lane cove':                 { catId:'car_transport',     subcat:'Petrol',                  pattern:'contains', source:'manual', confidence:'HIGH' },
  'bp melbourne airport':         { catId:'car_transport',     subcat:'Petrol',                  pattern:'exact',    source:'manual', confidence:'HIGH' },
  'bp naremburn':                 { catId:'car_transport',     subcat:'Petrol',                  pattern:'contains', source:'manual', confidence:'HIGH' },
  'bp northwood':                 { catId:'car_transport',     subcat:'Petrol',                  pattern:'contains', source:'manual', confidence:'HIGH' },
  'bp willoughby':                { catId:'car_transport',     subcat:'Petrol',                  pattern:'contains', source:'manual', confidence:'HIGH' },
  'chatswood toyota':             { catId:'car_transport',     subcat:'Car Servicing',           pattern:'contains', source:'manual', confidence:'HIGH' },
  'crystal car wash':             { catId:'car_transport',     subcat:'Car Cleaning',            pattern:'contains', source:'manual', confidence:'HIGH' },
  'fmc parking':                  { catId:'car_transport',     subcat:'Car Parking',             pattern:'contains', source:'manual', confidence:'HIGH' },
  'linkt':                        { catId:'car_transport',     subcat:'Tolls',                   pattern:'exact',    source:'manual', confidence:'HIGH' },
  'nrma':                         { catId:'insurance_utilities',subcat:'Car Insurance',          pattern:'exact',    source:'manual', confidence:'HIGH' },
  'roads maritime services e toll':{ catId:'car_transport',   subcat:'Tolls',                   pattern:'contains', source:'manual', confidence:'HIGH' },
  'taxipay australia':            { catId:'car_transport',     subcat:'Ubers and Taxis',         pattern:'exact',    source:'manual', confidence:'HIGH' },
  'uber one membership':          { catId:'car_transport',     subcat:'Ubers and Taxis',         pattern:'exact',    source:'manual', confidence:'HIGH' },
  'uber cash':                    { catId:'car_transport',     subcat:'Ubers and Taxis',         pattern:'contains', source:'manual', confidence:'HIGH' },
  'uber':                         { catId:'car_transport',     subcat:'Ubers and Taxis',         pattern:'exact',    source:'manual', confidence:'HIGH' },
  'wilson parking':               { catId:'car_transport',     subcat:'Car Parking',             pattern:'contains', source:'manual', confidence:'HIGH' },
  'sydney airport parking':       { catId:'car_transport',     subcat:'Car Parking',             pattern:'exact',    source:'manual', confidence:'HIGH' },
  // Children
  'baby bunting':                 { catId:'children',          subcat:'Other Children Expenses', pattern:'contains', source:'manual', confidence:'HIGH' },
  'carlile swimming':             { catId:'children',          subcat:'Children Activities',     pattern:'contains', source:'manual', confidence:'HIGH' },
  'from savings account childcare':{ catId:'children',         subcat:'Childcare',               pattern:'contains', source:'manual', confidence:'HIGH' },
  'ku osborne park presch lane cove':{ catId:'children',       subcat:'Childcare',               pattern:'contains', source:'manual', confidence:'HIGH' },
  'little sparrow co':            { catId:'children',          subcat:'Other Children Expenses', pattern:'contains', source:'manual', confidence:'HIGH' },
  'sp yoto australi':             { catId:'children',          subcat:'Toys and Presents',       pattern:'contains', source:'manual', confidence:'HIGH' },
  'to lane cove out of school inc':{ catId:'children',         subcat:'Children Activities',     pattern:'contains', source:'manual', confidence:'HIGH' },
  'to tree of life early learning':{ catId:'children',         subcat:'Childcare',               pattern:'contains', source:'manual', confidence:'HIGH' },
  // Entertainment
  'amazon prime':                 { catId:'entertainment',     subcat:'Amazon Prime',            pattern:'exact',    source:'manual', confidence:'HIGH' },
  'binge':                        { catId:'entertainment',     subcat:'Other Entertainment',     pattern:'exact',    source:'manual', confidence:'HIGH' },
  'disney':                       { catId:'entertainment',     subcat:'Other Entertainment',     pattern:'exact',    source:'manual', confidence:'HIGH' },
  'disney plus':                  { catId:'entertainment',     subcat:'Other Entertainment',     pattern:'exact',    source:'manual', confidence:'HIGH' },
  'foxtel':                       { catId:'entertainment',     subcat:'Other Entertainment',     pattern:'exact',    source:'manual', confidence:'HIGH' },
  'kayo sports':                  { catId:'entertainment',     subcat:'Other Entertainment',     pattern:'exact',    source:'manual', confidence:'HIGH' },
  'netflix':                      { catId:'entertainment',     subcat:'Netflix',                 pattern:'exact',    source:'manual', confidence:'HIGH' },
  'paramount plus':               { catId:'entertainment',     subcat:'Other Entertainment',     pattern:'exact',    source:'manual', confidence:'HIGH' },
  'spotify':                      { catId:'entertainment',     subcat:'Other Entertainment',     pattern:'exact',    source:'manual', confidence:'HIGH' },
  'stan':                         { catId:'entertainment',     subcat:'Other Entertainment',     pattern:'exact',    source:'manual', confidence:'HIGH' },
  'youtube premium':              { catId:'entertainment',     subcat:'Other Entertainment',     pattern:'exact',    source:'manual', confidence:'HIGH' },
  // Fitness
  'clublinks':                    { catId:'fitness',           subcat:'Other Fitness',           pattern:'contains', source:'manual', confidence:'HIGH' },
  'ezi*fit health club':          { catId:'fitness',           subcat:'Gym Memberships',         pattern:'contains', source:'manual', confidence:'HIGH' },
  'from body fit trainin':        { catId:'fitness',           subcat:'Gym Memberships',         pattern:'contains', source:'manual', confidence:'HIGH' },
  'from fit health club':         { catId:'fitness',           subcat:'Gym Memberships',         pattern:'contains', source:'manual', confidence:'HIGH' },
  'golf start house':             { catId:'fitness',           subcat:'Other Fitness',           pattern:'contains', source:'manual', confidence:'HIGH' },
  'northbridge golf club':        { catId:'fitness',           subcat:'Other Fitness',           pattern:'contains', source:'manual', confidence:'HIGH' },
  'personal training':            { catId:'fitness',           subcat:'Personal Training',       pattern:'contains', source:'manual', confidence:'HIGH' },
  // Food & Eating Out
  '5 loaves 2 fish neutral bay':  { catId:'food_eating_out',   subcat:'Cafe and Lunches',        pattern:'contains', source:'manual', confidence:'HIGH' },
  'barrel one pty ltd lane cove': { catId:'food_eating_out',   subcat:'Groceries',               pattern:'contains', source:'manual', confidence:'HIGH' },
  'bathers pav bistro mosman':    { catId:'food_eating_out',   subcat:'Eating Out (Cafes, Restaurant Food)', pattern:'contains', source:'manual', confidence:'HIGH' },
  'bellota wine bar':             { catId:'food_eating_out',   subcat:'Eating Out (Cafes, Restaurant Food)', pattern:'exact',    source:'manual', confidence:'HIGH' },
  'birdwood cafe':                { catId:'food_eating_out',   subcat:'Cafe and Lunches',        pattern:'exact',    source:'manual', confidence:'HIGH' },
  'bws lane cove':                { catId:'food_eating_out',   subcat:'Alcohol and Bars',        pattern:'contains', source:'manual', confidence:'HIGH' },
  'cafe reverse willoughby':      { catId:'food_eating_out',   subcat:'Cafe and Lunches',        pattern:'contains', source:'manual', confidence:'HIGH' },
  'coles':                        { catId:'food_eating_out',   subcat:'Groceries',               pattern:'contains', source:'manual', confidence:'HIGH', amountThresholds:[{maxAmount:15,catId:'food_eating_out',subcat:'Cafe and Lunches'}] },
  'eat n chill cafe':             { catId:'food_eating_out',   subcat:'Cafe and Lunches',        pattern:'exact',    source:'manual', confidence:'HIGH' },
  'eighty ate':                   { catId:'food_eating_out',   subcat:'Eating Out (Cafes, Restaurant Food)', pattern:'exact',    source:'manual', confidence:'HIGH' },
  'grill d':                      { catId:'food_eating_out',   subcat:'Eating Out (Cafes, Restaurant Food)', pattern:'contains', source:'manual', confidence:'HIGH' },
  'harris farm markets':          { catId:'food_eating_out',   subcat:'Groceries',               pattern:'contains', source:'manual', confidence:'HIGH' },
  "hester s cafe":                { catId:'food_eating_out',   subcat:'Cafe and Lunches',        pattern:'exact',    source:'manual', confidence:'HIGH' },
  'kana sushi crows nest':        { catId:'food_eating_out',   subcat:'Eating Out (Cafes, Restaurant Food)', pattern:'contains', source:'manual', confidence:'HIGH' },
  'lane cove sushi bar':          { catId:'food_eating_out',   subcat:'Eating Out (Cafes, Restaurant Food)', pattern:'contains', source:'manual', confidence:'HIGH' },
  'lane cove thai eatery':        { catId:'food_eating_out',   subcat:'Eating Out (Cafes, Restaurant Food)', pattern:'contains', source:'manual', confidence:'HIGH' },
  'lawson tokyo':                 { catId:'food_eating_out',   subcat:'Cafe and Lunches',        pattern:'contains', source:'manual', confidence:'HIGH' },
  'liquorland':                   { catId:'food_eating_out',   subcat:'Alcohol and Bars',        pattern:'contains', source:'manual', confidence:'HIGH' },
  'north district cafe mater hospital':{ catId:'food_eating_out', subcat:'Cafe and Lunches',    pattern:'exact',    source:'manual', confidence:'HIGH' },
  'olea cafe bar bistro':         { catId:'food_eating_out',   subcat:'Eating Out (Cafes, Restaurant Food)', pattern:'contains', source:'manual', confidence:'HIGH' },
  'public dining room':           { catId:'food_eating_out',   subcat:'Eating Out (Cafes, Restaurant Food)', pattern:'exact',    source:'manual', confidence:'HIGH' },
  'puppy tail cafe':              { catId:'food_eating_out',   subcat:'Cafe and Lunches',        pattern:'exact',    source:'manual', confidence:'HIGH' },
  'qantas wine':                  { catId:'food_eating_out',   subcat:'Alcohol and Bars',        pattern:'contains', source:'manual', confidence:'HIGH' },
  'qe foodstores':                { catId:'food_eating_out',   subcat:'Groceries',               pattern:'contains', source:'manual', confidence:'HIGH' },
  'romeos iga food hall':         { catId:'food_eating_out',   subcat:'Groceries',               pattern:'contains', source:'manual', confidence:'HIGH' },
  'sp activate foods erina':      { catId:'food_eating_out',   subcat:'Other Food Expense',      pattern:'contains', source:'manual', confidence:'HIGH' },
  'story espresso bar lane cove': { catId:'food_eating_out',   subcat:'Cafe and Lunches',        pattern:'contains', source:'manual', confidence:'HIGH' },
  'sunset diner':                 { catId:'food_eating_out',   subcat:'Eating Out (Cafes, Restaurant Food)', pattern:'contains', source:'manual', confidence:'HIGH' },
  'sushi maru lane cove':         { catId:'food_eating_out',   subcat:'Eating Out (Cafes, Restaurant Food)', pattern:'contains', source:'manual', confidence:'HIGH' },
  'sushi naya lane cove':         { catId:'food_eating_out',   subcat:'Cafe and Lunches',        pattern:'contains', source:'manual', confidence:'HIGH' },
  'sushi square lane cove':       { catId:'food_eating_out',   subcat:'Eating Out (Cafes, Restaurant Food)', pattern:'contains', source:'manual', confidence:'HIGH' },
  'tamon sushi':                  { catId:'food_eating_out',   subcat:'Eating Out (Cafes, Restaurant Food)', pattern:'contains', source:'manual', confidence:'HIGH' },
  'the grounds coffee factory':   { catId:'food_eating_out',   subcat:'Cafe and Lunches',        pattern:'exact',    source:'manual', confidence:'HIGH' },
  'the junction cafe lane cove':  { catId:'food_eating_out',   subcat:'Cafe and Lunches',        pattern:'contains', source:'manual', confidence:'HIGH' },
  'the library cafe north sydney':{ catId:'food_eating_out',   subcat:'Cafe and Lunches',        pattern:'exact',    source:'manual', confidence:'HIGH' },
  'the neutral bay club':         { catId:'food_eating_out',   subcat:'Alcohol and Bars',        pattern:'contains', source:'manual', confidence:'HIGH' },
  'toby s estate coffee chippendale':{ catId:'food_eating_out',subcat:'Cafe and Lunches',        pattern:'contains', source:'manual', confidence:'HIGH' },
  'true protein':                 { catId:'food_eating_out',   subcat:'Other Food Expense',      pattern:'exact',    source:'manual', confidence:'HIGH' },
  'uber eats':                    { catId:'food_eating_out',   subcat:'Uber Eats and Delivery',  pattern:'exact',    source:'manual', confidence:'HIGH' },
  'veloce espresso':              { catId:'food_eating_out',   subcat:'Cafe and Lunches',        pattern:'exact',    source:'manual', confidence:'HIGH' },
  'willoughby fresh':             { catId:'food_eating_out',   subcat:'Groceries',               pattern:'contains', source:'manual', confidence:'HIGH' },
  'woolworths':                   { catId:'food_eating_out',   subcat:'Groceries',               pattern:'contains', source:'manual', confidence:'HIGH', amountThresholds:[{maxAmount:12,catId:'food_eating_out',subcat:'Cafe and Lunches'}] },
  'woolworths everyday extra':    { catId:'food_eating_out',   subcat:'Other Food Expense',      pattern:'exact',    source:'manual', confidence:'HIGH' },
  'woolworths gift card':         { catId:'food_eating_out',   subcat:'Groceries',               pattern:'exact',    source:'manual', confidence:'HIGH' },
  'woolworths online':            { catId:'food_eating_out',   subcat:'Groceries',               pattern:'exact',    source:'manual', confidence:'HIGH' },
  'zkk espresso':                 { catId:'food_eating_out',   subcat:'Cafe and Lunches',        pattern:'exact',    source:'manual', confidence:'HIGH' },
  // Health & Beauty
  'adore beauty':                 { catId:'health_beauty',     subcat:'Nails, Beauty & Other Errands', pattern:'exact',    source:'manual', confidence:'HIGH' },
  'andrew lau dental':            { catId:'health_beauty',     subcat:'Doctors, Health, Specialists', pattern:'contains', source:'manual', confidence:'HIGH' },
  'baipoh thai remedy':           { catId:'health_beauty',     subcat:'Nails, Beauty & Other Errands', pattern:'contains', source:'manual', confidence:'HIGH' },
  'barber empire':                { catId:'health_beauty',     subcat:'Haircuts',                pattern:'contains', source:'manual', confidence:'HIGH' },
  'beauty by rachel':             { catId:'health_beauty',     subcat:'Nails, Beauty & Other Errands', pattern:'contains', source:'manual', confidence:'HIGH' },
  'blooms chemist':               { catId:'health_beauty',     subcat:'Pharmacy',                pattern:'contains', source:'manual', confidence:'HIGH' },
  'blooms the chemist':           { catId:'health_beauty',     subcat:'Pharmacy',                pattern:'contains', source:'manual', confidence:'HIGH' },
  'chemist warehouse':            { catId:'health_beauty',     subcat:'Pharmacy',                pattern:'contains', source:'manual', confidence:'HIGH', amountThresholds:[{maxAmount:30,catId:'health_beauty',subcat:'Pharmacy'}] },
  'crows nest thai massag':       { catId:'health_beauty',     subcat:'Nails, Beauty & Other Errands', pattern:'contains', source:'manual', confidence:'HIGH' },
  'day night chemist':            { catId:'health_beauty',     subcat:'Pharmacy',                pattern:'contains', source:'manual', confidence:'HIGH' },
  'freya nails and beauty':       { catId:'health_beauty',     subcat:'Nails, Beauty & Other Errands', pattern:'contains', source:'manual', confidence:'HIGH' },
  'from grand united - gu health':{ catId:'health_beauty',     subcat:'Doctors, Health, Specialists', pattern:'contains', source:'manual', confidence:'HIGH' },
  'from gu health d/dbt':         { catId:'insurance_utilities',subcat:'Health Insurance',       pattern:'contains', source:'manual', confidence:'HIGH' },
  'gavin starr pharmacy':         { catId:'health_beauty',     subcat:'Pharmacy',                pattern:'exact',    source:'manual', confidence:'HIGH' },
  'lane cove medical cen':        { catId:'health_beauty',     subcat:'Doctors, Health, Specialists', pattern:'contains', source:'manual', confidence:'HIGH' },
  'mater clinic physio':          { catId:'health_beauty',     subcat:'Doctors, Health, Specialists', pattern:'contains', source:'manual', confidence:'HIGH' },
  'mater clnc physiotherp':       { catId:'health_beauty',     subcat:'Doctors, Health, Specialists', pattern:'contains', source:'manual', confidence:'HIGH' },
  'medicare benefits':            { catId:'health_beauty',     subcat:'Doctors, Health, Specialists', pattern:'exact',    source:'manual', confidence:'HIGH' },
  'natural nails design':         { catId:'health_beauty',     subcat:'Nails, Beauty & Other Errands', pattern:'contains', source:'manual', confidence:'HIGH' },
  'north shore radiology':        { catId:'health_beauty',     subcat:'Doctors, Health, Specialists', pattern:'contains', source:'manual', confidence:'HIGH' },
  'nthsyd general pract':         { catId:'health_beauty',     subcat:'Doctors, Health, Specialists', pattern:'contains', source:'manual', confidence:'HIGH' },
  'nuvo specialists':             { catId:'health_beauty',     subcat:'Doctors, Health, Specialists', pattern:'contains', source:'manual', confidence:'HIGH' },
  'plineph chatswood':            { catId:'health_beauty',     subcat:'Pharmacy',                pattern:'contains', source:'manual', confidence:'HIGH' },
  'pure nail bar':                { catId:'health_beauty',     subcat:'Nails, Beauty & Other Errands', pattern:'contains', source:'manual', confidence:'HIGH' },
  'spn nails bty':                { catId:'health_beauty',     subcat:'Nails, Beauty & Other Errands', pattern:'contains', source:'manual', confidence:'HIGH' },
  'star discount chemist':        { catId:'health_beauty',     subcat:'Pharmacy',                pattern:'contains', source:'manual', confidence:'HIGH' },
  'tepid baths physio':           { catId:'health_beauty',     subcat:'Doctors, Health, Specialists', pattern:'contains', source:'manual', confidence:'HIGH' },
  'psychologist':                 { catId:'health_beauty',     subcat:'Psychologist',            pattern:'contains', source:'manual', confidence:'HIGH' },
  // Holidays & Travel
  '1cover com au':                { catId:'holidays_travel',   subcat:'Travel Insurance',        pattern:'contains', source:'manual', confidence:'HIGH' },
  'airbnb':                       { catId:'holidays_travel',   subcat:'Accommodation',           pattern:'exact',    source:'manual', confidence:'HIGH' },
  'avis':                         { catId:'holidays_travel',   subcat:'Car Rentals',             pattern:'exact',    source:'manual', confidence:'HIGH' },
  'exchange hotel vancouv':       { catId:'holidays_travel',   subcat:'Accommodation',           pattern:'contains', source:'manual', confidence:'HIGH' },
  'qantas':                       { catId:'holidays_travel',   subcat:'Flights',                 pattern:'exact',    source:'manual', confidence:'HIGH' },
  'refund from qantas mascot':    { catId:'holidays_travel',   subcat:'Flights',                 pattern:'contains', source:'manual', confidence:'HIGH' },
  // Home
  '4paws petdoor':                { catId:'home',              subcat:'House Renovations',       pattern:'exact',    source:'manual', confidence:'HIGH' },
  'ajb kitchens':                 { catId:'home',              subcat:'House Renovations',       pattern:'contains', source:'manual', confidence:'HIGH' },
  'betta industries':             { catId:'home',              subcat:'House Renovations',       pattern:'contains', source:'manual', confidence:'HIGH' },
  'bunnings':                     { catId:'home',              subcat:'Home Improvements',       pattern:'contains', source:'manual', confidence:'HIGH' },
  'crows nest dry clean':         { catId:'home',              subcat:'House Cleaning',          pattern:'contains', source:'manual', confidence:'HIGH' },
  'deft strata':                  { catId:'home',              subcat:'Strata Fees',             pattern:'exact',    source:'manual', confidence:'HIGH' },
  'from ailo pay':                { catId:'home',              subcat:'Mortgage Repayments',     pattern:'contains', source:'manual', confidence:'HIGH' },
  'hardware & general':           { catId:'home',              subcat:'Maintenance',             pattern:'contains', source:'manual', confidence:'HIGH' },
  'harvey norman':                { catId:'home',              subcat:'House Renovations',       pattern:'contains', source:'manual', confidence:'HIGH' },
  'payment by authority to westpac':{ catId:'home',           subcat:'Mortgage Repayments',     pattern:'contains', source:'manual', confidence:'HIGH' },
  'the laundry lady':             { catId:'home',              subcat:'House Cleaning',          pattern:'contains', source:'manual', confidence:'HIGH' },
  'to red energy online payment': { catId:'utilities',         subcat:'Power Bill',              pattern:'contains', source:'manual', confidence:'HIGH' },
  'house cleaning':               { catId:'home',              subcat:'House Cleaning',          pattern:'contains', source:'manual', confidence:'HIGH' },
  'withdrawal mobile bpay deft payme strata':{ catId:'home',  subcat:'Strata Fees',             pattern:'contains', source:'manual', confidence:'HIGH' },
  // Utilities (power/water/phone live here)
  'energyaustralia':              { catId:'utilities',         subcat:'Power Bill',              pattern:'exact',    source:'manual', confidence:'HIGH' },
  'red energy':                   { catId:'utilities',         subcat:'Power Bill',              pattern:'exact',    source:'manual', confidence:'HIGH' },
  'sydney water':                 { catId:'utilities',         subcat:'Water Rates',             pattern:'contains', source:'manual', confidence:'HIGH' },
  'vodafone':                     { catId:'utilities',         subcat:'Mobile Phone Bills',      pattern:'exact',    source:'manual', confidence:'HIGH' },
  // Insurance
  'deft insurance':               { catId:'insurance_utilities', subcat:'Other Insurance',       pattern:'exact',    source:'manual', confidence:'HIGH' },
  'from metlife':                 { catId:'insurance_utilities', subcat:'Life & Income Insurance', pattern:'contains', source:'manual', confidence:'HIGH' },
  'paystay':                      { catId:'insurance_utilities', subcat:'Other Insurance',       pattern:'exact',    source:'manual', confidence:'HIGH' },
  // Pets
  '4 paws vet neutral bay':       { catId:'pippen',            subcat:'Vet Bills',               pattern:'contains', source:'manual', confidence:'HIGH' },
  'advanced vet lane cove':       { catId:'pippen',            subcat:'Vet Bills',               pattern:'contains', source:'manual', confidence:'HIGH' },
  'petbarn':                      { catId:'pippen',            subcat:'Pet Food',                pattern:'contains', source:'manual', confidence:'HIGH' },
  'petsure':                      { catId:'pippen',            subcat:'Pet Insurance',           pattern:'exact',    source:'manual', confidence:'HIGH' },
  'scratch dog food':             { catId:'pippen',            subcat:'Pet Food',                pattern:'contains', source:'manual', confidence:'HIGH' },
  'sp pawtion pet food':          { catId:'pippen',            subcat:'Pet Food',                pattern:'contains', source:'manual', confidence:'HIGH' },
  'sq *the dog parlour':          { catId:'pippen',            subcat:'Dog Grooming',            pattern:'contains', source:'manual', confidence:'HIGH' },
  // Salary
  'salary from mastercard payro': { catId:'salary',            subcat:'Regular Pay',             pattern:'contains', source:'manual', confidence:'HIGH' },
  // Shopping
  'amazon':                       { catId:'shopping',          subcat:'Online Shopping',         pattern:'exact',    source:'manual', confidence:'HIGH' },
  'amazon gift card':             { catId:'shopping',          subcat:'Gifts',                   pattern:'exact',    source:'manual', confidence:'HIGH' },
  'bridgeclimb sydney':           { catId:'shopping',          subcat:'Gifts',                   pattern:'contains', source:'manual', confidence:'HIGH' },
  'cancer council daffodil day':  { catId:'shopping',          subcat:'Donations',               pattern:'exact',    source:'manual', confidence:'HIGH' },
  'coffee parts':                 { catId:'shopping',          subcat:'Home Shopping',           pattern:'exact',    source:'manual', confidence:'HIGH' },
  'cosmos florist':               { catId:'shopping',          subcat:'Gifts',                   pattern:'contains', source:'manual', confidence:'HIGH' },
  'david jones':                  { catId:'shopping',          subcat:'Clothing & Shopping',     pattern:'contains', source:'manual', confidence:'HIGH' },
  'flawless flowers':             { catId:'shopping',          subcat:'Gifts',                   pattern:'contains', source:'manual', confidence:'HIGH' },
  'heinemann duty free':          { catId:'shopping',          subcat:'Gifts',                   pattern:'contains', source:'manual', confidence:'HIGH' },
  'hot dollar':                   { catId:'shopping',          subcat:'Home Shopping',           pattern:'contains', source:'manual', confidence:'HIGH' },
  'ikea':                         { catId:'shopping',          subcat:'Home Shopping',           pattern:'contains', source:'manual', confidence:'HIGH' },
  'jb hi fi':                     { catId:'shopping',          subcat:'Home Shopping',           pattern:'contains', source:'manual', confidence:'HIGH' },
  'jb hi-fi gift card':           { catId:'shopping',          subcat:'Home Shopping',           pattern:'exact',    source:'manual', confidence:'HIGH' },
  'kmart':                        { catId:'shopping',          subcat:'Clothing & Shopping',     pattern:'contains', source:'manual', confidence:'HIGH', amountThresholds:[{maxAmount:20,catId:'shopping',subcat:'Clothing & Shopping'}] },
  'lifeline harbour':             { catId:'shopping',          subcat:'Donations',               pattern:'contains', source:'manual', confidence:'HIGH' },
  'mayfarm flowers':              { catId:'shopping',          subcat:'Gifts',                   pattern:'exact',    source:'manual', confidence:'HIGH' },
  'odd petal florist':            { catId:'shopping',          subcat:'Gifts',                   pattern:'contains', source:'manual', confidence:'HIGH' },
  'officeworks':                  { catId:'shopping',          subcat:'Home Shopping',           pattern:'contains', source:'manual', confidence:'HIGH' },
  'rebel sport':                  { catId:'shopping',          subcat:'Clothing & Shopping',     pattern:'contains', source:'manual', confidence:'HIGH' },
  'sarah and sebastian':          { catId:'shopping',          subcat:'Gifts',                   pattern:'contains', source:'manual', confidence:'HIGH' },
  "sq *haigh's chatswood":        { catId:'shopping',          subcat:'Gifts',                   pattern:'contains', source:'manual', confidence:'HIGH' },
  'sq *rotary club':              { catId:'shopping',          subcat:'Donations',               pattern:'contains', source:'manual', confidence:'HIGH' },
  'st vincent de paul':           { catId:'shopping',          subcat:'Donations',               pattern:'contains', source:'manual', confidence:'HIGH' },
  'target':                       { catId:'shopping',          subcat:'Clothing & Shopping',     pattern:'contains', source:'manual', confidence:'HIGH' },
  'tennis australia':             { catId:'shopping',          subcat:'Clothing & Shopping',     pattern:'exact',    source:'manual', confidence:'HIGH' },
  'the iconic':                   { catId:'shopping',          subcat:'Online Shopping',         pattern:'exact',    source:'manual', confidence:'HIGH' },
  'uber eats gift card':          { catId:'shopping',          subcat:'Gifts',                   pattern:'exact',    source:'manual', confidence:'HIGH' },
  'uniqlo':                       { catId:'shopping',          subcat:'Clothing & Shopping',     pattern:'contains', source:'manual', confidence:'HIGH' },
  'watermark books cafe':         { catId:'shopping',          subcat:'Gifts',                   pattern:'exact',    source:'manual', confidence:'HIGH' },
  // Tax
  'bpay tax office':              { catId:'tax',               subcat:'Income Tax',              pattern:'contains', source:'manual', confidence:'HIGH' },
  // BPAY billers
  'deft':                         { catId:'home',              subcat:'Strata Fees',             pattern:'contains', source:'manual', confidence:'HIGH' },
  'origin energy bpay':           { catId:'utilities',         subcat:'Power Bill',              pattern:'contains', source:'manual', confidence:'HIGH' },
  'agl bpay':                     { catId:'utilities',         subcat:'Power Bill',              pattern:'contains', source:'manual', confidence:'HIGH' },
  'energyaustralia bpay':         { catId:'utilities',         subcat:'Power Bill',              pattern:'contains', source:'manual', confidence:'HIGH' },
  'sydney water bpay':            { catId:'utilities',         subcat:'Water Rates',             pattern:'contains', source:'manual', confidence:'HIGH' },
  'council rates':                { catId:'home',              subcat:'Council Rates',           pattern:'contains', source:'manual', confidence:'HIGH' },
  'tax office':                   { catId:'tax',               subcat:'Income Tax',              pattern:'contains', source:'manual', confidence:'HIGH' },
  'ato':                          { catId:'tax',               subcat:'Income Tax',              pattern:'contains', source:'manual', confidence:'HIGH' },
  'telstra bpay':                 { catId:'utilities',         subcat:'Mobile Phone Bills',      pattern:'contains', source:'manual', confidence:'HIGH' },
  'optus bpay':                   { catId:'utilities',         subcat:'Mobile Phone Bills',      pattern:'contains', source:'manual', confidence:'HIGH' },
  'vodafone bpay':                { catId:'utilities',         subcat:'Mobile Phone Bills',      pattern:'contains', source:'manual', confidence:'HIGH' },
  'nrma bpay':                    { catId:'insurance_utilities',subcat:'Car Insurance',          pattern:'contains', source:'manual', confidence:'HIGH' }
};

function seedLRulesFromCSV() {
  var storedVersion = '';
  try { storedVersion = localStorage.getItem('cff_seed_version') || ''; } catch(e) {}
  var forceReseed = (storedVersion !== SEED_VERSION);

  // Stale pattern cleanup
  var stalePatterns = [
    /^from fit health club - \d/,
    /^from body fit trainin - ezypayid_\d/,
    /^to .{3,30} funds transfer receipt number on\d/
  ];
  var rulesModified = false;
  for (var rk in LRULES) {
    if (!LRULES.hasOwnProperty(rk)) continue;
    for (var sp = 0; sp < stalePatterns.length; sp++) {
      if (stalePatterns[sp].test(rk)) { delete LRULES[rk]; rulesModified = true; break; }
    }
  }

  var added = 0;
  var keys = Object.keys(SEED_LRULES);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var shouldSeed = !LRULES[key] || (forceReseed && LRULES[key] && !LRULES[key].userModified);
    if (shouldSeed) {
      var seed = SEED_LRULES[key];
      LRULES[key] = {
        catId: seed.catId, subcat: seed.subcat,
        pattern: seed.pattern, source: seed.source,
        confidence: seed.confidence,
        userModified: false, matchCount: 0,
        lastMatchedAt: '', createdAt: SEED_VERSION,
        amountThresholds: seed.amountThresholds || null
      };
      added++;
      rulesModified = true;
    }
  }

  if (rulesModified || forceReseed) {
    try {
      localStorage.setItem(K.rules, JSON.stringify(LRULES));
      localStorage.setItem('cff_seed_version', SEED_VERSION);
    } catch(e) { console.warn('Kelda: could not persist seeded LRULES', e); }
    if (added > 0) console.log('Kelda: seeded ' + added + ' rules (version ' + SEED_VERSION + ')');
  }
}

// ── Levenshtein distance ──────────────────────────────────────
function levenshtein(a, b) {
  var m = a.length, n = b.length, dp = [], i, j;
  for (i = 0; i <= m; i++) { dp[i] = [i]; }
  for (j = 0; j <= n; j++) { dp[0][j] = j; }
  for (i = 1; i <= m; i++) {
    for (j = 1; j <= n; j++) {
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    }
  }
  return dp[m][n];
}

// ── Two-pass LRULES matching ──────────────────────────────────
// Pass 1 (exact) then pass 2 (contains — longest key wins, 4+ char guard) for one string
function lruleHit(text, keys) {
  for (var i = 0; i < keys.length; i++) {
    if (LRULES[keys[i]].pattern === 'exact' && text === keys[i]) return { key: keys[i], confidence: 'HIGH' };
  }
  var best = null, bestLen = 0;
  for (var j = 0; j < keys.length; j++) {
    var key = keys[j];
    if (LRULES[key].pattern === 'contains' && key.length >= 4 && text.indexOf(key) === 0 && key.length > bestLen) {
      bestLen = key.length; best = key;
    }
  }
  return best ? { key: best, confidence: 'MEDIUM' } : null;
}

// context: the pre-alias description. Aliasing shortens "vanguard super" to "vanguard", so a rule
// on the full text (e.g. the user's own correction) is tried before the built-in keywords, and
// keyword exclusions are checked against the full text.
function matchLRulesNew(canonical, context) {
  if (!canonical || canonical.length < 3) return null;
  var keys = Object.keys(LRULES);
  var hit = lruleHit(canonical, keys);
  if (!hit && context && context !== canonical) hit = lruleHit(context, keys);

  if (hit) {
    var matchedKey = hit.key;
    LRULES[matchedKey].matchCount = (LRULES[matchedKey].matchCount || 0) + 1;
    LRULES[matchedKey].lastMatchedAt = new Date().toISOString().slice(0, 10);
    scheduleRulesPersist();
    return { catId: LRULES[matchedKey].catId, subcat: LRULES[matchedKey].subcat,
             matchedKey: matchedKey, confidence: hit.confidence,
             amountThresholds: LRULES[matchedKey].amountThresholds || null };
  }

  // Pass 3: keyword fallback (existing engine)
  var kwResult = (typeof AutoCat !== 'undefined' && AutoCat.matchKeywords)
    ? AutoCat.matchKeywords(canonical, false, context) : null;
  if (kwResult) return { catId: kwResult.catId, subcat: kwResult.subcat, matchedKey: null, confidence: 'LOW' };

  // Pass 4: fuzzy Levenshtein (exact rules only, >6 chars)
  if (canonical.length > 6) {
    for (var k = 0; k < keys.length; k++) {
      var fkey = keys[k];
      if (LRULES[fkey].pattern === 'exact' && fkey.length > 6 && levenshtein(canonical, fkey) <= 2) {
        LRULES[fkey].matchCount = (LRULES[fkey].matchCount || 0) + 1;
        scheduleRulesPersist();
        return { catId: LRULES[fkey].catId, subcat: LRULES[fkey].subcat, matchedKey: fkey, confidence: 'LOW' };
      }
    }
  }
  return null;
}

// ── Amount threshold override ─────────────────────────────────
function applyAmountThresholds(result, amount) {
  if (!result || !result.matchedKey) return result;
  var thresholds = result.amountThresholds;
  if (!thresholds || !thresholds.length) return result;
  var absAmt = Math.abs(Number(amount) || 0);
  for (var i = 0; i < thresholds.length; i++) {
    if (absAmt <= thresholds[i].maxAmount) {
      return { catId: thresholds[i].catId, subcat: thresholds[i].subcat,
               matchedKey: result.matchedKey, confidence: result.confidence,
               thresholdApplied: true };
    }
  }
  return result;
}

// ── Full categorisation pipeline ──────────────────────────────
function categoriseNew(rawDescription, amount, txType) {
  if (!rawDescription) return null;

  // Zero-amount guard
  if (Number(amount) === 0) return { catId:'other', subcat:'System Entry', confidence:'HIGH', source:'zero' };

  var isRefund = detectRefund(rawDescription);
  var preprocessed = preprocessMerchantString(rawDescription);
  if (!preprocessed) return null;

  // BPAY extraction
  if (preprocessed.indexOf('bpay') === 0) preprocessed = extractBpayBiller(preprocessed);

  // Exact LRULES check before alias resolution
  var directResult = matchLRulesNew(preprocessed);
  if (directResult && directResult.confidence === 'HIGH') {
    directResult = applyAmountThresholds(directResult, amount);
    return { catId: directResult.catId, subcat: directResult.subcat,
             confidence: directResult.confidence, source: 'rule', isRefund: isRefund };
  }

  // Alias resolution → canonical
  var canonical = resolveAlias(preprocessed);

  // Match on canonical
  var result = matchLRulesNew(canonical, preprocessed);
  if (!result && canonical !== preprocessed) result = directResult; // fall back to pre-alias result
  if (result) {
    result = applyAmountThresholds(result, amount);
    return { catId: result.catId, subcat: result.subcat,
             confidence: result.confidence, source: 'rule', isRefund: isRefund };
  }

  // Log miss
  logCatMiss(rawDescription, preprocessed, amount);
  return null;
}

// ── Cat miss logging ──────────────────────────────────────────
var CAT_MISSES_KEY = 'cff_cat_misses';

function logCatMiss(raw, preprocessed, amount) {
  var misses = [];
  try { misses = JSON.parse(localStorage.getItem(CAT_MISSES_KEY) || '[]'); } catch(e) { misses = []; }
  misses.push({ raw: raw, preprocessed: preprocessed,
                date: new Date().toISOString().slice(0,10), txAmount: Number(amount)||0 });
  if (misses.length > 100) misses = misses.slice(misses.length - 100);
  try { localStorage.setItem(CAT_MISSES_KEY, JSON.stringify(misses)); } catch(e) {}
}

// ── Rule write helpers ────────────────────────────────────────
function writeExactRule(preprocessed, catId, subcat) {
  var now = new Date().toISOString().slice(0, 10);
  LRULES[preprocessed] = { catId: catId, subcat: subcat, pattern: 'exact',
    source: 'manual', userModified: true, confidence: 'HIGH',
    createdAt: now, matchCount: 0, lastMatchedAt: '', amountThresholds: null };
  try { localStorage.setItem(K.rules, JSON.stringify(LRULES)); } catch(e) {}
}

function upgradeRule(preprocessed, catId, subcat) {
  if (!LRULES[preprocessed]) return;
  LRULES[preprocessed].catId = catId;
  LRULES[preprocessed].subcat = subcat;
  LRULES[preprocessed].userModified = true;
  LRULES[preprocessed].source = 'manual';
  LRULES[preprocessed].confidence = 'HIGH';
  try { localStorage.setItem(K.rules, JSON.stringify(LRULES)); } catch(e) {}
}

function writeContainsRule(key, catId, subcat) {
  if (LRULES[key] && LRULES[key].userModified) return;
  var now = new Date().toISOString().slice(0, 10);
  LRULES[key] = { catId: catId, subcat: subcat, pattern: 'contains',
    source: 'manual', userModified: true, confidence: 'HIGH',
    createdAt: now, matchCount: 0, lastMatchedAt: '', amountThresholds: null };
  try { localStorage.setItem(K.rules, JSON.stringify(LRULES)); } catch(e) {}
}

// ── Flag past transactions ────────────────────────────────────
function flagPastTransactions(ruleKey, newCatId, newSubcat, pattern, excludeTxId) {
  var pendingReviews = [];
  try { pendingReviews = JSON.parse(localStorage.getItem('cff_pending_reviews') || '[]'); } catch(e) {}
  var flagged = 0;
  for (var i = 0; i < TX.length; i++) {
    var tx = TX[i];
    if (excludeTxId && tx.id === excludeTxId) continue;
    var raw = tx.rawDescription || tx.name || '';
    var preprocessed = preprocessMerchantString(raw);
    var matches = (pattern === 'exact') ? (preprocessed === ruleKey) : (preprocessed.indexOf(ruleKey) === 0);
    if (matches && (tx.catId !== newCatId || tx.subcat !== newSubcat)) {
      var alreadyFlagged = false;
      for (var j = 0; j < pendingReviews.length; j++) {
        if (pendingReviews[j].txId === tx.id) { alreadyFlagged = true; break; }
      }
      if (!alreadyFlagged && pendingReviews.length < 200) {
        pendingReviews.push({
          txId: tx.id, rawDescription: raw, preprocessed: preprocessed,
          displayMerchant: makeDisplayMerchant(preprocessed),
          currentCatId: tx.catId || '', currentSubcat: tx.subcat || '',
          suggestedCatId: newCatId, suggestedSubcat: newSubcat,
          confidence: LRULES[ruleKey] ? (LRULES[ruleKey].confidence || 'MEDIUM') : 'MEDIUM',
          ruleKey: ruleKey, rulePattern: pattern,
          flaggedAt: new Date().toISOString(), resolution: 'pending', resolvedAt: ''
        });
        TX[i].reviewFlag = true;
        TX[i].suggestedCatId = newCatId;
        TX[i].suggestedSubcat = newSubcat;
        flagged++;
      }
    }
  }
  try {
    localStorage.setItem('cff_pending_reviews', JSON.stringify(pendingReviews));
    localStorage.setItem(K.tx, JSON.stringify(TX));
  } catch(e) {}
  return flagged;
}

// ── Manual category save — improvement engine ─────────────────
function onManualCategorySave(tx, newCatId, newSubcat) {
  var raw = tx.rawDescription || tx.name || '';
  var preprocessed = preprocessMerchantString(raw);
  if (preprocessed.length < 3) {
    tx.catId = newCatId; tx.subcat = newSubcat;
    tx.correctionSource = 'user'; tx.reviewFlag = false;
    tx.suggestedCatId = ''; tx.suggestedSubcat = '';
    return;
  }

  // Remove pending review for this tx
  try {
    var reviews = JSON.parse(localStorage.getItem('cff_pending_reviews') || '[]');
    reviews = reviews.filter(function(r) { return r.txId !== tx.id; });
    localStorage.setItem('cff_pending_reviews', JSON.stringify(reviews));
  } catch(e) {}

  // Rule conflict / update logic
  var existing = LRULES[preprocessed];
  if (existing && existing.userModified && existing.catId === newCatId && existing.subcat === newSubcat) {
    // same — no rule change needed
  } else if (existing && existing.userModified && (existing.catId !== newCatId || existing.subcat !== newSubcat)) {
    // conflict — update anyway (user intent wins)
    upgradeRule(preprocessed, newCatId, newSubcat);
  } else if (existing && !existing.userModified) {
    upgradeRule(preprocessed, newCatId, newSubcat);
  } else if (!existing) {
    writeExactRule(preprocessed, newCatId, newSubcat);
  }

  // Update transaction
  tx.catId = newCatId; tx.subcat = newSubcat;
  tx.correctionSource = 'user'; tx.reviewFlag = false;
  tx.suggestedCatId = ''; tx.suggestedSubcat = '';

  // Persist
  try { localStorage.setItem(K.tx, JSON.stringify(TX)); } catch(e) {}
  try { localStorage.setItem(K.rules, JSON.stringify(LRULES)); } catch(e) {}

  // Offer generalisation (async, non-blocking)
  setTimeout(function() { offerGeneralisation(preprocessed, newCatId, newSubcat, tx.id); }, 0);
}

// ── Generalisation engine ─────────────────────────────────────
var CHAIN_KEYWORDS = [
  'woolworths','coles','aldi','iga','bunnings','kmart','target',
  'chemist warehouse','jb hi fi','harvey norman','officeworks',
  'bp','ampol','7 eleven','7-eleven','uber','netflix','spotify','amazon',
  'qantas','jetstar','airbnb','nrma','vodafone','telstra','optus'
];

var _toastQueue = [];
var _toastActive = false;

function offerGeneralisation(preprocessed, catId, subcat, excludeTxId) {
  if (preprocessed.length <= 6) {
    flagPastTransactions(preprocessed, catId, subcat, 'exact', excludeTxId);
    return;
  }

  // Derive candidate key
  var candidateKey = null;
  for (var ci = 0; ci < CHAIN_KEYWORDS.length; ci++) {
    var ck = CHAIN_KEYWORDS[ci];
    if (preprocessed.indexOf(ck) === 0 && ck.length < preprocessed.length) {
      candidateKey = ck; break;
    }
  }
  if (!candidateKey) {
    var words = preprocessed.split(' ');
    if (words[0] && words[0].length >= 5) {
      candidateKey = words[0];
    } else if (words[0] && words[0].length <= 4 && words[1]) {
      candidateKey = words[0] + ' ' + words[1];
    }
  }

  if (!candidateKey || candidateKey.length < 4 || candidateKey === preprocessed) {
    flagPastTransactions(preprocessed, catId, subcat, 'exact', excludeTxId);
    return;
  }

  // Check dismissed
  try {
    var candidates = JSON.parse(localStorage.getItem('cff_gen_candidates') || '[]');
    for (var di = 0; di < candidates.length; di++) {
      if (candidates[di].suggestedContainsKey === candidateKey && candidates[di].dismissed) {
        flagPastTransactions(preprocessed, catId, subcat, 'exact', excludeTxId);
        return;
      }
    }
  } catch(e) {}

  // Check if already covered by userModified contains rule
  var coveringRule = LRULES[candidateKey];
  if (coveringRule && coveringRule.userModified && coveringRule.pattern === 'contains' &&
      coveringRule.catId === catId && coveringRule.subcat === subcat) {
    flagPastTransactions(candidateKey, catId, subcat, 'contains', excludeTxId);
    return;
  }

  // Count variants
  var variantCount = 0;
  for (var ti = 0; ti < TX.length; ti++) {
    var raw = TX[ti].rawDescription || TX[ti].name || '';
    var pre = preprocessMerchantString(raw);
    if (pre.indexOf(candidateKey) === 0 && TX[ti].id !== excludeTxId) variantCount++;
  }

  if (variantCount < 1) {
    flagPastTransactions(preprocessed, catId, subcat, 'exact', excludeTxId);
    return;
  }

  // Queue generalisation toast
  var alreadyQueued = false;
  for (var qi = 0; qi < _toastQueue.length; qi++) {
    if (_toastQueue[qi].candidateKey === candidateKey) { alreadyQueued = true; break; }
  }
  if (!alreadyQueued) {
    _toastQueue.push({ candidateKey: candidateKey, catId: catId, subcat: subcat,
                       excludeTxId: excludeTxId, variantCount: variantCount });
    _showNextGeneralisationToast();
  }
}

function _showNextGeneralisationToast() {
  if (_toastActive || !_toastQueue.length) return;
  _toastActive = true;
  var item = _toastQueue[0];

  var banner = document.createElement('div');
  banner.id = 'gen-toast';
  banner.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:var(--card2);border:1px solid var(--border);border-radius:var(--radius-sm);padding:14px 16px;z-index:9999;max-width:340px;width:90%;box-shadow:0 4px 20px rgba(0,0,0,.4)';
  banner.innerHTML = '<div id="gen-toast-label" style="font-size:.82rem;font-weight:600;margin-bottom:10px">Apply to all <em></em> stores? (' + item.variantCount + ' transactions)</div>'
    + '<div style="display:flex;gap:8px">'
    + '<button id="gen-apply" class="btn btn-primary btn-sm" style="flex:1">Apply</button>'
    + '<button id="gen-keep" class="btn btn-ghost btn-sm" style="flex:1">Keep exact only</button>'
    + '<button id="gen-close" class="btn btn-ghost btn-sm" style="padding:0 10px">×</button>'
    + '</div>';
  document.body.appendChild(banner);
  // Set merchant name via textContent to prevent XSS
  var emEl = banner.querySelector('#gen-toast-label em');
  if (emEl) emEl.textContent = makeDisplayMerchant(item.candidateKey);

  function dismiss() {
    var el = document.getElementById('gen-toast');
    if (el) el.parentNode.removeChild(el);
    _toastQueue.shift();
    _toastActive = false;
    setTimeout(_showNextGeneralisationToast, 300);
  }

  document.getElementById('gen-apply').onclick = function() {
    writeContainsRule(item.candidateKey, item.catId, item.subcat);
    flagPastTransactions(item.candidateKey, item.catId, item.subcat, 'contains', item.excludeTxId);
    toast('✅ Applied to all ' + makeDisplayMerchant(item.candidateKey) + ' transactions');
    dismiss();
  };
  document.getElementById('gen-keep').onclick = function() {
    _dismissGeneralisationCandidate(item.candidateKey);
    flagPastTransactions(item.candidateKey, item.catId, item.subcat, 'exact', item.excludeTxId);
    dismiss();
  };
  document.getElementById('gen-close').onclick = function() {
    _dismissGeneralisationCandidate(item.candidateKey);
    flagPastTransactions(item.candidateKey, item.catId, item.subcat, 'exact', item.excludeTxId);
    dismiss();
  };
}

function _dismissGeneralisationCandidate(key) {
  try {
    var candidates = JSON.parse(localStorage.getItem('cff_gen_candidates') || '[]');
    var found = false;
    for (var i = 0; i < candidates.length; i++) {
      if (candidates[i].suggestedContainsKey === key) { candidates[i].dismissed = true; found = true; break; }
    }
    if (!found) candidates.push({ suggestedContainsKey: key, dismissed: true, offeredAt: new Date().toISOString() });
    localStorage.setItem('cff_gen_candidates', JSON.stringify(candidates));
  } catch(e) {}
}

// ── Transfer pair detection (post-import only) ────────────────
function detectTransferPairs(transactions) {
  var WINDOW_MS = 24 * 60 * 60 * 1000;
  var candidates = [];
  var matched = {};
  var sorted = transactions.slice().sort(function(a, b) {
    return new Date(a.date) - new Date(b.date);
  });
  for (var i = 0; i < sorted.length; i++) {
    var tx = sorted[i];
    if (matched[tx.id]) continue;
    if (!tx.amount || Math.abs(tx.amount) < 1.00) continue;
    if (tx.catId === 'transfers') continue;
    if (tx.correctionSource === 'user') continue;
    var txDate = new Date(tx.date).getTime();
    var txAbs = Math.abs(tx.amount);
    for (var j = i + 1; j < sorted.length; j++) {
      var cand = sorted[j];
      if (matched[cand.id]) continue;
      if (cand.catId === 'transfers' || cand.correctionSource === 'user') continue;
      var candDate = new Date(cand.date).getTime();
      if (candDate - txDate > WINDOW_MS) break;
      var candAbs = Math.abs(cand.amount);
      var sameDisplay = (tx.name || '') === (cand.name || '') && (tx.name || '') !== '';
      if (Math.abs(txAbs - candAbs) < 0.01 && tx.amount * cand.amount < 0 && !sameDisplay) {
        candidates.push({
          debitTxId:  tx.amount < 0 ? tx.id : cand.id,
          creditTxId: tx.amount > 0 ? tx.id : cand.id,
          amount: txAbs, confidence: 'MEDIUM'
        });
        matched[tx.id] = true; matched[cand.id] = true; break;
      }
    }
  }
  return candidates;
}

function applyTransferPairs(pairs) {
  if (!pairs || !pairs.length) return;
  if (typeof sessionStorage !== 'undefined') {
    if (sessionStorage.getItem('cff_transfer_scan_done')) return;
    sessionStorage.setItem('cff_transfer_scan_done', '1');
  }
  var reviews = [];
  try { reviews = JSON.parse(localStorage.getItem('cff_pending_reviews') || '[]'); } catch(e) {}
  for (var i = 0; i < pairs.length; i++) {
    var pair = pairs[i];
    var ids = [pair.debitTxId, pair.creditTxId];
    for (var j = 0; j < ids.length; j++) {
      var existing = false;
      for (var r = 0; r < reviews.length; r++) {
        if (reviews[r].txId === ids[j]) { existing = true; break; }
      }
      if (!existing && reviews.length < 200) {
        var tx = null;
        for (var t = 0; t < TX.length; t++) { if (TX[t].id === ids[j]) { tx = TX[t]; break; } }
        if (!tx) continue;
        var raw = tx.rawDescription || tx.name || '';
        var pre = preprocessMerchantString(raw);
        reviews.push({
          txId: ids[j], rawDescription: raw, preprocessed: pre,
          displayMerchant: makeDisplayMerchant(pre),
          currentCatId: tx.catId || '', currentSubcat: tx.subcat || '',
          suggestedCatId: 'transfers', suggestedSubcat: 'Between Accounts',
          confidence: 'MEDIUM', ruleKey: 'transfer_pair_detected',
          rulePattern: 'transfer', flaggedAt: new Date().toISOString(),
          resolution: 'pending', resolvedAt: '', pairedWith: j === 0 ? pair.creditTxId : pair.debitTxId,
          amount: pair.amount
        });
        for (var ti = 0; ti < TX.length; ti++) {
          if (TX[ti].id === ids[j]) {
            TX[ti].reviewFlag = true;
            TX[ti].suggestedCatId = 'transfers';
            TX[ti].suggestedSubcat = 'Between Accounts';
          }
        }
      }
    }
  }
  try {
    localStorage.setItem('cff_pending_reviews', JSON.stringify(reviews));
    localStorage.setItem(K.tx, JSON.stringify(TX));
  } catch(e) {}
}

// ── Regression tests ──────────────────────────────────────────
function runCategorizationTests() {
  var TEST_CASES = [
    { input:'VISA PURCHASE 123456 WOOLWORTHS 5042 SYDNEY NSW', expected:'food_eating_out' },
    { input:'SPOTIFY P2W3X9 AU STOCKHOLM SE',                  expected:'entertainment' },
    { input:'UBER* EATS HELP.UBER.COM',                        expected:'food_eating_out' },
    { input:'PAYPAL *AIRBNB 402-935-7733',                     expected:'holidays_travel' },
    { input:'MACCAS GEORGE ST SYDNEY NSW 2000',                expected:'food_eating_out' },
    { input:'AMZN MKTP AU*1X9K2 AMAZON.COM',                  expected:'shopping' },
    { input:'EFTPOS COLES 3421 CHATSWOOD NSW',                 expected:'food_eating_out' },
    { input:'CARD 00-1234 COLES SUPERMARKETS',                 expected:'food_eating_out' },
    { input:'INTERNET PURCHASE AMAZON AU',                     expected:'shopping' },
    { input:'JB HI-FI SYDNEY NSW 2000',                       expected:'shopping' },
    { input:'purchase from ezi*fit health club lane cove au',  expected:'fitness' },
    { input:'from fit health club - 756391210',                expected:'fitness' },
    { input:'withdrawal mobile 4379181 bpay deft payme strata', expected:'home' },
    { input:'payment by authority to westpac bankcorp direct dr193549647', expected:'home' },
    { input:'purchase at sq *story espresso bar lane cove ns', expected:'food_eating_out' },
    { input:'purchase at blooms chemist crows nest ns',        expected:'health_beauty' },
    { input:'bunnings (artarmon)',                             expected:'home' },
    { input:'bunnings (chatswood)',                            expected:'home' },
    // Broker / exchange settlements are transfers; near-miss words and super must not match
    { input:'COMMSEC SECURITIES LTD SYDNEY',                   expected:'transfers' },
    { input:'COINSPOT PTY LTD',                                expected:'transfers' },
    { input:'BPAY VANGUARD PERSONAL INVESTOR',                 expected:'transfers' },
    { input:'VANGUARD SUPER',                                  expected:null },
    { input:'THE STAKEHOLDER CAFE',                            expected:'food_eating_out' },
    { input:'DEFINITELY DELICIOUS BAKERY',                     expected:null }
  ];

  var passed = 0; var failed = 0;
  console.group('Kelda categorisation tests');
  for (var i = 0; i < TEST_CASES.length; i++) {
    var tc = TEST_CASES[i];
    var pre = preprocessMerchantString(tc.input);
    if (pre.indexOf('bpay') === 0) pre = extractBpayBiller(pre);
    var can = resolveAlias(pre);
    var res = matchLRulesNew(can, pre) || matchLRulesNew(pre);
    var actual = res ? res.catId : null;
    var ok = actual === tc.expected;
    if (ok) { passed++; console.log('✅ ' + tc.input); }
    else { failed++; console.warn('❌ ' + tc.input + ' → pre:"' + pre + '" can:"' + can + '" got:' + actual + ' expected:' + tc.expected); }
  }
  console.log('Result: ' + passed + '/' + TEST_CASES.length + ' passed, ' + failed + ' failed');
  console.groupEnd();
}

// ══════════════════════════════════════════════════════════════
// LEGACY AutoCat MODULE — kept for backward compatibility
// categorise(), learn(), reprocess(), suggestion pill all intact
// ══════════════════════════════════════════════════════════════
var AutoCat = (function() {

  var CONF_HIGH = 'HIGH';
  var CONF_LOW  = 'LOW';
  var CONF_NONE = 'NONE';

  // ── Keyword rules ─────────────────────────────────────────
  var KEYWORD_RULES = [
    { catId:'transfers', subcat:'Loan Repayment',    keywords:['home loan','mortgage repayment','loan repayment','hl repay'] },
    { catId:'transfers', subcat:'Credit Card Payment',keywords:['credit card payment','visa payment','mastercard payment','amex payment','pay off credit','card payment'] },
    { catId:'transfers', subcat:'Savings Transfer',  keywords:['savings transfer','savings account transfer','high interest savings'] },
    { catId:'transfers', subcat:'Mortgage Offset',   keywords:['offset account','offset transfer'] },
    { catId:'transfers', subcat:'Between Accounts',  keywords:['transfer to','transfer from','trf to','trf from','tfr to','tfr from','int transfer','internal transfer','own account'] },
    { catId:'transfers', subcat:'External Transfer', keywords:['bpay','b-pay'] },
    // Broker, crypto-exchange and fund-platform settlements only move cash between the bank and an
    // investment account: a buy isn't spending and sale proceeds aren't income (gains are tracked on
    // Equity Holdings). Whole-word matching; distributions, dividends and super fall through.
    { catId:'transfers', subcat:'Investment Transfer', wholeWord:true, exclude:['stake.com','distribution','dividend'], keywords:['commsec','selfwealth','self-wealth','stake','hellostake','interactive brokers','nabtrade','etoro','pearler','moomoo','cmc markets','bell direct','raiz','stock purchase','share purchase'] },
    { catId:'transfers', subcat:'Investment Transfer', wholeWord:true, keywords:['coinbase','binance','kraken','coinspot','swyftx','btc markets','btcmarkets','independent reserve','coinjar','crypto.com','bitcoin'] },
    { catId:'transfers', subcat:'Investment Transfer', wholeWord:true, exclude:['super','distribution','dividend'], keywords:['vanguard','etf purchase','index fund','managed fund'] },
    { catId:'salary',  subcat:'Regular Pay',   keywords:['salary','payroll','pay credit','wages','paycheque','paycheck','pay run'], incomeOnly:true },
    { catId:'bonus',   subcat:'Work Bonus',    keywords:['bonus','performance pay','incentive payment'], incomeOnly:true },
    { catId:'interest',subcat:'Savings Interest',keywords:['interest credit','interest earned','savings interest','term deposit interest','offset interest'], incomeOnly:true },
    { catId:'salary',  subcat:'Regular Pay',   keywords:['centrelink','services australia','family tax benefit','child care subsidy','jobkeeper','jobseeker'], incomeOnly:true },
    { catId:'food_eating_out', subcat:'Groceries', keywords:['woolworths','woolies','coles','aldi','iga','spar','harris farm','foodworks','drakes','costco','supermarket','groceries'] },
    { catId:'food_eating_out', subcat:'Uber Eats and Delivery', keywords:['uber eats','ubereats','doordash','menulog','deliveroo','hellofresh','every plate','everyplate'] },
    { catId:'food_eating_out', subcat:'Eating Out (Cafes, Restaurant Food)', keywords:['restaurant','bistro','brasserie','dining','thai','chinese','japanese','indian','italian','sushi','ramen','pizza','pasta','mcdonalds','kfc','hungry jacks','domino','subway','nandos','red rooster','guzman','maccas'] },
    { catId:'food_eating_out', subcat:'Cafe and Lunches', keywords:['coffee','cafe','espresso','barista','starbucks','boost juice','chatime','bakers delight','flat white','latte','cappuccino'] },
    { catId:'food_eating_out', subcat:'Alcohol and Bars', keywords:['dan murphy','bws','liquorland','vintage cellars','bottle shop','wine bar','craft beer','bar ','pub ','tavern'] },
    { catId:'car_transport', subcat:'Petrol',       keywords:['caltex','bp ','shell','7eleven','7-eleven','ampol','puma energy','petrol','fuel','servo'] },
    { catId:'car_transport', subcat:'Tolls',         keywords:['linkt','e-toll','citylink','transurban','eastlink','toll road'] },
    { catId:'car_transport', subcat:'Public Transport', keywords:['opal','myki','go card','translink','public transport','train fare','bus fare'] },
    { catId:'car_transport', subcat:'Ubers and Taxis', keywords:['uber','didi','taxify','rideshare','taxi','cab'] },
    { catId:'car_transport', subcat:'Car Parking',   keywords:['parking','wilson parking','care park','secure parking'] },
    { catId:'car_transport', subcat:'Car Servicing', keywords:['mechanic','car service','auto service','tyres','tyre','midas','repco','supercheap','battery'] },
    { catId:'home', subcat:'Mortgage Repayments', keywords:['macquarie home','cba home','nab home','anz home','westpac home','home loan payment','mortgage payment'] },
    { catId:'home', subcat:'Council Rates',  keywords:['council rates','land rates','shire rates','city council','rate notice'] },
    { catId:'home', subcat:'Strata Fees',    keywords:['body corporate','strata levy','owners corp','strata management'] },
    { catId:'home', subcat:'Maintenance',    keywords:['plumber','electrician','handyman','tradesman','building maintenance','home repair','pest control','locksmith'] },
    { catId:'utilities', subcat:'Power Bill',  keywords:['agl','origin energy','energyaustralia','alinta energy','powershop','red energy','electricity','power bill','electric bill'] },
    { catId:'utilities', subcat:'Water Rates', keywords:['water rates','sydney water','yarra valley water','sa water','waternsw'] },
    { catId:'utilities', subcat:'Internet / Broadband', keywords:['nbn','internet bill','broadband','aussie broadband','iinet','tpg internet','optus broadband','dodo'] },
    { catId:'utilities', subcat:'Mobile Phone Bills', keywords:['telstra','optus','vodafone','amaysim','kogan mobile','boost mobile','mobile plan','phone bill'] },
    { catId:'health_beauty', subcat:'Doctors, Health, Specialists', keywords:['medical centre','medical practice','bulk bill','doctor','gp ','specialist','physiotherapy','physio','optometrist','hospital','pathology','radiology','psychologist','psychiatrist','counsellor'] },
    { catId:'health_beauty', subcat:'Pharmacy', keywords:['chemist','pharmacy','priceline','chemist warehouse','terry white','blooms the chemist','amcal'] },
    { catId:'health_beauty', subcat:'Nails, Beauty & Other Errands', keywords:['nail salon','nails','beauty salon','waxing','spray tan','eyelash','beauty'] },
    { catId:'health_beauty', subcat:'Haircuts', keywords:['haircut','hairdresser','hair salon','barber','blow wave'] },
    { catId:'fitness', subcat:'Gym Memberships', keywords:['gym','fitness first','anytime fitness','snap fitness','f45','crossfit','yoga','pilates','planet fitness','goodlife'] },
    { catId:'insurance_utilities', subcat:'Life & Income Insurance', keywords:['life insurance','term life','income protection','tpd cover','tal ','zurich','aia insurance','onepath'] },
    { catId:'entertainment', subcat:'Netflix',          keywords:['netflix','netflix.com'] },
    { catId:'entertainment', subcat:'Amazon Prime',     keywords:['amazon prime','amazon.com.au'] },
    { catId:'entertainment', subcat:'Apple Subscriptions', keywords:['apple.com/bill','apple subscriptions','itunes','apple tv','icloud storage','apple music'] },
    { catId:'entertainment', subcat:'Other Entertainment', keywords:['stan ','disney','binge','foxtel','kayo sports','paramount','spotify','youtube premium','event cinemas','village cinemas','hoyts','cinema ticket','ticketmaster','ticketek','concert','festival','gaming'] },
    { catId:'holidays_travel', subcat:'Flights',       keywords:['qantas','virgin australia','jetstar','rex airlines','tigerair','airasia','singapore airlines','emirates','flight centre','webjet'] },
    { catId:'holidays_travel', subcat:'Accommodation', keywords:['airbnb','booking.com','hotels.com','expedia','wotif','hotel','motel','resort','hostel','holiday park'] },
    { catId:'holidays_travel', subcat:'Car Rentals',   keywords:['avis','hertz','budget rent','europcar','thrifty car','enterprise rental','car hire','rental car'] },
    { catId:'holidays_travel', subcat:'Travel Insurance', keywords:['travel insurance','worldcare','cover-more','allianz travel','1cover','fast cover'] },
    { catId:'shopping', subcat:'Clothing & Shopping',  keywords:['cotton on','country road','david jones','myer','the iconic','h&m','zara','uniqlo','target','kmart','big w','bonds','lorna jane','rebel sport','city beach'] },
    { catId:'shopping', subcat:'Online Shopping',      keywords:['amazon','ebay','catch','catch.com','kogan','aliexpress','etsy','afterpay','zip pay','klarna','humm'] },
    { catId:'shopping', subcat:'Home Shopping',        keywords:['bunnings','mitre 10','ikea','fantastic furniture','nick scali','harvey norman','jb hi-fi','the good guys','officeworks','reject shop','furniture'] },
    { catId:'shopping', subcat:'Gifts',                keywords:['florist','flowers','balloon','gift shop','flower bouquet'] },
    { catId:'shopping', subcat:'Donations',            keywords:['st vincent','salvation army','red cross','oxfam','world vision','unicef','beyond blue','cancer council','heart foundation','lifeline','rspca','donate'] },
    { catId:'children', subcat:'Childcare',            keywords:['childcare','child care','daycare','day care','kindy','kindergarten','preschool','after school care','vacation care','oshc'] },
    { catId:'children', subcat:'School Fees',          keywords:['school fee','tuition fee','enrolment fee','excursion','school levy','school camp'] },
    { catId:'children', subcat:'Children Activities',  keywords:['swimming lesson','dancing class','music lesson','sports class','gymnastics','martial arts','little athletics'] },
    { catId:'children', subcat:'Toys and Presents',    keywords:['baby bunting','nappies','formula','baby food','pram','stroller','cot','car seat','toy'] },
    { catId:'pippen',  subcat:'Vet Bills',    keywords:['vet','veterinary','veterinarian','animal hospital','animal clinic'] },
    { catId:'pippen',  subcat:'Pet Food',     keywords:['petbarn','petstock','pet circle','city farmers','greencross','pet food','dog food','cat food'] },
    { catId:'pippen',  subcat:'Dog Grooming', keywords:['dog grooming','pet grooming','dog wash','dog bath','dog salon'] },
    { catId:'pippen',  subcat:'Pet Insurance',keywords:['pet insurance','bow wow meow','petplan','medibank pet','real pet insurance'] },
    { catId:'business',subcat:'Website and Digital', keywords:['adobe','microsoft 365','office 365','dropbox','notion','slack','zoom','google workspace','canva','figma','atlassian','github','aws','azure','digital ocean','cloudflare','godaddy','namecheap','domain registration'] },
    { catId:'tax',     subcat:'Income Tax',    keywords:['ato payment','income tax','tax instalment','pay as you go','payg','bas payment','gst payment','business activity'] }
  ];

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

  function normStr(s) {
    if (!s) return '';
    return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  // Use new preprocessMerchantString as the clean function
  function clean(raw) { return preprocessMerchantString(raw); }

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
    // "Transfer to CommSec" is caught by the transfer words first — still file it as an investment
    for (var r = 0; r < KEYWORD_RULES.length; r++) {
      if (KEYWORD_RULES[r].subcat === 'Investment Transfer' && ruleKeyword(KEYWORD_RULES[r], test)) return 'Investment Transfer';
    }
    for (var i = 0; i < TRANSFER_SUBCAT_MAP.length; i++) {
      var entry = TRANSFER_SUBCAT_MAP[i];
      for (var j = 0; j < entry.words.length; j++) {
        if (test.indexOf(entry.words[j]) !== -1) return entry.subcat;
      }
    }
    return 'Between Accounts';
  }

  // New two-pass matchLRules (delegates to global matchLRulesNew)
  function matchLRules(name) {
    if (!name) return null;
    var nameLower = name.trim().toLowerCase();
    var result = matchLRulesNew(nameLower);
    if (!result) return null;
    return { catId: result.catId, subcat: result.subcat || '', confidence: result.confidence === 'HIGH' ? CONF_HIGH : CONF_LOW };
  }

  // wholeWord: the keyword can't sit inside a longer word ('stake' must not fire on 'mistake')
  function hasKeyword(test, kw, wholeWord) {
    var i = test.indexOf(kw);
    if (!wholeWord) return i !== -1;
    while (i !== -1) {
      if (!/[a-z0-9]/.test(test.charAt(i - 1)) && !/[a-z0-9]/.test(test.charAt(i + kw.length))) return true;
      i = test.indexOf(kw, i + 1);
    }
    return false;
  }

  // Returns the rule's first matching keyword, or null (also null when an exclude term appears in
  // the description — context, if given, is the full pre-alias text)
  function ruleKeyword(rule, test, context) {
    if (rule.exclude) {
      var full = context ? String(context).toLowerCase() : test;
      for (var x = 0; x < rule.exclude.length; x++) {
        if (full.indexOf(rule.exclude[x]) !== -1) return null;
      }
    }
    for (var j = 0; j < rule.keywords.length; j++) {
      if (hasKeyword(test, rule.keywords[j], rule.wholeWord)) return rule.keywords[j];
    }
    return null;
  }

  function matchKeywords(cleaned, isCredit, context) {
    if (!cleaned) return null;
    var test = cleaned.toLowerCase();
    var matches = [];
    for (var i = 0; i < KEYWORD_RULES.length; i++) {
      var rule = KEYWORD_RULES[i];
      if (rule.incomeOnly && !isCredit) continue;
      if (rule.expenseOnly && isCredit) continue;
      var kw = ruleKeyword(rule, test, context);
      if (kw) matches.push({ catId: rule.catId, subcat: rule.subcat, keyword: kw });
    }
    if (!matches.length) return null;
    matches.sort(function(a, b) { return b.keyword.length - a.keyword.length; });
    var conf = matches.length === 1 ? CONF_HIGH : CONF_LOW;
    return { catId: matches[0].catId, subcat: matches[0].subcat, confidence: conf };
  }

  function amountSignal(amount, isCredit) {
    if (isCredit && amount >= 1000 && amount <= 20000) return { catId:'salary', subcat:'Regular Pay', confidence: CONF_LOW };
    return null;
  }

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

  function categorise(name, desc, amount, txType) {
    var raw = name || desc || '';
    var cleaned = clean(raw);
    var isCredit = (txType === 'income');

    if (isTransfer(raw, cleaned)) {
      return { catId:'transfers', subcat: transferSubcat(raw, cleaned), confidence: CONF_HIGH, source:'transfer' };
    }

    // Use new pipeline — try via resolveAlias + matchLRulesNew
    var pre = preprocessMerchantString(raw);
    if (pre.indexOf('bpay') === 0) pre = extractBpayBiller(pre);
    var canonical = resolveAlias(pre);
    var newResult = matchLRulesNew(canonical, pre) || matchLRulesNew(pre);
    if (newResult) {
      newResult = applyAmountThresholds(newResult, amount);
      return { catId: newResult.catId, subcat: newResult.subcat || '',
               confidence: newResult.confidence === 'HIGH' ? CONF_HIGH : CONF_LOW, source: 'rule' };
    }

    var fromKeyword = matchKeywords(cleaned, isCredit);
    if (fromKeyword && fromKeyword.confidence === CONF_HIGH) return Object.assign({}, fromKeyword, { source: 'keyword' });
    if (fromKeyword) return Object.assign({}, fromKeyword, { source: 'keyword' });

    var fromAmt = amountSignal(amount, isCredit);
    if (fromAmt) return Object.assign({}, fromAmt, { source: 'amount' });

    return { catId:'other', subcat:'', confidence: CONF_NONE, source:'none' };
  }

  function learn() {} // kept for API compat — learning now handled by onManualCategorySave

  var _reprocessSnapshot = null;

  function reprocess(onProgress, onDone) {
    _reprocessSnapshot = JSON.parse(JSON.stringify(TX));
    var txList = TX;
    var total = txList.length;
    var idx = 0;
    var changed = 0;
    var CHUNK = 50;

    function processChunk() {
      var end = Math.min(idx + CHUNK, total);
      for (; idx < end; idx++) {
        var t = txList[idx];
        if (t.userSet || t.correctionSource === 'user') continue;
        var raw = t.rawDescription || t.name || '';
        var pre = preprocessMerchantString(raw);
        if (pre.indexOf('bpay') === 0) pre = extractBpayBiller(pre);
        var can = resolveAlias(pre);
        var res = matchLRulesNew(can, pre) || matchLRulesNew(pre);
        if (!res) res = categorise(t.name, t.description, t.amount, t.type);
        if (!res || res.confidence === CONF_NONE || res.catId === 'other') continue;
        var catObj = (typeof LCATS !== 'undefined') ? LCATS.find(function(c) { return c.id === res.catId; }) : null;
        if (!catObj) continue;
        if (t.catId !== res.catId || t.subcat !== (res.subcat || '')) {
          t.catId = res.catId;
          t.category = catObj.name;
          t.subcat = res.subcat || t.subcat || '';
          changed++;
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
    var catObj = (typeof LCATS !== 'undefined') ? LCATS.find(function(c) { return c.id === result.catId; }) : null;
    if (!catObj) { hideSuggestion(); return; }
    var label = catObj.name + (result.subcat ? ' › ' + result.subcat : '');
    var confColor = result.confidence === CONF_HIGH ? 'var(--success)' : 'var(--warn)';
    pill.innerHTML = '<span style="color:var(--muted);font-size:.72rem">Suggested: </span>'
      + '<button class="btn btn-ghost btn-sm acat-apply-btn" style="color:' + confColor + ';font-size:.78rem;padding:3px 10px;border-color:' + confColor + '"></button>'
      + '<button class="btn btn-ghost btn-sm acat-dismiss-btn" style="font-size:.72rem;padding:2px 8px;color:var(--muted)">' + ICON('x') + '</button>';
    var applyBtn = pill.querySelector('.acat-apply-btn');
    applyBtn.textContent = label;
    applyBtn.dataset.catId = result.catId;
    applyBtn.dataset.subcat = result.subcat || '';
    pill.style.display = 'flex';
    if (!pill._acatBound) {
      pill._acatBound = true;
      pill.addEventListener('click', function(e) {
        var apply = e.target.closest('.acat-apply-btn');
        var dismiss = e.target.closest('.acat-dismiss-btn');
        if (apply) { AutoCat.applySuggestion(apply.dataset.catId, apply.dataset.subcat); }
        if (dismiss) { pill.style.display = 'none'; }
      });
    }
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
    CONF_HIGH: CONF_HIGH, CONF_LOW: CONF_LOW, CONF_NONE: CONF_NONE,
    clean: clean, isTransfer: isTransfer, transferSubcat: transferSubcat,
    matchLRules: matchLRules, matchKeywords: matchKeywords,
    amountSignal: amountSignal, isDuplicate: isDuplicate,
    categorise: categorise, learn: learn,
    reprocess: reprocess, undoReprocess: undoReprocess,
    onNameInput: onNameInput, showSuggestion: showSuggestion,
    hideSuggestion: hideSuggestion, applySuggestion: applySuggestion
  };
})();

// ── Global helpers ────────────────────────────────────────────
function acatApplySuggestion(catId, subcat) { AutoCat.applySuggestion(catId, subcat); }

function acatReprocess() {
  var btn = document.getElementById('acat-reprocess-btn');
  var prog = document.getElementById('acat-progress');
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
      if (result) result.innerHTML = '<span style="color:var(--success)">Done — ' + changed + ' transactions updated.</span>'
        + ' <button class="btn btn-ghost btn-sm" style="margin-left:8px" onclick="acatUndoReprocess()">Undo</button>';
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

function acatReprocess2() {
  var btn = document.getElementById('acat-reprocess-btn2');
  var prog = document.getElementById('acat-progress2');
  var result = document.getElementById('acat-result2');
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
      if (result) result.innerHTML = '<span style="color:var(--success)">Done — ' + changed + ' transactions updated.</span>';
      if (typeof renderTx === 'function') renderTx();
      if (typeof renderDashboard === 'function') renderDashboard();
      if (typeof renderRulesList === 'function') renderRulesList();
      toast('✅ Reprocessed ' + changed + ' transactions');
    }
  );
}
