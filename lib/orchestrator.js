/**
 * HoopCast Daily Orchestrator — v3
 * Supports 3-day lookahead predictions.
 * Robust multi-source fixture fetching.
 */

import {
  getLeagueRegistry, saveLeagueRegistry,
  getCachedFixtures, cacheFixtures,
  getPredictions, savePredictions,
  getTeamStats, saveTeamStats,
  getLeagueStats, saveLeagueStats,
  getHistory, saveHistory,
  getLeagueAccuracy, saveLeagueAccuracy,
  getSystemStatus, saveSystemStatus,
} from './store.js';

import {
  fetchFixturesForDate,
  fetchFixturesMultiDay,
  discoverLeagues,
  buildTeamStatsFromGames,
  buildLeagueStats,
  SEED_LEAGUES,
  nigeriaDateStr,
  addDays,
} from './scraper.js';

import { predictGame, updateAccuracy, estimateLine } from './engine.js';

const LOOKAHEAD_DAYS = 3;

function normalise(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// ── Main entry ────────────────────────────────────────────────────────────────

export async function runDailyPipeline(targetDate = null) {
  const startTime = Date.now();
  const dateStr = targetDate || nigeriaDateStr();
  const errors = [];

  console.log(`\n[HoopCast] ═══════════════════════════════════════`);
  console.log(`[HoopCast] Daily pipeline: ${dateStr}`);
  console.log(`[HoopCast] Lookahead: ${LOOKAHEAD_DAYS} days`);
  console.log(`[HoopCast] ═══════════════════════════════════════\n`);

  try {
    // 1. Update league registry
    console.log('[Step 1] Updating league registry...');
    await updateLeagueRegistry();

    // 2. Fetch fixtures — today + next 3 days
    console.log(`[Step 2] Fetching fixtures (${dateStr} + ${LOOKAHEAD_DAYS} days ahead)...`);
    const allFixtures = await fetchAndCacheMultiDay(dateStr);
    const todayFixtures = allFixtures.filter(f => f.date === dateStr);
    console.log(`[Step 2] Total fixtures: ${allFixtures.length} across ${LOOKAHEAD_DAYS+1} days`);
    console.log(`[Step 2] Today: ${todayFixtures.length}`);

    // 3. Update completed games from yesterday
    const yesterday = nigeriaDateStr(new Date(Date.now() - 86400000));
    console.log(`[Step 3] Updating results for ${yesterday}...`);
    await updateCompletedGames(yesterday);

    // 4. Update team stats using all fetched games
    console.log('[Step 4] Updating team statistics...');
    await updateTeamAndLeagueStats(allFixtures);

    // 5. Generate predictions for each upcoming date
    console.log('[Step 5] Generating predictions...');
    let totalPredictions = 0;
    for (let i = 0; i <= LOOKAHEAD_DAYS; i++) {
      const predDate = addDays(dateStr, i);
      const dayFixtures = allFixtures.filter(f => f.date === predDate);
      const label = i === 0 ? 'TODAY' : i === 1 ? 'TOMORROW' : `+${i} days`;
      console.log(`         ${predDate} (${label}): ${dayFixtures.length} fixtures`);
      const predictions = await generatePredictions(dayFixtures, predDate);
      await savePredictions(predDate, predictions);
      totalPredictions += predictions.length;
    }
    console.log(`[Step 5] Total predictions generated: ${totalPredictions}`);

    // 6. Update history and accuracy
    console.log('[Step 6] Updating history and accuracy...');
    await updateHistoryAndAccuracy();

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const status = {
      lastRun: new Date().toISOString(),
      lastSuccess: new Date().toISOString(),
      lastRunDate: dateStr,
      predictionsGenerated: totalPredictions,
      fixturesFound: allFixtures.length,
      leaguesCovered: [...new Set(allFixtures.map(f=>f.league))].length,
      lookaheadDays: LOOKAHEAD_DAYS,
      elapsedSeconds: elapsed,
      errors,
    };
    await saveSystemStatus(status);

    console.log(`\n[HoopCast] ✅ Complete in ${elapsed}s`);
    console.log(`[HoopCast]    Fixtures:    ${allFixtures.length}`);
    console.log(`[HoopCast]    Predictions: ${totalPredictions}`);
    return status;

  } catch(err) {
    errors.push(err.message);
    console.error('[HoopCast] ❌ Error:', err.message);
    const status = await getSystemStatus();
    await saveSystemStatus({ ...status, lastRun: new Date().toISOString(), errors: [err.message] });
    throw err;
  }
}

// ── Step 1: League Registry ───────────────────────────────────────────────────

async function updateLeagueRegistry() {
  const existing = await getLeagueRegistry();
  const now = Date.now();
  if (existing.leagues?.length > 0 && now - existing.updatedAt < 7*86400000) return existing;
  let discovered = [];
  try { discovered = await discoverLeagues(); } catch(e) {}
  const merged = mergeLeagues(SEED_LEAGUES, discovered);
  await saveLeagueRegistry({ leagues: merged, updatedAt: now });
  console.log(`         Registry: ${merged.length} leagues`);
  return { leagues: merged };
}

function mergeLeagues(seeds, discovered) {
  const map = new Map();
  seeds.forEach(l => map.set(l.key, l));
  discovered.forEach(l => { if (!map.has(l.key) && !map.has(l.name)) map.set(l.key, l); });
  return Array.from(map.values());
}

// ── Step 2: Multi-day fixture fetch ──────────────────────────────────────────

async function fetchAndCacheMultiDay(dateStr) {
  const all = [];
  for (let i = 0; i <= LOOKAHEAD_DAYS; i++) {
    const d = addDays(dateStr, i);
    const cached = await getCachedFixtures('all', d);
    if (cached && cached.length > 0) {
      console.log(`         [cache] ${d}: ${cached.length} fixtures`);
      all.push(...cached);
    } else {
      const fixtures = await fetchFixturesForDate(d, []);
      if (fixtures.length > 0) await cacheFixtures('all', d, fixtures);
      all.push(...fixtures);
    }
  }
  return all;
}

// ── Step 3: Update completed games ───────────────────────────────────────────

async function updateCompletedGames(dateStr) {
  const predictions = await getPredictions(dateStr);
  if (!predictions.length) return;

  const fixtures = await fetchFixturesForDate(dateStr, []);
  let updated = false;

  for (const pred of predictions) {
    if (pred.result !== null) continue;
    const match = fixtures.find(f =>
      normalise(f.homeTeam) === normalise(pred.homeTeam) &&
      normalise(f.awayTeam) === normalise(pred.awayTeam) &&
      f.status === 'completed'
    );
    if (match && match.totalScore != null) {
      pred.actualTotal = match.totalScore;
      pred.actualHome  = match.homeScore;
      pred.actualAway  = match.awayScore;
      pred.status      = 'completed';
      pred.result      = pred.prediction === 'OVER'
        ? match.totalScore > pred.line
        : match.totalScore <= pred.line;
      updated = true;
      console.log(`         ✓ ${pred.homeTeam} vs ${pred.awayTeam}: ${match.totalScore} (${pred.result ? 'CORRECT' : 'WRONG'})`);
    }
  }

  if (updated) {
    await savePredictions(dateStr, predictions);
    await appendToHistory(predictions.filter(p => p.result !== null));
  }
}

async function appendToHistory(resolved) {
  const history = await getHistory();
  const existing = new Set(history.entries.map(e => e.id));
  resolved.forEach(p => {
    if (!existing.has(p.id)) {
      history.entries.push({
        id: p.id, date: p.date, league: p.league,
        homeTeam: p.homeTeam, awayTeam: p.awayTeam,
        prediction: p.prediction, line: p.line,
        expectedTotal: p.expectedTotal,
        confidence: p.confidence, confidenceColor: p.confidenceColor,
        actualTotal: p.actualTotal, result: p.result,
      });
    }
  });
  if (history.entries.length > 2000) history.entries = history.entries.slice(-2000);
  await saveHistory(history);
}

// ── Step 4: Stats ─────────────────────────────────────────────────────────────

async function updateTeamAndLeagueStats(allFixtures) {
  const leagues = [...new Set(allFixtures.map(f => f.league))];
  for (const league of leagues) {
    const games = allFixtures.filter(f => f.league === league);
    const completed = games.filter(f => f.status === 'completed');
    if (completed.length >= 3) {
      const ls = buildLeagueStats(completed);
      if (ls) await saveLeagueStats(league, ls);
    }
    const teams = [...new Set([...games.map(f=>f.homeTeam), ...games.map(f=>f.awayTeam)])].filter(Boolean);
    for (const team of teams) {
      const existing = await getTeamStats(`${league}::${team}`);
      if (existing && Date.now() - existing.updatedAt < 6*3600000) continue;
      const stats = buildTeamStatsFromGames(team, games);
      if (stats) await saveTeamStats(`${league}::${team}`, stats);
    }
  }
}

// ── Step 5: Generate Predictions ──────────────────────────────────────────────

async function generatePredictions(fixtures, dateStr) {
  const scheduled = fixtures.filter(f => f.status === 'scheduled' || f.status === 'live');
  const leagueAccMap = await getLeagueAccuracy();
  const predictions = [];

  for (const fixture of scheduled) {
    if (!fixture.homeTeam || !fixture.awayTeam) continue;
    const homeStats   = await getTeamStats(`${fixture.league}::${fixture.homeTeam}`);
    const awayStats   = await getTeamStats(`${fixture.league}::${fixture.awayTeam}`);
    const leagueStats = await getLeagueStats(fixture.league);
    const leagueAcc   = leagueAccMap[fixture.league] || null;
    const line        = estimateLine(homeStats, awayStats, leagueStats);
    const result      = predictGame(homeStats, awayStats, leagueStats, line, leagueAcc);

    predictions.push({
      id: `${fixture.id || fixture.league+'-'+normalise(fixture.homeTeam)+'-'+normalise(fixture.awayTeam)}-${dateStr}`,
      date: dateStr,
      league: fixture.league,
      homeTeam: fixture.homeTeam,
      awayTeam: fixture.awayTeam,
      line,
      lineSource: 'model-estimated',
      multiSourceValidated: fixture.multiSourceValidated || false,
      ...result,
      status: fixture.status,
      result: null,
      actualTotal: null,
      generatedAt: new Date().toISOString(),
    });
  }
  predictions.sort((a,b) => b.confidence - a.confidence);
  return predictions;
}

// ── Step 6: History & Accuracy ────────────────────────────────────────────────

async function updateHistoryAndAccuracy() {
  const history = await getHistory();
  if (!history.entries.length) return;
  const accuracy = updateAccuracy(history.entries);
  history.accuracy = accuracy;
  await saveHistory(history);
  const leagueMap = {};
  for (const [league, data] of Object.entries(accuracy.byLeague || {})) {
    leagueMap[league] = { accuracy: data.accuracy, gamesTracked: data.gamesTracked };
  }
  await saveLeagueAccuracy(leagueMap);
}
