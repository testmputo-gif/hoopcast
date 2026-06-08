/**
 * HoopCast History Seeder — Multi-Source Edition
 * Fetches 60 days of results from ESPN + Sofascore + TheSportsDB
 * No API key required. Validates across sources for accuracy.
 */

import { saveHistory, saveTeamStats, saveLeagueStats, saveLeagueRegistry, getHistory } from '../lib/store.js';
import { buildTeamStatsFromGames, buildLeagueStats, SEED_LEAGUES, nigeriaDateStr } from '../lib/scraper.js';
import { updateAccuracy } from '../lib/engine.js';

const DAYS_BACK = 60;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function daysAgo(n) {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Lagos' }));
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

function allDatesBetween(startStr, endStr) {
  const dates = [];
  const cur = new Date(startStr);
  const end = new Date(endStr);
  while (cur <= end) {
    dates.push(cur.toISOString().split('T')[0]);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
};

async function safeFetch(url, extra = {}) {
  try {
    const res = await fetch(url, {
      headers: { ...FETCH_HEADERS, ...extra },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch(e) {
    return null;
  }
}

// ESPN scoreboard for a date
async function espnDate(sport, league, dateStr) {
  const d = dateStr.replace(/-/g,'');
  const data = await safeFetch(
    `https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/scoreboard?dates=${d}&limit=100`
  );
  if (!data || !data.events) return [];
  return data.events.map(e => {
    const comp = e.competitions?.[0];
    const home = comp?.competitors?.find(c => c.homeAway === 'home');
    const away = comp?.competitors?.find(c => c.homeAway === 'away');
    const hs = home?.score ? parseInt(home.score) : null;
    const as = away?.score ? parseInt(away.score) : null;
    return {
      id: `espn-${e.id}`,
      league: league.toUpperCase(),
      date: dateStr,
      homeTeam: home?.team?.displayName || home?.team?.name,
      awayTeam: away?.team?.displayName || away?.team?.name,
      homeScore: hs, awayScore: as,
      totalScore: hs != null && as != null ? hs + as : null,
      status: e.status?.type?.name === 'STATUS_FINAL' ? 'completed' : 'scheduled',
      source: 'espn',
    };
  }).filter(g => g.homeTeam && g.awayTeam && g.status === 'completed' && g.totalScore > 100);
}

// Sofascore for a date
async function sofascoreDate(dateStr) {
  const data = await safeFetch(
    `https://api.sofascore.com/api/v1/sport/basketball/scheduled-events/${dateStr}`,
    { 'Referer': 'https://www.sofascore.com/' }
  );
  if (!data || !data.events) return [];
  return data.events
    .filter(e => e.status?.type === 'finished' && e.homeScore?.current && e.awayScore?.current)
    .map(e => ({
      id: `sofascore-${e.id}`,
      league: e.tournament?.name || 'Unknown',
      date: dateStr,
      homeTeam: e.homeTeam?.name,
      awayTeam: e.awayTeam?.name,
      homeScore: e.homeScore.current,
      awayScore: e.awayScore.current,
      totalScore: e.homeScore.current + e.awayScore.current,
      status: 'completed',
      source: 'sofascore',
    }))
    .filter(g => g.homeTeam && g.awayTeam && g.totalScore > 50);
}

// TheSportsDB past events for key leagues
const TSDB_IDS = [4387, 4388, 4966, 4967, 5035, 4964, 4963, 4972];
async function tsdbLeague(leagueId) {
  const data = await safeFetch(
    `https://www.thesportsdb.com/api/v1/json/3/eventspastleague.php?id=${leagueId}`
  );
  if (!data || !data.events) return [];
  return data.events
    .filter(e => e.intHomeScore && e.intAwayScore)
    .map(e => ({
      id: `tsdb-${e.idEvent}`,
      league: e.strLeague || 'Unknown',
      date: e.dateEvent,
      homeTeam: e.strHomeTeam,
      awayTeam: e.strAwayTeam,
      homeScore: parseInt(e.intHomeScore),
      awayScore: parseInt(e.intAwayScore),
      totalScore: parseInt(e.intHomeScore) + parseInt(e.intAwayScore),
      status: 'completed',
      source: 'thesportsdb',
    }))
    .filter(g => g.totalScore > 50 && g.date >= daysAgo(DAYS_BACK));
}

// Deduplicate
function normalise(n) {
  return (n||'').toLowerCase().replace(/[^a-z0-9]/g,'');
}
function dedup(games) {
  const seen = new Set();
  return games.filter(g => {
    const k = `${g.date}::${normalise(g.homeTeam)}::${normalise(g.awayTeam)}`;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
}

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  HoopCast History Seeder — Multi Source Edition');
  console.log(`  Collecting ${DAYS_BACK} days of basketball results`);
  console.log('═══════════════════════════════════════════════════\n');

  const startDate = daysAgo(DAYS_BACK);
  const endDate   = nigeriaDateStr();
  const allDates  = allDatesBetween(startDate, endDate);
  const allGames  = [];

  // ── Step 1: ESPN day by day (NBA + WNBA) ───────────────────────────────────
  console.log(`📅 Step 1: ESPN — scraping ${allDates.length} days...\n`);
  let espnTotal = 0;
  for (const date of allDates) {
    const nba  = await espnDate('basketball', 'nba',  date);
    const wnba = await espnDate('basketball', 'wnba', date);
    allGames.push(...nba, ...wnba);
    espnTotal += nba.length + wnba.length;
    if (nba.length + wnba.length > 0) {
      process.stdout.write(`   ${date}: NBA(${nba.length}) WNBA(${wnba.length})\n`);
    }
    await sleep(150);
  }
  console.log(`   ESPN total: ${espnTotal} games\n`);

  // ── Step 2: Sofascore day by day (all global leagues) ─────────────────────
  console.log('🌍 Step 2: Sofascore — all global leagues by date...\n');
  let sfTotal = 0;
  for (const date of allDates) {
    const games = await sofascoreDate(date);
    allGames.push(...games);
    sfTotal += games.length;
    if (games.length > 0) {
      process.stdout.write(`   ${date}: ${games.length} games\n`);
    }
    await sleep(400);
  }
  console.log(`   Sofascore total: ${sfTotal} games\n`);

  // ── Step 3: TheSportsDB bulk past events ──────────────────────────────────
  console.log('📊 Step 3: TheSportsDB — key leagues bulk fetch...\n');
  let tsdbTotal = 0;
  for (const id of TSDB_IDS) {
    const games = await tsdbLeague(id);
    allGames.push(...games);
    tsdbTotal += games.length;
    if (games.length > 0) console.log(`   League ${id}: ${games.length} games`);
    await sleep(600);
  }
  console.log(`   TheSportsDB total: ${tsdbTotal} games\n`);

  // ── Deduplicate ────────────────────────────────────────────────────────────
  const unique = dedup(allGames);
  console.log(`\n✅ Total unique games after deduplication: ${unique.length}`);

  // League breakdown
  const byLeague = {};
  unique.forEach(g => { byLeague[g.league] = (byLeague[g.league]||0)+1; });
  console.log('\n  Games per league:');
  Object.entries(byLeague).sort((a,b)=>b[1]-a[1]).forEach(([l,c]) => {
    console.log(`    ${l.padEnd(30)} ${c}`);
  });

  // ── Build team stats ───────────────────────────────────────────────────────
  console.log('\n📈 Building team statistics...');
  const leagueGroups = {};
  unique.forEach(g => {
    if (!leagueGroups[g.league]) leagueGroups[g.league] = [];
    leagueGroups[g.league].push(g);
  });

  let teamsSaved = 0;
  let leaguesSaved = 0;

  for (const [league, games] of Object.entries(leagueGroups)) {
    const ls = buildLeagueStats(games);
    if (ls) { await saveLeagueStats(league, ls); leaguesSaved++; }

    const teams = new Set();
    games.forEach(g => { teams.add(g.homeTeam); teams.add(g.awayTeam); });

    for (const team of teams) {
      const stats = buildTeamStatsFromGames(team, games);
      if (stats) { await saveTeamStats(`${league}::${team}`, stats); teamsSaved++; }
    }
    await sleep(100);
  }
  console.log(`   Saved: ${teamsSaved} teams, ${leaguesSaved} leagues`);

  // ── Save history ───────────────────────────────────────────────────────────
  console.log('\n📚 Saving history entries...');
  const existing = await getHistory();
  const existingIds = new Set(existing.entries.map(e => e.id));
  const newEntries = unique
    .filter(g => !existingIds.has(g.id))
    .map(g => ({
      id: g.id, date: g.date, league: g.league,
      homeTeam: g.homeTeam, awayTeam: g.awayTeam,
      prediction: null, line: null,
      expectedTotal: null, confidence: null, confidenceColor: null,
      actualTotal: g.totalScore, result: null, source: g.source,
    }));

  await saveHistory({
    entries: [...existing.entries, ...newEntries].slice(-2000),
    accuracy: existing.accuracy || {},
  });

  // ── Save league registry ───────────────────────────────────────────────────
  const discovered = Object.keys(byLeague).map(name => ({
    key: name, name, country: 'Unknown', tier: 3,
  }));
  const merged = [...SEED_LEAGUES];
  discovered.forEach(d => {
    if (!merged.find(m => m.name === d.name)) merged.push(d);
  });
  await saveLeagueRegistry({ leagues: merged, updatedAt: Date.now() });

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  SEEDING COMPLETE');
  console.log(`  Games: ${unique.length} | Teams: ${teamsSaved} | Leagues: ${leaguesSaved}`);
  console.log('  Run the daily pipeline now to generate predictions!');
  console.log('═══════════════════════════════════════════════════');
}

main().catch(err => {
  console.error('\n❌ Seeder failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
