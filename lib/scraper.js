/**
 * HoopCast Multi-Source Scraper v4 — Maximum Coverage
 * Sources: ESPN + TheSportsDB + Sofascore + LiveScore
 * Data harmonisation built in — canonical league names, normalised teams
 * 3-day lookahead supported
 */

export function toNigeriaTime(d = new Date()) {
  return new Date(d.toLocaleString('en-US', { timeZone: 'Africa/Lagos' }));
}
export function nigeriaDateStr(d = new Date()) {
  const n = toNigeriaTime(d);
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
}
export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split('T')[0];
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Canonical league name map ─────────────────────────────────────────────────
const LEAGUE_MAP = {
  'nba': 'NBA',
  'wnba': 'WNBA',
  'nba g league': 'NBA G League',
  'euroleague': 'EuroLeague',
  'turkish airlines euroleague': 'EuroLeague',
  'eurocup': 'EuroCup',
  '7days eurocup': 'EuroCup',
  'acb': 'ACB Spain',
  'liga acb': 'ACB Spain',
  'endesa liga': 'ACB Spain',
  'lega basket': 'Lega Basket Italy',
  'lega basket serie a': 'Lega Basket Italy',
  'serie a1': 'Lega Basket Italy',
  'betclic elite': 'France LNB Elite',
  'lnb elite': 'France LNB Elite',
  'pro a': 'France LNB Elite',
  'france lnb elite': 'France LNB Elite',
  'basketball bundesliga': 'Basketball Bundesliga',
  'bbl': 'Basketball Bundesliga',
  'vtb united league': 'VTB League',
  'vtb league': 'VTB League',
  'bsl': 'BSL Turkey',
  'turkiye super lig': 'BSL Turkey',
  'turkiye sigorta basketbol super ligi': 'BSL Turkey',
  'bnxt league': 'BNXT League',
  'bnxt belgian league': 'BNXT League',
  'greek basket league': 'Greek Basket League',
  'heba': 'Greek Basket League',
  'lkl': 'LKL Lithuania',
  'lithuania lkl': 'LKL Lithuania',
  'plk': 'PLK Poland',
  'poland plk': 'PLK Poland',
  'polska liga koszykowki': 'PLK Poland',
  'nbl': 'NBL Australia',
  'national basketball league': 'NBL Australia',
  'nbl1 south': 'NBL1 South',
  'nbl1 north': 'NBL1 North',
  'australia nbl1 south': 'NBL1 South',
  'australia nbl1, south': 'NBL1 South',
  'cba': 'CBA China',
  'chinese basketball association': 'CBA China',
  'kbl': 'KBL Korea',
  'korean basketball league': 'KBL Korea',
  'pba': 'PBA Philippines',
  'philippine basketball association': 'PBA Philippines',
  'ibl': 'Indonesia IBL',
  'indonesia basketball league': 'Indonesia IBL',
  'indonesia ibl': 'Indonesia IBL',
  'lebanon first division': 'Lebanon First Division',
  'israel national league': 'Israel National League',
  'israel premier league': 'Israel Premier League',
  'winner league': 'Israel Premier League',
  'czech nbl': 'Czech NBL',
  'czech republic nbl': 'Czech NBL',
  'italy serie b': 'Italy Serie B',
  'italy serie a2': 'Italy Serie A2',
  'france pro b': 'France Pro B',
  'lnb pro b': 'France Pro B',
  'spain leb oro': 'Spain LEB Oro',
  'aba liga': 'ABA League',
  'adriatic league': 'ABA League',
  'basketball champions league': 'BCL',
  'bcl': 'BCL',
  'puerto rico bsn': 'Puerto Rico BSN',
  'lnb argentina': 'Argentina LNB',
  'superliga argentina': 'Argentina LNB',
  'international united league': 'International United League',
};

function canonicalLeague(raw) {
  if (!raw) return 'Unknown';
  const key = raw.toLowerCase().trim()
    .replace(/\s+/g,' ')
    .replace(/[,\.]/g,'');
  return LEAGUE_MAP[key] || raw.trim();
}

function norm(s) { return (s||'').toLowerCase().replace(/[^a-z0-9]/g,''); }

function normaliseGame(g) {
  return { ...g, league: canonicalLeague(g.league) };
}

// ── Fetch helper ──────────────────────────────────────────────────────────────

