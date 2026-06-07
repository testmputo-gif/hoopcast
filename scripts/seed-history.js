/**
 * HoopCast History Seeder
 * Fetches last 60 days of results from free public sources.
 * No API key required. Uses public web data.
 * Run once from GitHub Actions to bootstrap the prediction engine.
 */

import { saveHistory, saveTeamStats, saveLeagueStats, saveLeagueRegistry, getHistory } from '../lib/store.js';
import { SEED_LEAGUES } from '../lib/scraper.js';
import { updateAccuracy } from '../lib/engine.js';

const DAYS_BACK = 60;
const NIGERIA_TZ = 'Africa/Lagos';

// ── Date helpers ──────────────────────────────────────────────────────────────

function todayNigeria() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: NIGERIA_TZ }));
}

function dateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function daysAgo(n) {
  const d = todayNigeria();
  d.setDate(d.getDate() - n);
  return d;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Fetch with retry ──────────────────────────────────────────────────────────

async function fetchHtml(url, retries = 3) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
  };
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
      if (res.ok) return await res.text();
      if (res.status === 429) { await sleep(5000 * (i+1)); continue; }
      return null;
    } catch(e) {
      if (i < retries - 1) await sleep(3000 * (i+1));
    }
  }
  return null;
}

// ── Source 1: TheSportsDB (free, no key needed for basic data) ────────────────

async function fetchTheSportsDBResults(leagueName, season) {
  try {
    const url = `https://www.thesportsdb.com/api/v1/json/3/searchevents.php?e=${encodeURIComponent(leagueName)}&s=${season}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.event) return [];
    
    return data.event
      .filter(e => e.intHomeScore && e.intAwayScore && e.strStatus === 'Match Finished')
      .map(e => ({
        id: `tsdb-${e.idEvent}`,
        league: leagueName,
        date: e.dateEvent,
        homeTeam: e.strHomeTeam,
        awayTeam: e.strAwayTeam,
        homeScore: parseInt(e.intHomeScore),
        awayScore: parseInt(e.intAwayScore),
        totalScore: parseInt(e.intHomeScore) + parseInt(e.intAwayScore),
        status: 'completed',
        source: 'thesportsdb'
      }));
  } catch(e) {
    return [];
  }
}

// ── Source 2: TheSportsDB league events (past events endpoint) ────────────────

async function fetchLeagueLastEvents(leagueId) {
  try {
    const url = `https://www.thesportsdb.com/api/v1/json/3/eventspastleague.php?id=${leagueId}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.events) return [];
    
    return data.events
      .filter(e => e.intHomeScore != null && e.intAwayScore != null)
      .map(e => ({
        id: `tsdb-${e.idEvent}`,
        league: e.strLeague || 'Unknown',
        date: e.dateEvent,
        homeTeam: e.strHomeTeam,
        awayTeam: e.strAwayTeam,
        homeScore: parseInt(e.intHomeScore) || 0,
        awayScore: parseInt(e.intAwayScore) || 0,
        totalScore: (parseInt(e.intHomeScore) || 0) + (parseInt(e.intAwayScore) || 0),
        status: 'completed',
        source: 'thesportsdb'
      }))
      .filter(g => g.totalScore > 50); // filter out non-basketball scores
  } catch(e) {
    return [];
  }
}

// ── Source 3: TheSportsDB search for league IDs ───────────────────────────────

async function findLeagueIds() {
  try {
    const url = 'https://www.thesportsdb.com/api/v1/json/3/search_all_leagues.php?s=Basketball';
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.leagues) return [];
    return data.leagues.map(l => ({
      id: l.idLeague,
      name: l.strLeague,
      country: l.strCountry,
      key: l.strLeague
    }));
  } catch(e) {
    return [];
  }
}

// ── Source 4: Sofascore public API (no key needed) ────────────────────────────

async function fetchSofascoreLeague(tournamentId, seasonId, leagueName) {
  try {
    const url = `https://api.sofascore.com/api/v1/unique-tournament/${tournamentId}/season/${seasonId}/events/last/0`;
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://www.sofascore.com/',
    };
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return [];
    const data = await res.json();
    if (!data.events) return [];
    
    return data.events
      .filter(e => e.status && e.status.type === 'finished' && e.homeScore && e.awayScore)
      .map(e => ({
        id: `sofascore-${e.id}`,
        league: leagueName,
        date: new Date(e.startTimestamp * 1000).toISOString().split('T')[0],
        homeTeam: e.homeTeam?.name || 'Unknown',
        awayTeam: e.awayTeam?.name || 'Unknown',
        homeScore: e.homeScore.current || 0,
        awayScore: e.awayScore.current || 0,
        totalScore: (e.homeScore.current || 0) + (e.awayScore.current || 0),
        status: 'completed',
        source: 'sofascore'
      }))
      .filter(g => g.totalScore > 100); // basketball scores are high
  } catch(e) {
    return [];
  }
}

