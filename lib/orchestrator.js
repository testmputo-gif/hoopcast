/**
 * HoopCast Daily Orchestrator
 * Updated to use the new multi-source scraper.
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
  discoverLeagues,
  buildTeamStatsFromGames,
  buildLeagueStats,
  SEED_LEAGUES,
  nigeriaDateStr,
} from './scraper.js';

import { predictGame, updateAccuracy, estimateLine } from './engine.js';

// ── Main entry ────────────────────────────────────────────────────────────────

export async function runDailyPipeline(targetDate = null) {
  const startTime = Date.now();
  const dateStr = targetDate || nigeriaDateStr();
  const errors = [];

  console.log(`\n[HoopCast] ═══════════════════════════════════`);
  console.log(`[HoopCast] Daily pipeline starting: ${dateStr}`);
  console.log(`[HoopCast] ═══════════════════════════════════\n`);

  try {
    // 1. Update league registry
    console.log('[HoopCast] Step 1: Updating league registry...');
    await updateLeagueRegistry();

    // 2. Fetch fixtures for today
    console.log('[HoopCast] Step 2: Fetching fixtures...');
    const registry = await getLeagueRegistry();
    const leagueKeys = (registry.leagues || SEED_LEAGUES).map(l => l.key);
    const fixtures = await fetchAndCacheFixtures(dateStr, leagueKeys);
    console.log(`[HoopCast] Found ${fixtures.length} fixtures for ${dateStr}`);

    // 3. Update completed games from yesterday
    const yesterday = nigeriaDateStr(new Date(Date.now() - 86400000));
    console.log(`[HoopCast] Step 3: Updating results for ${yesterday}...`);
    await updateCompletedGames(yesterday);

    // 4. Update team and league stats
    console.log('[HoopCast] Step 4: Updating team stats...');
    await updateTeamAndLeagueStats(fixtures);

    // 5. Generate predictions for today
    console.log('[HoopCast] Step 5: Generating predictions...');
    const predictions = await generatePredictions(fixtures, dateStr);
    await savePredictions(dateStr, predictions);
    console.log(`[HoopCast] Generated ${predictions.length} predictions`);

    // 6. Update history and accuracy
    console.log('[HoopCast] Step 6: Updating history and accuracy...');
    await updateHistoryAndAccuracy();

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const status = {
      lastRun: new Date().toISOString(),
      lastSuccess: new Date().toISOString(),
      lastRunDate: dateStr,
      predictionsGenerated: predictions.length,
      fixturesFound: fixtures.length,
      leaguesCovered: leagueKeys.length,
      elapsedSeconds: elapsed,
      errors,
    };
    await saveSystemStatus(status);

    console.log(`\n[HoopCast] ✅ Pipeline complete in ${elapsed}s`);
    console.log(`[HoopCast]    Fixtures found:   ${fixtures.length}`);
    console.log(`[HoopCast]    Predictions made: ${predictions.length}`);
    return status;

  } catch(err) {
    errors.push(err.message);
    console.error('[HoopCast] ❌ Pipeline error:', err.message);
    const status = await getSystemStatus();
    await saveSystemStatus({
      ...status,
      lastRun: new Date().toISOString(),
      errors: [err.message],
    });
    throw err;
  }
}

// ── Step 1: League Registry ───────────────────────────────────────────────────

async function updateLeagueRegistry() {
  const existing = await getLeagueRegistry();
  const now = Date.now();
  if (existing.leagues && existing.leagues.length > 0 && now - existing.updatedAt < 7 * 86400000) {
    console.log(`[HoopCast]    Registry up to date (${existing.leagues.length} leagues)`);
    return existing;
  }
  let discovered = [];
  try { discovered = await discoverLeagues(); } catch(e) { /* ignore */ }
  const merged = mergeLeagues(SEED_LEAGUES, discovered);
  const registry = { leagues: merged, updatedAt: now };
  await saveLeagueRegistry(registry);
  console.log(`[HoopCast]    Registry updated: ${merged.length} leagues`);
  return registry;
}

function mergeLeagues(seeds, discovered) {
  const map = new Map();
  seeds.forEach(l => map.set(l.key, l));
  discovered.forEach(l => { if (!map.has(l.key) && !map.has(l.name)) map.set(l.key, l); });
  return Array.from(map.values());
}

// ── Step 2: Fixtures ──────────────────────────────────────────────────────────