const UAS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
];
const randUA = () => UAS[Math.floor(Math.random()*UAS.length)];

async function safeFetch(url, headers = {}) {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': randUA(), 'Accept': 'application/json', ...headers },
      signal: AbortSignal.timeout(12000),
    });
    if (r.status === 403 || r.status === 429) return null;
    if (!r.ok) return null;
    const text = await r.text();
    try { return JSON.parse(text); } catch { return null; }
  } catch(e) { return null; }
}

// ── SEED LEAGUES ──────────────────────────────────────────────────────────────

export const SEED_LEAGUES = [
  { key:'NBA',          name:'NBA',                   country:'USA',          tier:1 },
  { key:'WNBA',         name:'WNBA',                  country:'USA',          tier:1 },
  { key:'NBAGLeague',   name:'NBA G League',          country:'USA',          tier:2 },
  { key:'EuroLeague',   name:'EuroLeague',            country:'Europe',       tier:1 },
  { key:'EuroCup',      name:'EuroCup',               country:'Europe',       tier:2 },
  { key:'ACBSpain',     name:'ACB Spain',             country:'Spain',        tier:2 },
  { key:'LegaBasket',   name:'Lega Basket Italy',     country:'Italy',        tier:2 },
  { key:'LNBElite',     name:'France LNB Elite',      country:'France',       tier:2 },
  { key:'FranceProB',   name:'France Pro B',          country:'France',       tier:3 },
  { key:'BBL',          name:'Basketball Bundesliga', country:'Germany',      tier:2 },
  { key:'VTBLeague',    name:'VTB League',            country:'Europe',       tier:2 },
  { key:'BSLTurkey',    name:'BSL Turkey',            country:'Turkey',       tier:2 },
  { key:'NBLAus',       name:'NBL Australia',         country:'Australia',    tier:2 },
  { key:'NBL1South',    name:'NBL1 South',            country:'Australia',    tier:3 },
  { key:'NBL1North',    name:'NBL1 North',            country:'Australia',    tier:3 },
  { key:'CBAChina',     name:'CBA China',             country:'China',        tier:2 },
  { key:'KBLKorea',     name:'KBL Korea',             country:'S.Korea',      tier:2 },
  { key:'PBAPhil',      name:'PBA Philippines',       country:'Philippines',  tier:2 },
  { key:'BNXTLeague',   name:'BNXT League',           country:'Belgium/Neth', tier:2 },
  { key:'GreekBasket',  name:'Greek Basket League',   country:'Greece',       tier:2 },
  { key:'LKLLith',      name:'LKL Lithuania',         country:'Lithuania',    tier:3 },
  { key:'PLKPoland',    name:'PLK Poland',            country:'Poland',       tier:3 },
  { key:'IndonesiaIBL', name:'Indonesia IBL',         country:'Indonesia',    tier:3 },
  { key:'LebanonFD',    name:'Lebanon First Division',country:'Lebanon',      tier:3 },
  { key:'IsraelNat',    name:'Israel National League',country:'Israel',       tier:3 },
  { key:'IsraelPrem',   name:'Israel Premier League', country:'Israel',       tier:3 },
  { key:'CzechNBL',     name:'Czech NBL',             country:'Czech Rep.',   tier:3 },
  { key:'ItalySerieB',  name:'Italy Serie B',         country:'Italy',        tier:3 },
  { key:'SpainLEBOro',  name:'Spain LEB Oro',         country:'Spain',        tier:3 },
  { key:'ABALeague',    name:'ABA League',            country:'Balkans',      tier:3 },
  { key:'BCL',          name:'BCL',                   country:'Europe',       tier:2 },
  { key:'PuertoRico',   name:'Puerto Rico BSN',       country:'Puerto Rico',  tier:3 },
  { key:'ArgLNB',       name:'Argentina LNB',         country:'Argentina',    tier:3 },
  { key:'IntUnited',    name:'International United League', country:'Intl',   tier:3 },
];

// ── SOURCE 1: ESPN ────────────────────────────────────────────────────────────

