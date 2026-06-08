/**
 * HoopCast Multi-Source Scraper
 * Sources (all free, no API key):
 * 1. TheSportsDB       — league discovery + results
 * 2. Sofascore         — fixtures + live scores
 * 3. ESPN public feed  — NBA + WNBA fixtures
 * 4. API-Basketball    — optional, if key provided
 * 
 * Lines are ESTIMATED by our own model — never taken from
 * a single bookmaker to avoid bias. Multiple source
 * agreement validates each fixture before prediction.
 */

export function toNigeriaTime(date = new Date()) {
  return new Date(date.toLocaleString('en-US', { timeZone: 'Africa/Lagos' }));
}

export function nigeriaDateStr(date = new Date()) {
  const d = toNigeriaTime(date);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/html, */*',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function safeFetch(url, extraHeaders = {}, timeoutMs = 12000) {
  try {
    const res = await fetch(url, {
      headers: { ...HEADERS, ...extraHeaders },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch(e) {
    console.warn(`  [fetch] Failed: ${url.substring(0,80)} — ${e.message}`);
    return null;
  }
}

// ── SEED LEAGUES ─────────────────────────────────────────────────────────────

export const SEED_LEAGUES = [
  { key: 'NBA',           name: 'NBA',                        country: 'USA',          tier: 1 },
  { key: 'WNBA',          name: 'WNBA',                       country: 'USA',          tier: 1 },
  { key: 'EuroLeague',    name: 'EuroLeague',                 country: 'Europe',       tier: 1 },
  { key: 'EuroCup',       name: 'EuroCup',                    country: 'Europe',       tier: 2 },
  { key: 'ACB',           name: 'ACB',                        country: 'Spain',        tier: 2 },
  { key: 'LegaBasket',    name: 'Lega Basket',                country: 'Italy',        tier: 2 },
  { key: 'ProA',          name: 'Pro A',                      country: 'France',       tier: 2 },
  { key: 'LNBElite',      name: 'France LNB Elite',           country: 'France',       tier: 2 },
  { key: 'BBL',           name: 'Basketball Bundesliga',      country: 'Germany',      tier: 2 },
  { key: 'VTB',           name: 'VTB United League',          country: 'Europe',       tier: 2 },
  { key: 'BSL',           name: 'Turkiye Super Lig',          country: 'Turkey',       tier: 2 },
  { key: 'NBL',           name: 'NBL Australia',              country: 'Australia',    tier: 2 },
  { key: 'NBL1South',     name: 'Australia NBL1 South',       country: 'Australia',    tier: 3 },
  { key: 'NBL1North',     name: 'Australia NBL1 North',       country: 'Australia',    tier: 3 },
  { key: 'CBA',           name: 'CBA China',                  country: 'China',        tier: 2 },
  { key: 'KBL',           name: 'KBL Korea',                  country: 'South Korea',  tier: 2 },
  { key: 'PBA',           name: 'PBA Philippines',            country: 'Philippines',  tier: 2 },
  { key: 'BNXT',          name: 'Belgium BNXT League',        country: 'Belgium',      tier: 2 },
  { key: 'HEBA',          name: 'Greek Basket League',        country: 'Greece',       tier: 2 },
  { key: 'LKL',           name: 'Lithuania LKL',              country: 'Lithuania',    tier: 3 },
  { key: 'PLK',           name: 'Poland PLK',                 country: 'Poland',       tier: 3 },
  { key: 'IndonesiaIBL',  name: 'Indonesia IBL',              country: 'Indonesia',    tier: 3 },
  { key: 'LebanonDiv1',   name: 'Lebanon First Division',     country: 'Lebanon',      tier: 3 },
  { key: 'IsraelNat',     name: 'Israel National League',     country: 'Israel',       tier: 3 },
  { key: 'IsraelSuper',   name: 'Israel Super League',        country: 'Israel',       tier: 3 },
  { key: 'CzechNBL',      name: 'Czech Republic NBL',         country: 'Czech Rep.',   tier: 3 },
  { key: 'ItalySerieB',   name: 'Italy Serie B',              country: 'Italy',        tier: 3 },
  { key: 'ArgentinaLNB',  name: 'Argentina LNB',              country: 'Argentina',    tier: 3 },
  { key: 'PuertoRico',    name: 'Puerto Rico BSN',            country: 'Puerto Rico',  tier: 3 },
  { key: 'DomRep',        name: 'Dominican Republic LNB',     country: 'Dom. Rep.',    tier: 3 },
  { key: 'NBAGL',         name: 'NBA G League',               country: 'USA',          tier: 2 },
];

// ── SOURCE 1: ESPN public API (no key needed) ─────────────────────────────────

async function fetchESPN(sport, league, dateStr) {
  const d = dateStr.replace(/-/g, '');
  const url = `https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/scoreboard?dates=${d}&limit=100`;
  const data = await safeFetch(url);
  if (!data || !data.events) return [];

  return data.events.map(e => {
    const comp = e.competitions?.[0];
    const home = comp?.competitors?.find(c => c.homeAway === 'home');
    const away = comp?.competitors?.find(c => c.homeAway === 'away');
    const homeScore = home?.score ? parseInt(home.score) : null;
    const awayScore = away?.score ? parseInt(away.score) : null;
    const status = e.status?.type?.name;

    return {
      id: `espn-${e.id}`,
      league: league.toUpperCase(),
      date: dateStr,
      homeTeam: home?.team?.displayName || home?.team?.name,
      awayTeam: away?.team?.displayName || away?.team?.name,
      homeScore: homeScore,
      awayScore: awayScore,
      totalScore: homeScore != null && awayScore != null ? homeScore + awayScore : null,
      status: status === 'STATUS_FINAL' ? 'completed'
            : status === 'STATUS_IN_PROGRESS' ? 'live'
            : 'scheduled',
      source: 'espn',
    };
  }).filter(g => g.homeTeam && g.awayTeam);
}

// ── SOURCE 2: Sofascore public API ────────────────────────────────────────────

async function fetchSofascoreDate(dateStr) {
  const url = `https://api.sofascore.com/api/v1/sport/basketball/scheduled-events/${dateStr}`;
  const data = await safeFetch(url, { 'Referer': 'https://www.sofascore.com/' });
  if (!data || !data.events) return [];

  return data.events.map(e => {
    const homeScore = e.homeScore?.current ?? null;
    const awayScore = e.awayScore?.current ?? null;
    const statusType = e.status?.type || '';

    return {
      id: `sofascore-${e.id}`,
      league: e.tournament?.name || e.tournament?.uniqueTournament?.name || 'Unknown',
      date: dateStr,
      homeTeam: e.homeTeam?.name,
      awayTeam: e.awayTeam?.name,
      homeScore,
      awayScore,
      totalScore: homeScore != null && awayScore != null ? homeScore + awayScore : null,
      status: statusType === 'finished' ? 'completed'
            : statusType === 'inprogress' ? 'live'
            : 'scheduled',
      source: 'sofascore',
      sofascoreId: e.id,
    };
  }).filter(g => g.homeTeam && g.awayTeam && g.totalScore > 50 || g.status === 'scheduled');
}

// ── SOURCE 3: TheSportsDB scheduled events ────────────────────────────────────

async function fetchTSDBDate(leagueId, dateStr) {
  const url = `https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=${dateStr}&l=${leagueId}&s=Basketball`;
  const data = await safeFetch(url);
  if (!data || !data.events) return [];

  return data.events.map(e => {
    const homeScore = e.intHomeScore ? parseInt(e.intHomeScore) : null;
    const awayScore = e.intAwayScore ? parseInt(e.intAwayScore) : null;
    return {
      id: `tsdb-${e.idEvent}`,
      league: e.strLeague || 'Unknown',
      date: e.dateEvent || dateStr,
      homeTeam: e.strHomeTeam,
      awayTeam: e.strAwayTeam,
      homeScore,
      awayScore,
      totalScore: homeScore != null && awayScore != null ? homeScore + awayScore : null,
      status: e.strStatus === 'Match Finished' ? 'completed' : 'scheduled',
      source: 'thesportsdb',
    };
  }).filter(g => g.homeTeam && g.awayTeam);
}

// TheSportsDB key basketball league IDs
const TSDB_LEAGUE_IDS = [
  4387, // NBA
  4388, // WNBA
  4966, // EuroLeague
  4967, // NBL Australia
  5035, // CBA China
  4964, // ACB Spain
  4963, // Lega Basket
  4972, // LKL Lithuania
];

// ── SOURCE 4: API-Basketball (optional, if key set) ───────────────────────────

async function fetchAPIBasketball(dateStr) {
  const key = process.env.API_BASKETBALL_KEY;
  if (!key) return [];
  const url = `https://v1.basketball.api-sports.io/games?date=${dateStr}`;
  const data = await safeFetch(url, { 'x-apisports-key': key });
  if (!data || !data.response) return [];

  return data.response.map(g => {
    const homeScore = g.scores?.home?.total ?? null;
    const awayScore = g.scores?.away?.total ?? null;
    return {
      id: `apibball-${g.id}`,
      league: g.league?.name || 'Unknown',
      date: g.date?.split('T')[0] || dateStr,
      homeTeam: g.teams?.home?.name,
      awayTeam: g.teams?.away?.name,
      homeScore,
      awayScore,
      totalScore: homeScore != null && awayScore != null ? homeScore + awayScore : null,
      status: ['FT','AOT'].includes(g.status?.short) ? 'completed'
            : ['LIVE','Q1','Q2','Q3','Q4','OT','HT'].includes(g.status?.short) ? 'live'
            : 'scheduled',
      source: 'api-basketball',
    };
  }).filter(g => g.homeTeam && g.awayTeam);
}

// ── MERGE & VALIDATE across sources ──────────────────────────────────────────
// A fixture that appears in 2+ sources gets a confidence boost.
// Lines are ALWAYS estimated by our model — never taken from bookmakers.

function mergeFixtures(allGames) {
  const map = new Map();

  for (const g of allGames) {
    if (!g.homeTeam || !g.awayTeam) continue;

    // Normalise team names to lowercase for matching
    const key = `${g.date}::${normalise(g.homeTeam)}::${normalise(g.awayTeam)}`;

    if (map.has(key)) {
      const existing = map.get(key);
      existing.sourceCount = (existing.sourceCount || 1) + 1;
      existing.sources = [...(existing.sources || [existing.source]), g.source];
      // Take the most complete score data
      if (g.homeScore != null && existing.homeScore == null) {
        existing.homeScore = g.homeScore;
        existing.awayScore = g.awayScore;
        existing.totalScore = g.totalScore;
      }
      if (g.status === 'completed' && existing.status !== 'completed') {
        existing.status = 'completed';
      }
    } else {
      map.set(key, {
        ...g,
        sourceCount: 1,
        sources: [g.source],
        multiSourceValidated: false,
      });
    }
  }

  // Mark multi-source validated fixtures
  for (const [, fixture] of map) {
    fixture.multiSourceValidated = fixture.sourceCount >= 2;
  }

  return Array.from(map.values());
}

function normalise(name) {
  return (name || '').toLowerCase()
    .replace(/\bfc\b|\bbc\b|\bsk\b|\bbk\b/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

// ── MAIN FIXTURE FETCHER ──────────────────────────────────────────────────────

export async function fetchFixturesForDate(dateStr, leagueKeys = []) {
  console.log(`  [scraper] Fetching fixtures for ${dateStr} from multiple sources...`);
  const all = [];

  // Source 1: ESPN — NBA + WNBA (most reliable free source)
  console.log('  [scraper] ESPN NBA...');
  const nba = await fetchESPN('basketball', 'nba', dateStr);
  all.push(...nba);
  console.log(`            ${nba.length} games`);

  await sleep(500);
  console.log('  [scraper] ESPN WNBA...');
  const wnba = await fetchESPN('basketball', 'wnba', dateStr);
  all.push(...wnba);
  console.log(`            ${wnba.length} games`);

  await sleep(500);

  // Source 2: Sofascore — all global leagues in one call
  console.log('  [scraper] Sofascore global...');
  const sofascore = await fetchSofascoreDate(dateStr);
  all.push(...sofascore);
  console.log(`            ${sofascore.length} games`);

  await sleep(800);

  // Source 3: TheSportsDB — key leagues
  console.log('  [scraper] TheSportsDB key leagues...');
  for (const leagueId of TSDB_LEAGUE_IDS) {
    const games = await fetchTSDBDate(leagueId, dateStr);
    all.push(...games);
    await sleep(300);
  }

  // Source 4: API-Basketball if key available
  if (process.env.API_BASKETBALL_KEY) {
    console.log('  [scraper] API-Basketball...');
    const apigames = await fetchAPIBasketball(dateStr);
    all.push(...apigames);
  }

  // Merge and validate across sources
  const merged = mergeFixtures(all);
  const validated = merged.filter(g => g.totalScore == null || g.totalScore > 50);

  console.log(`  [scraper] Total after merge: ${validated.length} unique fixtures`);
  console.log(`  [scraper] Multi-source validated: ${validated.filter(g=>g.multiSourceValidated).length}`);

  return validated;
}

// ── LEAGUE DISCOVERY ──────────────────────────────────────────────────────────

export async function discoverLeagues() {
  const url = 'https://www.thesportsdb.com/api/v1/json/3/search_all_leagues.php?s=Basketball';
  const data = await safeFetch(url);
  if (!data || !data.leagues) return [];
  return data.leagues.map(l => ({
    key: l.strLeague,
    name: l.strLeague,
    country: l.strCountry || 'Unknown',
    tier: 3,
    tsdbId: l.idLeague,
    source: 'thesportsdb',
  }));
}

// ── STATS BUILDERS ────────────────────────────────────────────────────────────

export function buildTeamStatsFromGames(teamName, allGames) {
  const teamGames = allGames.filter(g =>
    g.status === 'completed' &&
    (g.homeTeam === teamName || g.awayTeam === teamName) &&
    g.homeScore != null && g.awayScore != null &&
    g.totalScore > 50
  ).sort((a, b) => new Date(b.date) - new Date(a.date));

  if (teamGames.length === 0) return null;

  const scored  = g => g.homeTeam === teamName ? g.homeScore : g.awayScore;
  const allowed = g => g.homeTeam === teamName ? g.awayScore : g.homeScore;
  const avg     = (arr, fn) => arr.length ? arr.reduce((s,g) => s + fn(g), 0) / arr.length : null;

  const recent5  = teamGames.slice(0, 5);
  const recent10 = teamGames.slice(0, 10);
  const homeGames = teamGames.filter(g => g.homeTeam === teamName);
  const awayGames = teamGames.filter(g => g.awayTeam === teamName);

  const totals = teamGames.map(g => g.totalScore);
  const avgTotal = totals.reduce((a,b) => a+b, 0) / totals.length;
  const overCount  = totals.filter(t => t > avgTotal).length;
  const underCount = totals.filter(t => t <= avgTotal).length;

  return {
    teamName,
    gamesPlayed: teamGames.length,
    avgPointsScored:  avg(teamGames, scored),
    avgPointsAllowed: avg(teamGames, allowed),
    recent5Totals:  recent5.map(g => g.totalScore),
    recent10Totals: recent10.map(g => g.totalScore),
    avgTotal5:  avg(recent5,  g => g.totalScore),
    avgTotal10: avg(recent10, g => g.totalScore),
    homeAvgScored:  avg(homeGames, scored),
    homeAvgAllowed: avg(homeGames, allowed),
    awayAvgScored:  avg(awayGames, scored),
    awayAvgAllowed: avg(awayGames, allowed),
    recentOverPct:  totals.length ? (overCount  / totals.length) * 100 : 50,
    recentUnderPct: totals.length ? (underCount / totals.length) * 100 : 50,
    pace: avgTotal,
    lastGameDate: teamGames[0]?.date || null,
    restDays: calcRestDays(teamGames),
    updatedAt: Date.now(),
  };
}

function calcRestDays(games) {
  if (games.length < 2) return 3;
  const last       = new Date(games[0].date);
  const secondLast = new Date(games[1].date);
  return Math.round((last - secondLast) / 86400000);
}

export function buildLeagueStats(games) {
  const completed = games.filter(g => g.status === 'completed' && g.totalScore > 50);
  if (completed.length < 3) return null;
  const totals = completed.map(g => g.totalScore);
  const avg = totals.reduce((a,b) => a+b, 0) / totals.length;
  const variance = totals.reduce((s,t) => s + Math.pow(t-avg, 2), 0) / totals.length;
  return {
    avgTotal: avg,
    stdDev: Math.sqrt(variance),
    gamesAnalyzed: completed.length,
    minTotal: Math.min(...totals),
    maxTotal: Math.max(...totals),
    updatedAt: Date.now(),
  };
}
