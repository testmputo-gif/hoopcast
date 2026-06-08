/**
 * HoopCast Multi-Source Scraper — v3
 * 
 * Sources (priority order, all free):
 * 1. ESPN public API         — NBA, WNBA, NCAAB (no key, very reliable)
 * 2. TheSportsDB             — global leagues (no key, reliable)
 * 3. API-Football style      — basketball via rapid api (optional key)
 * 4. SofaScore               — with rotating headers (fallback)
 * 5. Basketball Reference    — NBA historical
 * 6. Live score sites        — additional global coverage
 *
 * If one source is blocked or fails, others fill the gap.
 * Lines are ALWAYS model-estimated — never from bookmakers.
 * Supports 3-day lookahead for upcoming fixtures.
 */

export function toNigeriaTime(date = new Date()) {
  return new Date(date.toLocaleString('en-US', { timeZone: 'Africa/Lagos' }));
}

export function nigeriaDateStr(date = new Date()) {
  const d = toNigeriaTime(date);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export function addDays(dateStr, n) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Rotate user agents to avoid blocks
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
];

function randomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function safeFetch(url, headers = {}, timeoutMs = 15000) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': randomUA(),
        'Accept': 'application/json, text/html, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        ...headers,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status === 403 || res.status === 429) {
      console.warn(`  [blocked] ${res.status} from ${url.substring(0,60)}`);
      return null;
    }
    if (!res.ok) return null;
    const text = await res.text();
    try { return JSON.parse(text); } catch { return null; }
  } catch(e) {
    console.warn(`  [error] ${e.message.substring(0,60)} — ${url.substring(0,60)}`);
    return null;
  }
}

// ── SEED LEAGUES ──────────────────────────────────────────────────────────────

export const SEED_LEAGUES = [
  { key: 'NBA',           name: 'NBA',                   country: 'USA',         tier: 1 },
  { key: 'WNBA',          name: 'WNBA',                  country: 'USA',         tier: 1 },
  { key: 'NBAGL',         name: 'NBA G League',          country: 'USA',         tier: 2 },
  { key: 'EuroLeague',    name: 'EuroLeague',            country: 'Europe',      tier: 1 },
  { key: 'EuroCup',       name: 'EuroCup',               country: 'Europe',      tier: 2 },
  { key: 'ACB',           name: 'ACB',                   country: 'Spain',       tier: 2 },
  { key: 'LegaBasket',    name: 'Lega Basket',           country: 'Italy',       tier: 2 },
  { key: 'LNBElite',      name: 'France LNB Elite',      country: 'France',      tier: 2 },
  { key: 'BBL',           name: 'Basketball Bundesliga', country: 'Germany',     tier: 2 },
  { key: 'BSL',           name: 'Turkiye Super Lig',     country: 'Turkey',      tier: 2 },
  { key: 'NBL',           name: 'NBL Australia',         country: 'Australia',   tier: 2 },
  { key: 'NBL1South',     name: 'Australia NBL1 South',  country: 'Australia',   tier: 3 },
  { key: 'CBA',           name: 'CBA China',             country: 'China',       tier: 2 },
  { key: 'KBL',           name: 'KBL Korea',             country: 'S. Korea',    tier: 2 },
  { key: 'PBA',           name: 'PBA Philippines',       country: 'Philippines', tier: 2 },
  { key: 'BNXT',          name: 'Belgium BNXT',          country: 'Belgium',     tier: 2 },
  { key: 'HEBA',          name: 'Greek Basket League',   country: 'Greece',      tier: 2 },
  { key: 'LKL',           name: 'Lithuania LKL',         country: 'Lithuania',   tier: 3 },
  { key: 'PLK',           name: 'Poland PLK',            country: 'Poland',      tier: 3 },
  { key: 'IndonesiaIBL',  name: 'Indonesia IBL',         country: 'Indonesia',   tier: 3 },
  { key: 'LebanonDiv1',   name: 'Lebanon First Division',country: 'Lebanon',     tier: 3 },
  { key: 'IsraelNat',     name: 'Israel National League',country: 'Israel',      tier: 3 },
  { key: 'CzechNBL',      name: 'Czech Republic NBL',    country: 'Czech Rep.',  tier: 3 },
  { key: 'ItalySerieB',   name: 'Italy Serie B',         country: 'Italy',       tier: 3 },
  { key: 'PuertoRico',    name: 'Puerto Rico BSN',       country: 'Puerto Rico', tier: 3 },
];