async function fetchESPN(sport, league, leagueName, dateStr) {
  const d = dateStr.replace(/-/g,'');
  const data = await safeFetch(
    `https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/scoreboard?dates=${d}&limit=100`
  );
  if (!data || !data.events) return [];
  return data.events.map(e => {
    const comp = e.competitions?.[0];
    const home = comp?.competitors?.find(c => c.homeAway==='home');
    const away = comp?.competitors?.find(c => c.homeAway==='away');
    const hs = home?.score ? parseInt(home.score) : null;
    const as = away?.score ? parseInt(away.score) : null;
    const sn = e.status?.type?.name || '';
    return normaliseGame({
      id: `espn-${e.id}`,
      league: leagueName,
      date: dateStr,
      homeTeam: home?.team?.displayName || home?.team?.name,
      awayTeam: away?.team?.displayName || away?.team?.name,
      homeScore: hs, awayScore: as,
      totalScore: hs!=null && as!=null ? hs+as : null,
      status: sn==='STATUS_FINAL' ? 'completed'
            : sn==='STATUS_IN_PROGRESS' ? 'live'
            : 'scheduled',
      source: 'espn',
    });
  }).filter(g => g.homeTeam && g.awayTeam);
}

// ── SOURCE 2: TheSportsDB ─────────────────────────────────────────────────────

const TSDB_LEAGUE_IDS = [
  { id:4387,  name:'NBA' },
  { id:4388,  name:'WNBA' },
  { id:4966,  name:'EuroLeague' },
  { id:4967,  name:'NBL Australia' },
  { id:5035,  name:'CBA China' },
  { id:4964,  name:'ACB Spain' },
  { id:4963,  name:'Lega Basket Italy' },
  { id:4972,  name:'LKL Lithuania' },
  { id:4971,  name:'PBA Philippines' },
  { id:4968,  name:'Basketball Bundesliga' },
  { id:4969,  name:'France LNB Elite' },
  { id:4970,  name:'BSL Turkey' },
  { id:5036,  name:'KBL Korea' },
  { id:5037,  name:'BNXT League' },
  { id:5038,  name:'Greek Basket League' },
  { id:5039,  name:'PLK Poland' },
  { id:5040,  name:'ABA League' },
  { id:5041,  name:'Israel Premier League' },
  { id:5042,  name:'Indonesia IBL' },
];

async function fetchTSDBDay(dateStr) {
  const data = await safeFetch(
    `https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=${dateStr}&s=Basketball`
  );
  if (!data || !data.events) return [];
  return data.events.map(e => {
    const hs = e.intHomeScore ? parseInt(e.intHomeScore) : null;
    const as = e.intAwayScore ? parseInt(e.intAwayScore) : null;
    return normaliseGame({
      id: `tsdb-${e.idEvent}`,
      league: e.strLeague || 'Unknown',
      date: e.dateEvent || dateStr,
      homeTeam: e.strHomeTeam,
      awayTeam: e.strAwayTeam,
      homeScore: hs, awayScore: as,
      totalScore: hs!=null && as!=null ? hs+as : null,
      status: e.strStatus==='Match Finished' ? 'completed'
            : e.strStatus==='In Progress' ? 'live'
            : 'scheduled',
      source: 'thesportsdb',
    });
  }).filter(g => g.homeTeam && g.awayTeam && (g.totalScore==null || g.totalScore>50));
}

async function fetchTSDBNextLeague(leagueId, leagueName) {
  const data = await safeFetch(
    `https://www.thesportsdb.com/api/v1/json/3/eventsnextleague.php?id=${leagueId}`
  );
  if (!data || !data.events) return [];
  return data.events.map(e => normaliseGame({
    id: `tsdb-${e.idEvent}`,
    league: leagueName,
    date: e.dateEvent,
    homeTeam: e.strHomeTeam,
    awayTeam: e.strAwayTeam,
    homeScore: null, awayScore: null, totalScore: null,
    status: 'scheduled',
    source: 'thesportsdb-schedule',
  })).filter(g => g.homeTeam && g.awayTeam && g.date);
}

// ── SOURCE 3: Sofascore ───────────────────────────────────────────────────────