async function fetchAndCacheFixtures(dateStr, leagueKeys) {
  const cached = await getCachedFixtures('all', dateStr);
  if (cached && cached.length > 0) {
    console.log('[HoopCast]    Using cached fixtures');
    return cached;
  }
  const fixtures = await fetchFixturesForDate(dateStr, leagueKeys);
  if (fixtures.length > 0) await cacheFixtures('all', dateStr, fixtures);
  return fixtures;
}

// ── Step 3: Update completed games ───────────────────────────────────────────

async function updateCompletedGames(dateStr) {
  const predictions = await getPredictions(dateStr);
  if (!predictions.length) return;

  // Fetch yesterday's results fresh (no cache)
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
    }
  }

  if (updated) {
    await savePredictions(dateStr, predictions);
    await appendToHistory(predictions.filter(p => p.result !== null));
    console.log('[HoopCast]    Results updated for yesterday');
  } else {
    console.log('[HoopCast]    No new results to update');
  }
}

function normalise(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function appendToHistory(resolvedPredictions) {
  const history = await getHistory();
  const existing = new Set(history.entries.map(e => e.id));
  for (const p of resolvedPredictions) {
    if (!existing.has(p.id)) {
      history.entries.push({
        id: p.id, date: p.date, league: p.league,
        homeTeam: p.homeTeam, awayTeam: p.awayTeam,
        prediction: p.prediction, line: p.line,
        expectedTotal: p.expectedTotal,
        confidence: p.confidence,
        confidenceColor: p.confidenceColor,
        actualTotal: p.actualTotal,
        result: p.result,
      });
    }
  }
  if (history.entries.length > 2000) history.entries = history.entries.slice(-2000);
  await saveHistory(history);
}

// ── Step 4: Team & League Stats ───────────────────────────────────────────────

async function updateTeamAndLeagueStats(todayFixtures) {
  const leaguesInPlay = [...new Set(todayFixtures.map(f => f.league))];

  for (const leagueName of leaguesInPlay) {
    const leagueFixtures = todayFixtures.filter(f => f.league === leagueName);
    const teams = [...new Set([
      ...leagueFixtures.map(f => f.homeTeam),
      ...leagueFixtures.map(f => f.awayTeam),
    ])].filter(Boolean);

    // Build league stats from completed games in today's fetch
    const completed = leagueFixtures.filter(f => f.status === 'completed');
    if (completed.length >= 3) {
      const ls = buildLeagueStats(completed);
      if (ls) await saveLeagueStats(leagueName, ls);
    }

    // Update team stats if stale
    for (const team of teams) {
      const existing = await getTeamStats(`${leagueName}::${team}`);
      if (existing && Date.now() - existing.updatedAt < 6 * 3600000) continue;
      const stats = buildTeamStatsFromGames(team, leagueFixtures);
      if (stats) await saveTeamStats(`${leagueName}::${team}`, stats);
    }
  }
}

// ── Step 5: Generate Predictions ──────────────────────────────────────────────

async function generatePredictions(fixtures, dateStr) {
  const scheduled = fixtures.filter(f => f.status === 'scheduled' || f.status === 'live');
  const leagueAccuracyMap = await getLeagueAccuracy();
  const predictions = [];

  for (const fixture of scheduled) {
    if (!fixture.homeTeam || !fixture.awayTeam) continue;

    const homeStats  = await getTeamStats(`${fixture.league}::${fixture.homeTeam}`);
    const awayStats  = await getTeamStats(`${fixture.league}::${fixture.awayTeam}`);
    const leagueStats = await getLeagueStats(fixture.league);
    const leagueAcc  = leagueAccuracyMap[fixture.league] || null;

    // Line is always estimated by OUR model — never taken from bookmakers
    const line = estimateLine(homeStats, awayStats, leagueStats);
    const result = predictGame(homeStats, awayStats, leagueStats, line, leagueAcc);

    predictions.push({
      id: `${fixture.id || fixture.league + '-' + normalise(fixture.homeTeam) + '-' + normalise(fixture.awayTeam)}-${dateStr}`,
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

  predictions.sort((a, b) => b.confidence - a.confidence);
  return predictions;
}

// ── Step 6: History & Accuracy ────────────────────────────────────────────────

async function updateHistoryAndAccuracy() {
  const history = await getHistory();
  if (!history.entries.length) return;

  const accuracy = updateAccuracy(history.entries);
  history.accuracy = accuracy;
  await saveHistory(history);

  // Save per-league for engine calibration
  const leagueAccuracyMap = {};
  for (const [league, data] of Object.entries(accuracy.byLeague || {})) {
    leagueAccuracyMap[league] = {
      accuracy: data.accuracy,
      gamesTracked: data.gamesTracked,
    };
  }
  await saveLeagueAccuracy(leagueAccuracyMap);
}