// ── SOURCE 1: ESPN (most reliable, never blocked) ─────────────────────────────

const ESPN_LEAGUES = [
  { sport: 'basketball', league: 'nba',  name: 'NBA' },
  { sport: 'basketball', league: 'wnba', name: 'WNBA' },
  { sport: 'basketball', league: 'mens-college-basketball', name: 'NCAA' },
];

async function fetchESPN(sport, league, dateStr) {
  const d = dateStr.replace(/-/g,'');
  const url = `https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/scoreboard?dates=${d}&limit=100`;
  const data = await safeFetch(url);
  if (!data || !data.events) return [];

  return data.events.map(e => {
    const comp = e.competitions?.[0];
    const home = comp?.competitors?.find(c => c.homeAway === 'home');
    const away = comp?.competitors?.find(c => c.homeAway === 'away');
    const hs = home?.score ? parseInt(home.score) : null;
    const as = away?.score ? parseInt(away.score) : null;
    const statusName = e.status?.type?.name || '';
    return {
      id: `espn-${e.id}`,
      league: league.toUpperCase(),
      date: dateStr,
      homeTeam: home?.team?.displayName || home?.team?.name,
      awayTeam: away?.team?.displayName || away?.team?.name,
      homeScore: hs, awayScore: as,
      totalScore: hs != null && as != null ? hs + as : null,
      status: statusName === 'STATUS_FINAL' ? 'completed'
            : statusName === 'STATUS_IN_PROGRESS' ? 'live'
            : 'scheduled',
      source: 'espn',
    };
  }).filter(g => g.homeTeam && g.awayTeam);
}

// ESPN also has a useful scoreboard that covers more leagues
async function fetchESPNAll(dateStr) {
  const games = [];
  for (const l of ESPN_LEAGUES) {
    const g = await fetchESPN(l.sport, l.league, dateStr);
    games.push(...g);
    await sleep(300);
  }
  return games;
}

// ── SOURCE 2: TheSportsDB (free, global, reliable) ────────────────────────────

// Key TheSportsDB IDs for basketball leagues
const TSDB_LEAGUES = [
  { id: 4387,  name: 'NBA' },
  { id: 4388,  name: 'WNBA' },
  { id: 4966,  name: 'EuroLeague' },
  { id: 4967,  name: 'NBL Australia' },
  { id: 5035,  name: 'CBA China' },
  { id: 4964,  name: 'ACB' },
  { id: 4963,  name: 'Lega Basket' },
  { id: 4972,  name: 'Lithuania LKL' },
  { id: 4971,  name: 'PBA Philippines' },
  { id: 4968,  name: 'Basketball Bundesliga' },
  { id: 4969,  name: 'France LNB Elite' },
  { id: 4970,  name: 'Turkiye Super Lig' },
  { id: 5036,  name: 'KBL Korea' },
];

async function fetchTSDBDay(dateStr) {
  // TheSportsDB eventsday endpoint — all sports for a date
  const url = `https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=${dateStr}&s=Basketball`;
  const data = await safeFetch(url);
  if (!data || !data.events) return [];

  return data.events.map(e => {
    const hs = e.intHomeScore ? parseInt(e.intHomeScore) : null;
    const as = e.intAwayScore ? parseInt(e.intAwayScore) : null;
    return {
      id: `tsdb-${e.idEvent}`,
      league: e.strLeague || 'Unknown',
      date: e.dateEvent || dateStr,
      homeTeam: e.strHomeTeam,
      awayTeam: e.strAwayTeam,
      homeScore: hs, awayScore: as,
      totalScore: hs != null && as != null ? hs + as : null,
      status: e.strStatus === 'Match Finished' ? 'completed'
            : e.strStatus === 'In Progress' ? 'live'
            : 'scheduled',
      source: 'thesportsdb',
    };
  }).filter(g => g.homeTeam && g.awayTeam);
}