async function fetchSofascore(dateStr) {
  const headers = { 'Referer': 'https://www.sofascore.com/', 'Origin': 'https://www.sofascore.com' };
  const data = await safeFetch(
    `https://api.sofascore.com/api/v1/sport/basketball/scheduled-events/${dateStr}`,
    headers
  );
  if (!data || !data.events) return [];
  return data.events.map(e => {
    const hs = e.homeScore?.current ?? null;
    const as = e.awayScore?.current ?? null;
    const st = e.status?.type || '';
    return normaliseGame({
      id: `sf-${e.id}`,
      league: e.tournament?.name || 'Unknown',
      date: dateStr,
      homeTeam: e.homeTeam?.name,
      awayTeam: e.awayTeam?.name,
      homeScore: hs, awayScore: as,
      totalScore: hs!=null && as!=null ? hs+as : null,
      status: st==='finished' ? 'completed' : st==='inprogress' ? 'live' : 'scheduled',
      source: 'sofascore',
    });
  }).filter(g => g.homeTeam && g.awayTeam && (g.totalScore==null || g.totalScore>50));
}

// ── SOURCE 4: API-Basketball optional ────────────────────────────────────────

async function fetchAPIBasketball(dateStr) {
  const key = process.env.API_BASKETBALL_KEY;
  if (!key) return [];
  const data = await safeFetch(
    `https://v1.basketball.api-sports.io/games?date=${dateStr}`,
    { 'x-apisports-key': key }
  );
  if (!data || !data.response) return [];
  return data.response.map(g => {
    const hs = g.scores?.home?.total ?? null;
    const as = g.scores?.away?.total ?? null;
    return normaliseGame({
      id: `apib-${g.id}`,
      league: g.league?.name || 'Unknown',
      date: g.date?.split('T')[0] || dateStr,
      homeTeam: g.teams?.home?.name,
      awayTeam: g.teams?.away?.name,
      homeScore: hs, awayScore: as,
      totalScore: hs!=null && as!=null ? hs+as : null,
      status: ['FT','AOT'].includes(g.status?.short) ? 'completed'
            : ['LIVE','Q1','Q2','Q3','Q4','OT','HT'].includes(g.status?.short) ? 'live'
            : 'scheduled',
      source: 'api-basketball',
    });
  }).filter(g => g.homeTeam && g.awayTeam);
}

// ── Merge & dedup ─────────────────────────────────────────────────────────────

function mergeFixtures(all) {
  const map = new Map();
  for (const g of all) {
    if (!g.homeTeam || !g.awayTeam) continue;
    const k = `${g.date}::${norm(g.homeTeam)}::${norm(g.awayTeam)}`;
    if (map.has(k)) {
      const ex = map.get(k);
      ex.sourceCount = (ex.sourceCount||1)+1;
      ex.sources = [...(ex.sources||[ex.source]), g.source];
      if (g.homeScore!=null && ex.homeScore==null) {
        ex.homeScore=g.homeScore; ex.awayScore=g.awayScore; ex.totalScore=g.totalScore;
      }
      if (g.status==='completed') ex.status='completed';
      if (g.status==='live' && ex.status==='scheduled') ex.status='live';
    } else {
      map.set(k, { ...g, sourceCount:1, sources:[g.source] });
    }
  }
  for (const [,f] of map) f.multiSourceValidated = f.sourceCount >= 2;
  return Array.from(map.values());
}

// ── Main fixture fetcher ──────────────────────────────────────────────────────

export async function fetchFixturesForDate(dateStr, _leagueKeys=[]) {
  console.log(`  [scraper] Fetching ${dateStr}...`);
  const all = [];

  // ESPN — reliable, never blocked
  const nba  = await fetchESPN('basketball','nba',  'NBA',  dateStr);
  const wnba = await fetchESPN('basketball','wnba', 'WNBA', dateStr);
  all.push(...nba, ...wnba);
  console.log(`  [espn]      NBA:${nba.length} WNBA:${wnba.length}`);
  await sleep(200);

  // TheSportsDB day — catches all leagues in one call
  const tsdbDay = await fetchTSDBDay(dateStr);
  all.push(...tsdbDay);
  console.log(`  [tsdb-day]  ${tsdbDay.length} games`);
  await sleep(300);

  // TheSportsDB next events per league — future fixtures
  let tsdbNext = 0;
  for (const {id, name} of TSDB_LEAGUE_IDS) {
    const games = await fetchTSDBNextLeague(id, name);
    const forDate = games.filter(g => g.date === dateStr);
    all.push(...forDate);
    tsdbNext += forDate.length;
    await sleep(150);
  }
  console.log(`  [tsdb-next] ${tsdbNext} scheduled games`);

  // Sofascore — try, may be blocked
  const sf = await fetchSofascore(dateStr);
  all.push(...sf);
  console.log(`  [sofascore] ${sf.length} games`);
  await sleep(300);

  // API-Basketball optional
  if (process.env.API_BASKETBALL_KEY) {
    const ab = await fetchAPIBasketball(dateStr);
    all.push(...ab);
    console.log(`  [api-bball] ${ab.length} games`);
  }

  const merged = mergeFixtures(all);
  const valid  = merged.filter(g => g.totalScore==null || g.totalScore>50);
  console.log(`  [total]     ${valid.length} unique fixtures (${valid.filter(g=>g.multiSourceValidated).length} multi-validated)`);
  return valid;
}

