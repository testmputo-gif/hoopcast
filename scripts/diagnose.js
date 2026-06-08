/**
 * HoopCast System Diagnostic
 * Pulls every component and reports its health status.
 * Run this from GitHub Actions to get a full picture of what is working.
 */

import { getHistory, getLeagueRegistry, getSystemStatus, getLeagueAccuracy, getLeagueStats } from '../lib/store.js';

function separator(title) {
  const line = '═'.repeat(55);
  console.log(`\n${line}`);
  if (title) console.log(`  ${title}`);
  console.log(line);
}

function row(label, value, status) {
  const icon = status === 'ok' ? '✅' : status === 'warn' ? '⚠️ ' : status === 'info' ? 'ℹ️ ' : '❌';
  console.log(`  ${icon}  ${label.padEnd(30)} ${value}`);
}

async function main() {
  separator('HOOPCAST SYSTEM DIAGNOSTIC REPORT');
  console.log(`  Run time: ${new Date().toLocaleString('en-NG', { timeZone: 'Africa/Lagos' })} (Nigeria time)`);
  console.log(`  Environment: GitHub Actions`);

  // ── 1. ENVIRONMENT VARIABLES ───────────────────────────────────────────────
  separator('1. ENVIRONMENT CHECK');
  const hasOwner = !!process.env.GITHUB_OWNER;
  const hasRepo  = !!process.env.GITHUB_REPO;
  const hasToken = !!process.env.GITHUB_TOKEN;
  const hasBball = !!process.env.API_BASKETBALL_KEY;

  row('GITHUB_OWNER set',        hasOwner ? process.env.GITHUB_OWNER : 'MISSING',       hasOwner ? 'ok' : 'error');
  row('GITHUB_REPO set',         hasRepo  ? process.env.GITHUB_REPO  : 'MISSING',       hasRepo  ? 'ok' : 'error');
  row('GITHUB_TOKEN set',        hasToken ? 'YES (hidden)'           : 'MISSING',       hasToken ? 'ok' : 'error');
  row('API_BASKETBALL_KEY set',  hasBball ? 'YES (optional)'         : 'Not set (OK)',  'info');

  // ── 2. GITHUB STORAGE CHECK ────────────────────────────────────────────────
  separator('2. GITHUB DATA STORAGE');
  try {
    const status = await getSystemStatus();
    if (status && status.lastRun) {
      row('System status file',   'Found',                                           'ok');
      row('Last pipeline run',    new Date(status.lastRun).toLocaleString('en-NG',
                                  { timeZone: 'Africa/Lagos' }),                     'info');
      row('Last success',         status.lastSuccess
                                  ? new Date(status.lastSuccess).toLocaleString('en-NG',
                                    { timeZone: 'Africa/Lagos' })
                                  : 'Never',
                                  status.lastSuccess ? 'ok' : 'warn');
      row('Predictions generated',String(status.predictionsGenerated || 0),
                                  (status.predictionsGenerated || 0) > 0 ? 'ok' : 'warn');
      row('Leagues covered',      String(status.leaguesCovered || 0),                'info');
      if (status.errors && status.errors.length > 0) {
        row('Last errors',        status.errors.join(' | '),                         'error');
      } else {
        row('Last errors',        'None',                                             'ok');
      }
    } else {
      row('System status file',   'Empty or not found',                              'warn');
    }
  } catch(e) {
    row('System status file',     `ERROR: ${e.message}`,                             'error');
  }

  // ── 3. LEAGUE REGISTRY ─────────────────────────────────────────────────────
  separator('3. LEAGUE REGISTRY');
  try {
    const registry = await getLeagueRegistry();
    const count = registry.leagues?.length || 0;
    row('Leagues registered',     String(count),                                     count > 5 ? 'ok' : 'warn');
    if (count > 0) {
      const names = registry.leagues.slice(0, 8).map(l => l.name || l.key).join(', ');
      row('Sample leagues',       names + (count > 8 ? '...' : ''),                 'info');
      const updatedAgo = registry.updatedAt
        ? Math.round((Date.now() - registry.updatedAt) / 3600000) + 'h ago'
        : 'Unknown';
      row('Registry last updated',updatedAgo,                                        'info');
    }
  } catch(e) {
    row('League registry',        `ERROR: ${e.message}`,                             'error');
  }

  // ── 4. HISTORY & GAME DATA ─────────────────────────────────────────────────
  separator('4. HISTORICAL DATA');
  try {
    const history = await getHistory();
    const entries = history.entries || [];
    const total = entries.length;
    const withScores = entries.filter(e => e.actualTotal != null && e.actualTotal > 0).length;
    const withPredictions = entries.filter(e => e.prediction != null).length;
    const resolved = entries.filter(e => e.result !== null && e.result !== undefined).length;

    row('Total history entries',  String(total),                                     total > 10 ? 'ok' : 'warn');
    row('Games with real scores', String(withScores),                                withScores > 10 ? 'ok' : 'warn');
    row('Games with predictions', String(withPredictions),                           'info');
    row('Resolved predictions',   String(resolved),                                  'info');

    // League breakdown
    const byLeague = {};
    entries.forEach(e => {
      if (!byLeague[e.league]) byLeague[e.league] = 0;
      byLeague[e.league]++;
    });
    const leagueList = Object.entries(byLeague).sort((a,b) => b[1]-a[1]);
    console.log('\n  Games per league:');
    if (leagueList.length === 0) {
      console.log('    ❌  No league data found');
    } else {
      leagueList.forEach(([league, count]) => {
        const bar = '█'.repeat(Math.min(20, Math.round(count / 2)));
        console.log(`    ${league.padEnd(25)} ${String(count).padStart(4)} games  ${bar}`);
      });
    }

    // Date range
    const dates = entries.map(e => e.date).filter(Boolean).sort();
    if (dates.length > 0) {
      row('\n  Oldest game date',  dates[0],                                         'info');
      row('  Newest game date',   dates[dates.length - 1],                           'info');
    }

  } catch(e) {
    row('History data',           `ERROR: ${e.message}`,                             'error');
  }

  // ── 5. PREDICTIONS CHECK ───────────────────────────────────────────────────
  separator('5. RECENT PREDICTIONS');
  try {
    const history = await getHistory();
    const entries = history.entries || [];
    const preds = entries.filter(e => e.prediction != null);
    const today = new Date().toLocaleString('en-NG', { timeZone: 'Africa/Lagos' }).split(',')[0];

    if (preds.length === 0) {
      row('Predictions generated', 'NONE YET',                                       'warn');
      console.log('\n  ⚠️   DIAGNOSIS: No predictions have been generated yet.');
      console.log('       Possible reasons:');
      console.log('       1. No basketball games were scheduled on dates pipeline ran');
      console.log('       2. NBA off-season (June-September = very few games)');
      console.log('       3. Data sources returned no fixtures');
      console.log('       4. Sofascore/TheSportsDB blocked the request');
    } else {
      row('Total predictions made', String(preds.length),                            'ok');
      const byConf = { green: 0, lemon: 0, blue: 0, red: 0 };
      preds.forEach(p => { if (byConf[p.confidenceColor] !== undefined) byConf[p.confidenceColor]++; });
      row('Green (90-100%)',       String(byConf.green),                             'info');
      row('Lemon (80-89%)',        String(byConf.lemon),                             'info');
      row('Blue (70-79%)',         String(byConf.blue),                              'info');
      row('Red (<70%)',            String(byConf.red),                               'info');
    }
  } catch(e) {
    row('Predictions check',      `ERROR: ${e.message}`,                             'error');
  }

  // ── 6. ACCURACY ────────────────────────────────────────────────────────────
  separator('6. ACCURACY TRACKING');
  try {
    const history = await getHistory();
    const acc = history.accuracy || {};
    row('Overall accuracy',       acc.overall != null ? acc.overall + '%' : 'Not enough data yet', 
                                  acc.overall != null ? 'ok' : 'info');
    row('30-day accuracy',        acc.rolling30 != null ? acc.rolling30 + '%' : 'Not enough data yet',
                                  acc.rolling30 != null ? 'ok' : 'info');
    row('Green tier accuracy',    acc.byColor?.green != null ? acc.byColor.green + '%' : 'No data', 'info');
    row('Lemon tier accuracy',    acc.byColor?.lemon != null ? acc.byColor.lemon + '%' : 'No data', 'info');

    const leagueAcc = await getLeagueAccuracy();
    const leagueCount = Object.keys(leagueAcc).length;
    row('Leagues with accuracy',  String(leagueCount),                              leagueCount > 0 ? 'ok' : 'info');
  } catch(e) {
    row('Accuracy data',          `ERROR: ${e.message}`,                             'error');
  }

  // ── 7. DATA SOURCES TEST ───────────────────────────────────────────────────
  separator('7. LIVE DATA SOURCE TEST');
  console.log('  Testing if free data sources are reachable right now...\n');

  // Test TheSportsDB
  try {
    const r = await fetch('https://www.thesportsdb.com/api/v1/json/3/search_all_leagues.php?s=Basketball',
      { signal: AbortSignal.timeout(8000) });
    row('TheSportsDB API',        r.ok ? `Reachable (${r.status})` : `Error ${r.status}`, r.ok ? 'ok' : 'error');
  } catch(e) {
    row('TheSportsDB API',        `Unreachable: ${e.message}`,                       'error');
  }

  // Test Sofascore
  try {
    const r = await fetch('https://api.sofascore.com/api/v1/sport/basketball/events/live',
      { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.sofascore.com/' },
        signal: AbortSignal.timeout(8000) });
    row('Sofascore API',          r.ok ? `Reachable (${r.status})` : `Blocked (${r.status})`, r.ok ? 'ok' : 'warn');
  } catch(e) {
    row('Sofascore API',          `Unreachable: ${e.message}`,                       'error');
  }

  // Test BallDontLie
  try {
    const r = await fetch('https://api.balldontlie.io/v1/games?per_page=1',
      { signal: AbortSignal.timeout(8000) });
    row('BallDontLie API',        r.ok ? `Reachable (${r.status})` : `Requires key (${r.status})`,
                                  r.ok ? 'ok' : 'warn');
  } catch(e) {
    row('BallDontLie API',        `Unreachable: ${e.message}`,                       'error');
  }

  // Test GitHub API (our storage)
  try {
    const r = await fetch(`https://api.github.com/repos/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}`,
      { headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` },
        signal: AbortSignal.timeout(8000) });
    row('GitHub Storage API',     r.ok ? `Connected (${r.status})` : `Error ${r.status}`, r.ok ? 'ok' : 'error');
  } catch(e) {
    row('GitHub Storage API',     `Error: ${e.message}`,                             'error');
  }

  // ── 8. BASKETBALL SEASON CHECK ─────────────────────────────────────────────
  separator('8. BASKETBALL SEASON STATUS');
  const month = new Date().getMonth() + 1; // 1-12
  console.log('  Current active leagues by month:\n');

  const seasonStatus = [
    { league: 'NBA',              active: month >= 10 || month <= 6,  season: 'Oct–Jun' },
    { league: 'NBA Playoffs',     active: month >= 4 && month <= 6,   season: 'Apr–Jun' },
    { league: 'WNBA',            active: month >= 5 && month <= 10,  season: 'May–Oct' },
    { league: 'EuroLeague',       active: month >= 10 || month <= 5,  season: 'Oct–May' },
    { league: 'ACB Spain',        active: month >= 9 || month <= 6,   season: 'Sep–Jun' },
    { league: 'Lega Basket Italy',active: month >= 9 || month <= 6,   season: 'Sep–Jun' },
    { league: 'Bundesliga',       active: month >= 9 || month <= 5,   season: 'Sep–May' },
    { league: 'NBL Australia',    active: month >= 9 || month <= 3,   season: 'Sep–Mar' },
    { league: 'CBA China',        active: month >= 10 || month <= 4,  season: 'Oct–Apr' },
    { league: 'KBL Korea',        active: month >= 10 || month <= 3,  season: 'Oct–Mar' },
    { league: 'PBA Philippines',  active: true,                       season: 'Year-round' },
    { league: 'FIBA World events',active: month >= 6 && month <= 9,   season: 'Jun–Sep (summers)' },
  ];

  seasonStatus.forEach(s => {
    row(s.league, `${s.active ? 'IN SEASON' : 'OFF SEASON'} (${s.season})`,
        s.active ? 'ok' : 'warn');
  });

  const activeCount = seasonStatus.filter(s => s.active).length;
  console.log(`\n  Active leagues right now: ${activeCount} of ${seasonStatus.length}`);
  if (activeCount <= 3) {
    console.log('\n  ⚠️   LOW SEASON PERIOD detected.');
    console.log('       This explains why few fixtures are being found.');
    console.log('       October is when activity resumes fully across all leagues.');
  }

  // ── FINAL SUMMARY ──────────────────────────────────────────────────────────
  separator('SUMMARY & RECOMMENDED ACTIONS');

  const now = new Date();
  const isOffSeason = (now.getMonth() + 1) >= 6 && (now.getMonth() + 1) <= 9;

  if (isOffSeason) {
    console.log(`
  The core reason for low predictions right now is the
  GLOBAL BASKETBALL OFF-SEASON (June–September).

  Most major leagues have finished their seasons:
  • NBA Finals ended June 2026
  • EuroLeague finished May 2026
  • Most European leagues on summer break

  Leagues still active this period:
  • WNBA (USA women) — active until October
  • PBA Philippines — year-round
  • FIBA Summer tournaments
  • Some lower-tier leagues

  RECOMMENDED ACTIONS:
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  1. This is a PERFECT time to test and refine the system
     without pressure. Use this period to fix bugs.

  2. Run the daily pipeline every day — even if 0-2 games
     are found. This trains the system habits.

  3. The WNBA season is active. Let us add WNBA fixtures
     as a priority data source for summer predictions.

  4. Full league coverage resumes October 2026 when NBA,
     EuroLeague, and all European leagues start again.
     That is when this system will shine at full capacity.

  5. Use this time to complete the UI redesign and
     Eastpoint Technologies branding.
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `);
  }

  separator('END OF DIAGNOSTIC REPORT');
  console.log('');
}

main().catch(err => {
  console.error('\n❌ Diagnostic failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