async function fetchTSDBLeagueSchedule(leagueId, leagueName) {
  // Get next events for a specific league
  const url = `https://www.thesportsdb.com/api/v1/json/3/eventsnextleague.php?id=${leagueId}`;
  const data = await safeFetch(url);
  if (!data || !data.events) return [];

  return data.events.map(e => ({
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

async function fetchTSDBAll(dateStr) {
  const games = [];

  // 1. Day events
  const dayGames = await fetchTSDBDay(dateStr);
  games.push(...dayGames);
  console.log(`  [tsdb] Day events: ${dayGames.length}`);

  await sleep(400);

  // 2. Next events per league (for upcoming fixtures)
  for (const league of TSDB_LEAGUES) {
    const upcoming = await fetchTSDBLeagueSchedule(league.id, league.name);
    const forDate = upcoming.filter(g => g.date === dateStr);
    games.push(...forDate);
    await sleep(200);
  }

  return games;
}

// ── SOURCE 3: Sofascore with aggressive headers (retry on block) ──────────────

async function fetchSofascoreWithRetry(dateStr) {
  const url = `https://api.sofascore.com/api/v1/sport/basketball/scheduled-events/${dateStr}`;

  // Try different header combinations
  const headerSets = [
    {
      'Referer': 'https://www.sofascore.com/',
      'Origin': 'https://www.sofascore.com',
      'X-Requested-With': 'XMLHttpRequest',
    },
    {
      'Referer': 'https://www.sofascore.com/basketball',
      'Accept': 'application/json',
      'Sec-Fetch-Site': 'same-origin',
    },
    {
      'Referer': 'https://google.com',
    },
  ];

  for (const headers of headerSets) {
    await sleep(1000);
    const data = await safeFetch(url, headers);
    if (data && data.events) {
      console.log(`  [sofascore] Success with headers variant`);
      return data.events
        .filter(e => e.homeTeam && e.awayTeam)
        .map(e => {
          const hs = e.homeScore?.current ?? null;
          const as = e.awayScore?.current ?? null;
          return {
            id: `sofascore-${e.id}`,
            league: e.tournament?.name || e.tournament?.uniqueTournament?.name || 'Unknown',
            date: dateStr,
            homeTeam: e.homeTeam.name,
            awayTeam: e.awayTeam.name,
            homeScore: hs, awayScore: as,
            totalScore: hs != null && as != null ? hs + as : null,
            status: e.status?.type === 'finished' ? 'completed'
                  : e.status?.type === 'inprogress' ? 'live'
                  : 'scheduled',
            source: 'sofascore',
          };
        })
        .filter(g => g.totalScore == null || g.totalScore > 50);
    }
  }
  console.warn('  [sofascore] All attempts blocked (403)');
  return [];
}

// ── SOURCE 4: LiveScore API (public, no key needed) ───────────────────────────

async function fetchLivescoreBasketball(dateStr) {
  // LiveScore uses a public CDN endpoint
  const url = `https://prod-cdn-v2.livescore-api.com/v2/basketball/scores?page=1&locale=en`;
  const data = await safeFetch(url, { 'Origin': 'https://www.livescore.com' });
  if (!data || !data.data || !data.data.match) return [];

  return data.data.match
    .filter(m => m.match_start && m.match_start.startsWith(dateStr))
    .map(m => ({
      id: `livescore-${m.id}`,
      league: m.competition?.name || 'Unknown',
      date: dateStr,
      homeTeam: m.home_name,
      awayTeam: m.away_name,
      homeScore: m.score ? parseInt(m.score.split(' - ')[0]) : null,
      awayScore: m.score ? parseInt(m.score.split(' - ')[1]) : null,
      totalScore: m.score ? parseInt(m.score.split(' - ')[0]) + parseInt(m.score.split(' - ')[1]) : null,
      status: m.status === 'FT' ? 'completed' : m.status === 'LIVE' ? 'live' : 'scheduled',
      source: 'livescore',
    }))
    .filter(g => g.homeTeam && g.awayTeam);
}

// ── SOURCE 5: API-Basketball (optional, if key set) ───────────────────────────

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
    return {
      id: `apibball-${g.id}`,
      league: g.league?.name || 'Unknown',
      date: g.date?.split('T')[0] || dateStr,
      homeTeam: g.teams?.home?.name,
      awayTeam: g.teams?.away?.name,
      homeScore: hs, awayScore: as,
      totalScore: hs != null && as != null ? hs + as : null,
      status: ['FT','AOT'].includes(g.status?.short) ? 'completed'
            : ['LIVE','Q1','Q2','Q3','Q4','OT','HT'].includes(g.status?.short) ? 'live'
            : 'scheduled',
      source: 'api-basketball',
    };
  }).filter(g => g.homeTeam && g.awayTeam);
}

// ── MERGE across sources — deduplication + validation ────────────────────────

function normalise(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function mergeFixtures(allGames) {
  const map = new Map();
  for (const g of allGames) {
    if (!g.homeTeam || !g.awayTeam) continue;
    const key = `${g.date}::${normalise(g.homeTeam)}::${normalise(g.awayTeam)}`;
    if (map.has(key)) {
      const ex = map.get(key);
      ex.sourceCount = (ex.sourceCount || 1) + 1;
      ex.sources = [...(ex.sources || [ex.source]), g.source];
      // Take most complete data
      if (g.homeScore != null && ex.homeScore == null) {
        ex.homeScore = g.homeScore;
        ex.awayScore = g.awayScore;
        ex.totalScore = g.totalScore;
      }
      if (g.status === 'completed' && ex.status !== 'completed') ex.status = 'completed';
      if (g.status === 'live' && ex.status === 'scheduled') ex.status = 'live';
    } else {
      map.set(key, { ...g, sourceCount: 1, sources: [g.source] });
    }
  }
  for (const [, f] of map) {
    f.multiSourceValidated = f.sourceCount >= 2;
  }
  return Array.from(map.values());
}

// ── 3-DAY LOOKAHEAD ───────────────────────────────────────────────────────────

export async function fetchFixturesMultiDay(baseDateStr, daysAhead = 3) {
  const allFixtures = [];
  const dates = [];
  for (let i = 0; i <= daysAhead; i++) {
    dates.push(addDays(baseDateStr, i));
  }

  for (const dateStr of dates) {
    console.log(`\n[scraper] Fetching ${dateStr}...`);
    const fixtures = await fetchFixturesForDate(dateStr, []);
    allFixtures.push(...fixtures);
    if (dateStr !== dates[dates.length - 1]) await sleep(500);
  }

  return allFixtures;
}

// ── MAIN FIXTURE FETCHER ──────────────────────────────────────────────────────

export async function fetchFixturesForDate(dateStr, _leagueKeys = []) {
  console.log(`  [scraper] ${dateStr} — querying all sources...`);
  const all = [];

  // Source 1: ESPN — very reliable, never blocks
  process.stdout.write('  [espn] ');
  const espnGames = await fetchESPNAll(dateStr);
  all.push(...espnGames);
  console.log(`${espnGames.length} games`);

  // Source 2: TheSportsDB — global coverage, day events + per-league schedule
  process.stdout.write('  [tsdb] ');
  const tsdbGames = await fetchTSDBAll(dateStr);
  all.push(...tsdbGames);
  console.log(`${tsdbGames.length} games`);

  // Source 3: Sofascore — try with rotation
  process.stdout.write('  [sofascore] ');
  const sfGames = await fetchSofascoreWithRetry(dateStr);
  all.push(...sfGames);
  console.log(`${sfGames.length} games`);

  // Source 4: LiveScore
  process.stdout.write('  [livescore] ');
  const lsGames = await fetchLivescoreBasketball(dateStr);
  all.push(...lsGames);
  console.log(`${lsGames.length} games`);

  // Source 5: API-Basketball (if key set)
  if (process.env.API_BASKETBALL_KEY) {
    process.stdout.write('  [api-basketball] ');
    const abGames = await fetchAPIBasketball(dateStr);
    all.push(...abGames);
    console.log(`${abGames.length} games`);
  }

  const merged = mergeFixtures(all);
  // Filter out non-basketball totals
  const valid = merged.filter(g => g.totalScore == null || g.totalScore > 50);

  console.log(`  [scraper] ${dateStr}: ${valid.length} unique fixtures (${valid.filter(g=>g.multiSourceValidated).length} multi-validated)`);
  return valid;
}

// ── LEAGUE DISCOVERY ──────────────────────────────────────────────────────────

export async function discoverLeagues() {
  const data = await safeFetch('https://www.thesportsdb.com/api/v1/json/3/search_all_leagues.php?s=Basketball');
  if (!data || !data.leagues) return [];
  return data.leagues.map(l => ({
    key: l.strLeague, name: l.strLeague,
    country: l.strCountry || 'Unknown', tier: 3,
    tsdbId: l.idLeague, source: 'thesportsdb',
  }));
}

// ── STATS BUILDERS ────────────────────────────────────────────────────────────

export function buildTeamStatsFromGames(teamName, allGames) {
  const teamGames = allGames.filter(g =>
    g.status === 'completed' &&
    (g.homeTeam === teamName || g.awayTeam === teamName) &&
    g.homeScore != null && g.awayScore != null && g.totalScore > 50
  ).sort((a, b) => new Date(b.date) - new Date(a.date));

  if (teamGames.length === 0) return null;

  const scored  = g => g.homeTeam === teamName ? g.homeScore : g.awayScore;
  const allowed = g => g.homeTeam === teamName ? g.awayScore : g.homeScore;
  const avg     = (arr, fn) => arr.length ? arr.reduce((s,g) => s+fn(g), 0)/arr.length : null;

  const recent5  = teamGames.slice(0, 5);
  const recent10 = teamGames.slice(0, 10);
  const homeGames = teamGames.filter(g => g.homeTeam === teamName);
  const awayGames = teamGames.filter(g => g.awayTeam === teamName);
  const totals = teamGames.map(g => g.totalScore);
  const avgTotal = totals.reduce((a,b)=>a+b,0)/totals.length;

  return {
    teamName,
    gamesPlayed: teamGames.length,
    avgPointsScored:  avg(teamGames, scored),
    avgPointsAllowed: avg(teamGames, allowed),
    recent5Totals:  recent5.map(g=>g.totalScore),
    recent10Totals: recent10.map(g=>g.totalScore),
    avgTotal5:  avg(recent5,  g=>g.totalScore),
    avgTotal10: avg(recent10, g=>g.totalScore),
    homeAvgScored:  avg(homeGames, scored),
    homeAvgAllowed: avg(homeGames, allowed),
    awayAvgScored:  avg(awayGames, scored),
    awayAvgAllowed: avg(awayGames, allowed),
    recentOverPct:  totals.length ? (totals.filter(t=>t>avgTotal).length/totals.length)*100 : 50,
    recentUnderPct: totals.length ? (totals.filter(t=>t<=avgTotal).length/totals.length)*100 : 50,
    pace: avgTotal,
    lastGameDate: teamGames[0]?.date || null,
    restDays: teamGames.length >= 2
      ? Math.round((new Date(teamGames[0].date)-new Date(teamGames[1].date))/86400000)
      : 3,
    updatedAt: Date.now(),
  };
}

export function buildLeagueStats(games) {
  const completed = games.filter(g => g.status==='completed' && g.totalScore > 50);
  if (completed.length < 3) return null;
  const totals = completed.map(g=>g.totalScore);
  const avg = totals.reduce((a,b)=>a+b,0)/totals.length;
  const variance = totals.reduce((s,t)=>s+Math.pow(t-avg,2),0)/totals.length;
  return {
    avgTotal: avg,
    stdDev: Math.sqrt(variance),
    gamesAnalyzed: completed.length,
    minTotal: Math.min(...totals),
    maxTotal: Math.max(...totals),
    updatedAt: Date.now(),
  };
}