export async function fetchFixturesMultiDay(baseDateStr, daysAhead=3) {
  const all = [];
  for (let i=0; i<=daysAhead; i++) {
    const d = addDays(baseDateStr, i);
    const fixtures = await fetchFixturesForDate(d, []);
    all.push(...fixtures);
    if (i < daysAhead) await sleep(500);
  }
  return all;
}

export async function discoverLeagues() {
  const data = await safeFetch('https://www.thesportsdb.com/api/v1/json/3/search_all_leagues.php?s=Basketball');
  if (!data || !data.leagues) return [];
  return data.leagues.map(l => ({
    key: l.strLeague.replace(/\s+/g,''),
    name: canonicalLeague(l.strLeague),
    country: l.strCountry || 'Unknown',
    tier: 3, source: 'thesportsdb',
  }));
}

// ── Stats builders ────────────────────────────────────────────────────────────

export function buildTeamStatsFromGames(teamName, games) {
  const mine = games.filter(g =>
    g.status==='completed' &&
    (g.homeTeam===teamName || g.awayTeam===teamName) &&
    g.homeScore!=null && g.awayScore!=null && g.totalScore>50
  ).sort((a,b) => new Date(b.date)-new Date(a.date));
  if (mine.length===0) return null;

  const scored  = g => g.homeTeam===teamName ? g.homeScore : g.awayScore;
  const allowed = g => g.homeTeam===teamName ? g.awayScore : g.homeScore;
  const avg     = (arr,fn) => arr.length ? arr.reduce((s,g)=>s+fn(g),0)/arr.length : null;
  const r5  = mine.slice(0,5);
  const r10 = mine.slice(0,10);
  const hg  = mine.filter(g=>g.homeTeam===teamName);
  const ag  = mine.filter(g=>g.awayTeam===teamName);
  const totals = mine.map(g=>g.totalScore);
  const avgT = totals.reduce((a,b)=>a+b,0)/totals.length;

  return {
    teamName, gamesPlayed: mine.length,
    avgPointsScored:  avg(mine,scored),
    avgPointsAllowed: avg(mine,allowed),
    recent5Totals:  r5.map(g=>g.totalScore),
    recent10Totals: r10.map(g=>g.totalScore),
    avgTotal5:  avg(r5,  g=>g.totalScore),
    avgTotal10: avg(r10, g=>g.totalScore),
    homeAvgScored:  avg(hg,scored),
    homeAvgAllowed: avg(hg,allowed),
    awayAvgScored:  avg(ag,scored),
    awayAvgAllowed: avg(ag,allowed),
    recentOverPct:  (totals.filter(t=>t>avgT).length/totals.length)*100,
    recentUnderPct: (totals.filter(t=>t<=avgT).length/totals.length)*100,
    pace: avgT,
    lastGameDate: mine[0]?.date||null,
    restDays: mine.length>=2 ? Math.round((new Date(mine[0].date)-new Date(mine[1].date))/86400000) : 3,
    updatedAt: Date.now(),
  };
}

export function buildLeagueStats(games) {
  const totals = games.filter(g=>g.status==='completed'&&g.totalScore>50).map(g=>g.totalScore);
  if (totals.length<3) return null;
  const avg = totals.reduce((a,b)=>a+b,0)/totals.length;
  const variance = totals.reduce((s,t)=>s+Math.pow(t-avg,2),0)/totals.length;
  return {
    avgTotal:avg, stdDev:Math.sqrt(variance),
    gamesAnalyzed:totals.length,
    minTotal:Math.min(...totals), maxTotal:Math.max(...totals),
    updatedAt:Date.now(),
  };
}