// Sofascore tournament/season IDs for major basketball leagues (public, no auth needed)
const SOFASCORE_LEAGUES = [
  { id: 132, season: 41430, name: 'NBA' },
  { id: 206, season: 42914, name: 'EuroLeague' },
  { id: 207, season: 42915, name: 'EuroCup' },
  { id: 208, season: 42262, name: 'ACB' },
  { id: 221, season: 42299, name: 'Lega Basket' },
  { id: 209, season: 42271, name: 'Pro A' },
  { id: 210, season: 42297, name: 'Basketball Bundesliga' },
  { id: 211, season: 42916, name: 'VTB United League' },
  { id: 212, season: 42263, name: 'BSL' },
  { id: 213, season: 42917, name: 'NBL' },
  { id: 215, season: 42918, name: 'CBA' },
  { id: 216, season: 42919, name: 'KBL' },
  { id: 217, season: 42920, name: 'PBA' },
  { id: 218, season: 42264, name: 'HEBA' },
  { id: 219, season: 42921, name: 'BNXT League' },
];

// ── Build team stats from game list ──────────────────────────────────────────

function buildStats(teamName, games) {
  const teamGames = games.filter(g =>
    (g.homeTeam === teamName || g.awayTeam === teamName) &&
    g.homeScore != null && g.awayScore != null && g.totalScore > 50
  ).sort((a, b) => new Date(b.date) - new Date(a.date));

  if (teamGames.length < 2) return null;

  const scored = g => g.homeTeam === teamName ? g.homeScore : g.awayScore;
  const allowed = g => g.homeTeam === teamName ? g.awayScore : g.homeScore;
  const avg = (arr, fn) => arr.length ? arr.reduce((s, g) => s + fn(g), 0) / arr.length : null;

  const recent5  = teamGames.slice(0, 5);
  const recent10 = teamGames.slice(0, 10);
  const homeGames = teamGames.filter(g => g.homeTeam === teamName);
  const awayGames = teamGames.filter(g => g.awayTeam === teamName);

  const totals = teamGames.map(g => g.totalScore);
  const leagueAvgGuess = totals.reduce((a,b) => a+b, 0) / totals.length;
  const overCount  = totals.filter(t => t > leagueAvgGuess).length;
  const underCount = totals.filter(t => t <= leagueAvgGuess).length;

  return {
    teamName,
    gamesPlayed: teamGames.length,
    avgPointsScored: avg(teamGames, scored),
    avgPointsAllowed: avg(teamGames, allowed),
    recent5Totals: recent5.map(g => g.totalScore),
    recent10Totals: recent10.map(g => g.totalScore),
    avgTotal5: avg(recent5, g => g.totalScore),
    avgTotal10: avg(recent10, g => g.totalScore),
    homeAvgScored: avg(homeGames, scored),
    homeAvgAllowed: avg(homeGames, allowed),
    awayAvgScored: avg(awayGames, scored),
    awayAvgAllowed: avg(awayGames, allowed),
    recentOverPct: totals.length ? (overCount / totals.length) * 100 : 50,
    recentUnderPct: totals.length ? (underCount / totals.length) * 100 : 50,
    pace: leagueAvgGuess,
    lastGameDate: teamGames[0]?.date || null,
    restDays: 2,
    updatedAt: Date.now()
  };
}

function buildLeagueStats(games) {
  const totals = games.map(g => g.totalScore).filter(t => t > 50);
  if (!totals.length) return null;
  const avg = totals.reduce((a,b) => a+b, 0) / totals.length;
  const variance = totals.reduce((s,t) => s + Math.pow(t - avg, 2), 0) / totals.length;
  return {
    avgTotal: avg,
    stdDev: Math.sqrt(variance),
    gamesAnalyzed: totals.length,
    minTotal: Math.min(...totals),
    maxTotal: Math.max(...totals),
    updatedAt: Date.now()
  };
}

