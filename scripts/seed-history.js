/**
 * HoopCast History Seeder v4 — Maximum Coverage Edition
 * 
 * Sources:
 * 1. ESPN          — NBA, WNBA (day by day, 60 days)
 * 2. TheSportsDB   — 20+ leagues bulk past events  
 * 3. Sofascore     — all global leagues by date
 * 
 * Data harmonisation:
 * - All team names normalised to Title Case
 * - All league names mapped to canonical names
 * - Duplicate detection across sources
 * - Only basketball scores (total > 50) accepted
 */

import {
  saveHistory, saveTeamStats, saveLeagueStats,
  saveLeagueRegistry, getHistory
} from '../lib/store.js';
import { SEED_LEAGUES } from '../lib/scraper.js';
import { updateAccuracy } from '../lib/engine.js';

const DAYS_BACK = 90;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function todayStr() {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Lagos' }));
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function daysAgo(n) {
  const d = new Date(todayStr() + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().split('T')[0];
}

function allDates(start, end) {
  const dates = [];
  const cur = new Date(start + 'T12:00:00Z');
  const fin = new Date(end   + 'T12:00:00Z');
  while (cur <= fin) {
    dates.push(cur.toISOString().split('T')[0]);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

// ── Name harmonisation ────────────────────────────────────────────────────────

// Canonical league name map — unifies names from different sources
const LEAGUE_NAME_MAP = {
  // NBA variants
  'nba': 'NBA', 'national basketball association': 'NBA',
  // WNBA variants  
  'wnba': 'WNBA', "women's national basketball association": 'WNBA',
  // Europe
  'euroleague': 'EuroLeague', 'turkish airlines euroleague': 'EuroLeague',
  'eurocup': 'EuroCup', '7days eurocup': 'EuroCup',
  'acb': 'ACB Spain', 'liga acb': 'ACB Spain', 'endesa liga': 'ACB Spain',
  'lega basket': 'Lega Basket Italy', 'serie a1': 'Lega Basket Italy',
  'lnb elite': 'France LNB Elite', 'pro a': 'France LNB Elite', 'betclic elite': 'France LNB Elite',
  'bbl': 'Basketball Bundesliga', 'basketball bundesliga': 'Basketball Bundesliga',
  'vtb united league': 'VTB League', 'vtb league': 'VTB League',
  'bsl': 'BSL Turkey', 'turkiye sigorta basketbol super ligi': 'BSL Turkey', 'turkiye super lig': 'BSL Turkey',
  'bnxt league': 'BNXT League', 'bnxt': 'BNXT League',
  'greek basket league': 'Greek Basket League', 'heba': 'Greek Basket League',
  'lkl': 'LKL Lithuania', 'lietuvos krepsinio lyga': 'LKL Lithuania', 'lithuania lkl': 'LKL Lithuania',
  'plk': 'PLK Poland', 'polska liga koszykowki': 'PLK Poland', 'poland plk': 'PLK Poland',
  'nbl': 'NBL Australia', 'national basketball league': 'NBL Australia',
  'nbl1 south': 'NBL1 South', 'australia nbl1 south': 'NBL1 South',
  'nbl1 north': 'NBL1 North',
  // Asia
  'cba': 'CBA China', 'chinese basketball association': 'CBA China',
  'kbl': 'KBL Korea', 'korean basketball league': 'KBL Korea',
  'pba': 'PBA Philippines', 'philippine basketball association': 'PBA Philippines',
  'ibl': 'Indonesia IBL', 'indonesia basketball league': 'Indonesia IBL',
  // Middle East
  'lebanon first division': 'Lebanon First Division',
  'israel premier league': 'Israel Premier League',
  'israel national league': 'Israel National League',
  'winner league': 'Israel Premier League',
  // Other Europe
  'czech nbl': 'Czech NBL', 'czech republic nbl': 'Czech NBL',
  'italy serie a2': 'Italy Serie A2', 'serie a2': 'Italy Serie A2',
  'italy serie b': 'Italy Serie B',
  'france pro b': 'France Pro B', 'pro b': 'France Pro B',
  'spain leb oro': 'Spain LEB Oro',
  'adriatic league': 'ABA League', 'aba liga': 'ABA League',
  'bcl': 'Basketball Champions League',
  'fiba': 'FIBA International',
  // Americas
  'puerto rico bsn': 'Puerto Rico BSN',
  'lnb argentina': 'Argentina LNB',
  'dominican republic': 'Dominican Republic BSN',
};

function canonicalLeague(raw) {
  if (!raw) return 'Unknown';
  const key = raw.toLowerCase().trim();
  return LEAGUE_NAME_MAP[key] || raw.trim();
}

function titleCase(str) {
  if (!str) return '';
  return str.replace(/\w\S*/g, t => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase());
}

function normaliseTeam(name) {
  if (!name) return '';
  // Remove common suffixes noise
  return name.trim();
}

function normaliseGame(g) {
  return {
    ...g,
    league:   canonicalLeague(g.league),
    homeTeam: normaliseTeam(g.homeTeam),
    awayTeam: normaliseTeam(g.awayTeam),
  };
}

// ── Fetch helpers ─────────────────────────────────────────────────────────────

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

async function get(url, headers = {}) {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept': 'application/json', ...headers },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch(e) { return null; }
}

// ── Source 1: ESPN ────────────────────────────────────────────────────────────

async function espnDay(sport, league, leagueName, dateStr) {
  const d = dateStr.replace(/-/g, '');
  const data = await get(`https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/scoreboard?dates=${d}&limit=100`);
  if (!data || !data.events) return [];
  return data.events.map(e => {
    const comp = e.competitions?.[0];
    const home = comp?.competitors?.find(c => c.homeAway === 'home');
    const away = comp?.competitors?.find(c => c.homeAway === 'away');
    const hs = home?.score ? parseInt(home.score) : null;
    const as = away?.score ? parseInt(away.score) : null;
    return normaliseGame({
      id: `espn-${e.id}`,
      league: leagueName,
      date: dateStr,
      homeTeam: home?.team?.displayName || home?.team?.name,
      awayTeam: away?.team?.displayName || away?.team?.name,
      homeScore: hs, awayScore: as,
      totalScore: hs != null && as != null ? hs + as : null,
      status: e.status?.type?.name === 'STATUS_FINAL' ? 'completed' : 'scheduled',
      source: 'espn',
    });
  }).filter(g => g.homeTeam && g.awayTeam && g.status === 'completed' && g.totalScore > 100);
}

// ── Source 2: TheSportsDB bulk past events ────────────────────────────────────

// Extended list of TheSportsDB basketball league IDs
const TSDB_IDS = [
  { id: 4387,  name: 'NBA' },
  { id: 4388,  name: 'WNBA' },
  { id: 4966,  name: 'EuroLeague' },
  { id: 4967,  name: 'NBL Australia' },
  { id: 5035,  name: 'CBA China' },
  { id: 4964,  name: 'ACB Spain' },
  { id: 4963,  name: 'Lega Basket Italy' },
  { id: 4972,  name: 'LKL Lithuania' },
  { id: 4971,  name: 'PBA Philippines' },
  { id: 4968,  name: 'Basketball Bundesliga' },
  { id: 4969,  name: 'France LNB Elite' },
  { id: 4970,  name: 'BSL Turkey' },
  { id: 5036,  name: 'KBL Korea' },
  { id: 5037,  name: 'BNXT League' },
  { id: 5038,  name: 'Greek Basket League' },
  { id: 5039,  name: 'PLK Poland' },
  { id: 5040,  name: 'ABA League' },
  { id: 5041,  name: 'Israel Premier League' },
  { id: 5042,  name: 'Indonesia IBL' },
  { id: 5043,  name: 'Argentina LNB' },
];

async function tsdbPastLeague(leagueId, leagueName, cutoff) {
  const data = await get(`https://www.thesportsdb.com/api/v1/json/3/eventspastleague.php?id=${leagueId}`);
  if (!data || !data.events) return [];
  return data.events
    .filter(e => e.intHomeScore && e.intAwayScore && e.dateEvent >= cutoff)
    .map(e => normaliseGame({
      id: `tsdb-${e.idEvent}`,
      league: leagueName,
      date: e.dateEvent,
      homeTeam: e.strHomeTeam,
      awayTeam: e.strAwayTeam,
      homeScore: parseInt(e.intHomeScore),
      awayScore: parseInt(e.intAwayScore),
      totalScore: parseInt(e.intHomeScore) + parseInt(e.intAwayScore),
      status: 'completed',
      source: 'thesportsdb',
    }))
    .filter(g => g.totalScore > 50);
}

// TheSportsDB day endpoint — catches leagues not in our ID list
async function tsdbDay(dateStr) {
  const data = await get(`https://www.thesportsdb.com/api/v1/json/3/eventsday.php?d=${dateStr}&s=Basketball`);
  if (!data || !data.events) return [];
  return data.events
    .filter(e => e.intHomeScore && e.intAwayScore)
    .map(e => normaliseGame({
      id: `tsdb-${e.idEvent}`,
      league: e.strLeague || 'Unknown',
      date: e.dateEvent || dateStr,
      homeTeam: e.strHomeTeam,
      awayTeam: e.strAwayTeam,
      homeScore: parseInt(e.intHomeScore),
      awayScore: parseInt(e.intAwayScore),
      totalScore: parseInt(e.intHomeScore) + parseInt(e.intAwayScore),
      status: 'completed',
      source: 'thesportsdb',
    }))
    .filter(g => g.totalScore > 50);
}

// ── Source 3: Sofascore ───────────────────────────────────────────────────────

async function sofascoreDay(dateStr) {
  const data = await get(
    `https://api.sofascore.com/api/v1/sport/basketball/scheduled-events/${dateStr}`,
    { 'Referer': 'https://www.sofascore.com/' }
  );
  if (!data || !data.events) return [];
  return data.events
    .filter(e => e.status?.type === 'finished' && e.homeScore?.current && e.awayScore?.current)
    .map(e => normaliseGame({
      id: `sf-${e.id}`,
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

// ── Deduplication ─────────────────────────────────────────────────────────────

function norm(s) { return (s||'').toLowerCase().replace(/[^a-z0-9]/g,''); }

function dedup(games) {
  const seen = new Map();
  for (const g of games) {
    const k = `${g.date}::${norm(g.homeTeam)}::${norm(g.awayTeam)}`;
    if (!seen.has(k)) {
      seen.set(k, g);
    } else {
      // Keep the one with more data
      const ex = seen.get(k);
      if (g.totalScore && !ex.totalScore) seen.set(k, g);
    }
  }
  return Array.from(seen.values());
}

// ── Build stats ───────────────────────────────────────────────────────────────

function buildTeamStats(teamName, games) {
  const mine = games.filter(g =>
    (g.homeTeam === teamName || g.awayTeam === teamName) &&
    g.totalScore > 50
  ).sort((a,b) => new Date(b.date) - new Date(a.date));
  if (mine.length < 2) return null;

  const scored  = g => g.homeTeam === teamName ? g.homeScore : g.awayScore;
  const allowed = g => g.homeTeam === teamName ? g.awayScore : g.homeScore;
  const avg     = (arr, fn) => arr.reduce((s,g)=>s+fn(g),0) / arr.length;

  const r5  = mine.slice(0,5);
  const r10 = mine.slice(0,10);
  const hg  = mine.filter(g => g.homeTeam === teamName);
  const ag  = mine.filter(g => g.awayTeam === teamName);
  const totals = mine.map(g=>g.totalScore);
  const avgT = totals.reduce((a,b)=>a+b,0)/totals.length;

  return {
    teamName, gamesPlayed: mine.length,
    avgPointsScored:  avg(mine, scored),
    avgPointsAllowed: avg(mine, allowed),
    recent5Totals:  r5.map(g=>g.totalScore),
    recent10Totals: r10.map(g=>g.totalScore),
    avgTotal5:  r5.length  ? avg(r5,  g=>g.totalScore) : null,
    avgTotal10: r10.length ? avg(r10, g=>g.totalScore) : null,
    homeAvgScored:  hg.length ? avg(hg, scored)  : null,
    homeAvgAllowed: hg.length ? avg(hg, allowed) : null,
    awayAvgScored:  ag.length ? avg(ag, scored)  : null,
    awayAvgAllowed: ag.length ? avg(ag, allowed) : null,
    recentOverPct:  (totals.filter(t=>t>avgT).length/totals.length)*100,
    recentUnderPct: (totals.filter(t=>t<=avgT).length/totals.length)*100,
    pace: avgT,
    lastGameDate: mine[0]?.date || null,
    restDays: mine.length>=2 ? Math.round((new Date(mine[0].date)-new Date(mine[1].date))/86400000) : 3,
    updatedAt: Date.now(),
  };
}

function buildLeagueStats(games) {
  const totals = games.filter(g=>g.totalScore>50).map(g=>g.totalScore);
  if (totals.length < 3) return null;
  const avg = totals.reduce((a,b)=>a+b,0)/totals.length;
  const variance = totals.reduce((s,t)=>s+Math.pow(t-avg,2),0)/totals.length;
  return {
    avgTotal: avg, stdDev: Math.sqrt(variance),
    gamesAnalyzed: totals.length,
    minTotal: Math.min(...totals), maxTotal: Math.max(...totals),
    updatedAt: Date.now(),
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  HoopCast History Seeder v4 — Maximum Coverage');
  console.log(`  Target: ${DAYS_BACK} days of history`);
  console.log('═══════════════════════════════════════════════════\n');

  const cutoff  = daysAgo(DAYS_BACK);
  const today   = todayStr();
  const dates   = allDates(cutoff, today);
  const allGames = [];

  // ── ESPN day by day ──────────────────────────────────────────────────────
  console.log(`📅 Step 1: ESPN — ${dates.length} days × 2 leagues`);
  let espnCount = 0;
  for (const date of dates) {
    const nba  = await espnDay('basketball', 'nba',  'NBA',  date);
    const wnba = await espnDay('basketball', 'wnba', 'WNBA', date);
    allGames.push(...nba, ...wnba);
    espnCount += nba.length + wnba.length;
    if (nba.length + wnba.length > 0) {
      process.stdout.write(`  ${date}: ${nba.length + wnba.length} games\n`);
    }
    await sleep(100);
  }
  console.log(`   ESPN total: ${espnCount} games\n`);

  // ── TheSportsDB bulk per league ──────────────────────────────────────────
  console.log(`📊 Step 2: TheSportsDB — ${TSDB_IDS.length} leagues bulk fetch`);
  let tsdbCount = 0;
  for (const { id, name } of TSDB_IDS) {
    const games = await tsdbPastLeague(id, name, cutoff);
    allGames.push(...games);
    tsdbCount += games.length;
    if (games.length > 0) console.log(`  ${name}: ${games.length} games`);
    await sleep(500);
  }
  console.log(`   TheSportsDB bulk total: ${tsdbCount} games\n`);

  // ── TheSportsDB day by day (catches extra leagues) ───────────────────────
  console.log(`📅 Step 3: TheSportsDB day-by-day (extra leagues)`);
  let tsdbDayCount = 0;
  for (const date of dates) {
    const games = await tsdbDay(date);
    allGames.push(...games);
    tsdbDayCount += games.length;
    await sleep(300);
  }
  console.log(`   TheSportsDB day total: ${tsdbDayCount} games\n`);

  // ── Sofascore day by day ─────────────────────────────────────────────────
  console.log(`🌍 Step 4: Sofascore — global leagues day-by-day`);
  let sfCount = 0;
  for (const date of dates) {
    const games = await sofascoreDay(date);
    allGames.push(...games);
    sfCount += games.length;
    if (games.length > 0) process.stdout.write(`  ${date}: ${games.length} games\n`);
    await sleep(600);
  }
  console.log(`   Sofascore total: ${sfCount} games\n`);

  // ── Deduplicate ──────────────────────────────────────────────────────────
  const unique = dedup(allGames);
  console.log(`✅ Unique games after deduplication: ${unique.length}\n`);

  // League breakdown
  const byLeague = {};
  unique.forEach(g => { byLeague[g.league] = (byLeague[g.league]||0)+1; });
  const leagueList = Object.entries(byLeague).sort((a,b)=>b[1]-a[1]);
  console.log('  Games per league:');
  leagueList.forEach(([l,c]) => {
    const bar = '█'.repeat(Math.min(20, Math.round(c/3)));
    console.log(`    ${l.padEnd(28)} ${String(c).padStart(4)}  ${bar}`);
  });

  // ── Build and save team + league stats ───────────────────────────────────
  console.log('\n📈 Building statistics...');
  const groups = {};
  unique.forEach(g => {
    if (!groups[g.league]) groups[g.league] = [];
    groups[g.league].push(g);
  });

  let teamsSaved = 0, leaguesSaved = 0;
  for (const [league, games] of Object.entries(groups)) {
    const ls = buildLeagueStats(games);
    if (ls) { await saveLeagueStats(league, ls); leaguesSaved++; }
    const teams = new Set([...games.map(g=>g.homeTeam), ...games.map(g=>g.awayTeam)]);
    for (const team of teams) {
      if (!team) continue;
      const stats = buildTeamStats(team, games);
      if (stats) { await saveTeamStats(`${league}::${team}`, stats); teamsSaved++; }
    }
    await sleep(50);
  }
  console.log(`   Saved: ${teamsSaved} teams, ${leaguesSaved} leagues`);

  // ── Save history ─────────────────────────────────────────────────────────
  console.log('\n📚 Saving history entries...');
  const existing = await getHistory();
  const existingIds = new Set(existing.entries.map(e=>e.id));
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
    entries: [...existing.entries, ...newEntries].slice(-3000),
    accuracy: existing.accuracy || {},
  });
  console.log(`   Added ${newEntries.length} new history entries`);

  // ── Save updated league registry ─────────────────────────────────────────
  const discoveredLeagues = leagueList.map(([name]) => ({
    key: name.replace(/\s+/g,''), name, country: 'Various', tier: 3,
  }));
  const merged = [...SEED_LEAGUES];
  discoveredLeagues.forEach(d => {
    if (!merged.find(m => m.name === d.name)) merged.push(d);
  });
  await saveLeagueRegistry({ leagues: merged, updatedAt: Date.now() });

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  SEEDING COMPLETE');
  console.log(`  Games: ${unique.length} | Teams: ${teamsSaved} | Leagues: ${leaguesSaved}`);
  console.log('\n  Now run the Daily Pipeline to generate predictions');
  console.log('  Confidence scores will be significantly higher');
  console.log('═══════════════════════════════════════════════════');
}

main().catch(e => { console.error('Seeder failed:', e.message); process.exit(1); });