// ── Main seeder ───────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  HoopCast History Seeder');
  console.log(`  Fetching ${DAYS_BACK} days of data from free sources`);
  console.log('═══════════════════════════════════════════════\n');

  const allGames = [];
  const cutoffDate = dateStr(daysAgo(DAYS_BACK));

  // ── Step 1: Discover leagues from TheSportsDB ──────────────────────────────
  console.log('📋 Step 1: Discovering basketball leagues...');
  const leagueIds = await findLeagueIds();
  console.log(`   Found ${leagueIds.length} leagues on TheSportsDB`);

  // Save updated registry
  const registryLeagues = SEED_LEAGUES.map(l => ({ ...l }));
  for (const l of leagueIds) {
    if (!registryLeagues.find(r => r.name === l.name)) {
      registryLeagues.push({ key: l.name, name: l.name, country: l.country, tier: 3, tsdbId: l.id });
    }
  }
  await saveLeagueRegistry({ leagues: registryLeagues, updatedAt: Date.now() });
  console.log(`   Registry saved: ${registryLeagues.length} total leagues\n`);

  // ── Step 2: Fetch from Sofascore (best free source, no API key) ────────────
  console.log('🏀 Step 2: Fetching game results from Sofascore...');
  for (const league of SOFASCORE_LEAGUES) {
    process.stdout.write(`   ${league.name}... `);
    const games = await fetchSofascoreLeague(league.id, league.season, league.name);
    const recent = games.filter(g => g.date >= cutoffDate);
    allGames.push(...games); // keep all for stats building
    console.log(`${games.length} games (${recent.length} recent)`);
    await sleep(800); // be gentle
  }

  // ── Step 3: Fetch from TheSportsDB (backup/additional leagues) ────────────
  console.log('\n📊 Step 3: Fetching additional data from TheSportsDB...');
  
  // Key TheSportsDB league IDs for basketball
  const tsdbLeagues = [
    { id: 4387, name: 'NBA' },
    { id: 4966, name: 'EuroLeague' },
    { id: 4388, name: 'WNBA' },
    { id: 4967, name: 'NBL' },
    { id: 5035, name: 'CBA' },
  ];

  for (const league of tsdbLeagues) {
    process.stdout.write(`   ${league.name}... `);
    const games = await fetchLeagueLastEvents(league.id);
    const filtered = games.filter(g => g.date >= cutoffDate);
    allGames.push(...filtered);
    console.log(`${filtered.length} games`);
    await sleep(1000);
  }

  console.log(`\n   Total games collected: ${allGames.length}`);

  // ── Step 4: Deduplicate ───────────────────────────────────────────────────
  const seen = new Set();
  const uniqueGames = [];
  for (const g of allGames) {
    const key = `${g.league}-${g.date}-${g.homeTeam}-${g.awayTeam}`;
    if (!seen.has(key) && g.totalScore > 50) {
      seen.add(key);
      uniqueGames.push(g);
    }
  }
  console.log(`   After deduplication: ${uniqueGames.length} unique games\n`);

  // ── Step 5: Build and save team stats per league ──────────────────────────
  console.log('📈 Step 4: Building team statistics...');
  const leagueGroups = {};
  for (const g of uniqueGames) {
    if (!leagueGroups[g.league]) leagueGroups[g.league] = [];
    leagueGroups[g.league].push(g);
  }

  let teamsSaved = 0;
  let leaguesSaved = 0;

  for (const [leagueName, games] of Object.entries(leagueGroups)) {
    // Save league stats
    const ls = buildLeagueStats(games);
    if (ls) {
      const { saveLeagueStats } = await import('../lib/store.js');
      await saveLeagueStats(leagueName, ls);
      leaguesSaved++;
    }

    // Get all unique teams
    const teams = new Set();
    games.forEach(g => { teams.add(g.homeTeam); teams.add(g.awayTeam); });

    for (const team of teams) {
      const stats = buildStats(team, games);
      if (stats) {
        const { saveTeamStats } = await import('../lib/store.js');
        await saveTeamStats(`${leagueName}::${team}`, stats);
        teamsSaved++;
      }
    }
    
    process.stdout.write(`   ${leagueName}: ${games.length} games, ${teams.size} teams\n`);
    await sleep(200);
  }

  console.log(`\n   ✅ Saved stats for ${teamsSaved} teams across ${leaguesSaved} leagues`);

  // ── Step 6: Save history entries ─────────────────────────────────────────
  console.log('\n📚 Step 5: Saving history...');
  const existing = await getHistory();
  const existingIds = new Set(existing.entries.map(e => e.id));
  
  const newEntries = uniqueGames
    .filter(g => !existingIds.has(g.id))
    .map(g => ({
      id: g.id,
      date: g.date,
      league: g.league,
      homeTeam: g.homeTeam,
      awayTeam: g.awayTeam,
      prediction: null,   // historical games have no prediction
      line: null,
      expectedTotal: null,
      confidence: null,
      confidenceColor: null,
      actualTotal: g.totalScore,
      result: null,       // no prediction was made so no result
      source: g.source
    }));

  const allHistory = {
    entries: [...existing.entries, ...newEntries].slice(-2000),
    accuracy: existing.accuracy || {}
  };

  await saveHistory(allHistory);
  console.log(`   ✅ Saved ${newEntries.length} historical game records`);

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════');
  console.log('  SEEDING COMPLETE');
  console.log(`  Games collected:  ${uniqueGames.length}`);
  console.log(`  Teams with stats: ${teamsSaved}`);
  console.log(`  Leagues covered:  ${leaguesSaved}`);
  console.log('');
  console.log('  The prediction engine now has historical data.');
  console.log('  Run the daily pipeline to generate predictions!');
  console.log('═══════════════════════════════════════════════');
}

main().catch(err => {
  console.error('\n❌ Seeder failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
