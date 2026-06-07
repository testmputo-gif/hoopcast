/**
 * HoopCast Daily Orchestrator
 * Runs the full pipeline:
 * 1. Discover/update leagues
 * 2. Fetch fixtures for today
 * 3. Update completed game results
 * 4. Calculate team stats
 * 5. Generate predictions
 * 6. Update history & accuracy
 */

import {
  getLeagueRegistry,
  saveLeagueRegistry,
  getCachedFixtures,
  cacheFixtures,
  getPredictions,
  savePredictions,
  getTeamStats,
  saveTeamStats,
  getLeagueStats,
  saveLeagueStats,
  getHistory,
  saveHistory,
  getLeagueAccuracy,
  saveLeagueAccuracy,
  getSystemStatus,
  saveSystemStatus,
} from "./store.js";

import {
  fetchFixturesForDate,
  fetchNBAGames,
  discoverLeagues,
  buildTeamStatsFromGames,
  buildLeagueStats,
  SEED_LEAGUES,
  nigeriaDateStr,
  toNigeriaTime,
} from "./scraper.js";

import { predictGame, updateAccuracy, estimateLine } from "./engine.js";

// ---------- Main entry ----------

export async function runDailyPipeline(targetDate = null) {
  const startTime = Date.now();
  const dateStr = targetDate || nigeriaDateStr();
  const errors = [];

  console.log(`[HoopCast] Daily pipeline starting for ${dateStr}`);

  try {
    // 1. Update league registry
    await updateLeagueRegistry();

    // 2. Fetch fixtures
    const registry = await getLeagueRegistry();
    const leagueKeys = registry.leagues.map((l) => l.key);
    const fixtures = await fetchAndCacheFixtures(dateStr, leagueKeys);
    console.log(`[HoopCast] Fetched ${fixtures.length} fixtures`);

    // 3. Update completed games from yesterday
    const yesterday = nigeriaDateStr(new Date(Date.now() - 86400000));
    await updateCompletedGames(yesterday);

    // 4. Update stats per team
    const teamsNeedingUpdate = getUniqueTeams(fixtures);
    await updateTeamAndLeagueStats(teamsNeedingUpdate, fixtures, registry.leagues);

    // 5. Generate predictions for today
    const predictions = await generatePredictions(fixtures, dateStr);
    await savePredictions(dateStr, predictions);
    console.log(`[HoopCast] Generated ${predictions.length} predictions`);

    // 6. Update history & accuracy
    await updateHistoryAndAccuracy();

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const status = {
      lastRun: new Date().toISOString(),
      lastSuccess: new Date().toISOString(),
      lastRunDate: dateStr,
      predictionsGenerated: predictions.length,
      leaguesCovered: leagueKeys.length,
      elapsedSeconds: elapsed,
      errors,
    };
    await saveSystemStatus(status);
    console.log(`[HoopCast] Pipeline complete in ${elapsed}s`);
    return status;
  } catch (err) {
    errors.push(err.message);
    const status = await getSystemStatus();
    await saveSystemStatus({ ...status, lastRun: new Date().toISOString(), errors: [err.message] });
    throw err;
  }
}

// ---------- Step 1: League Registry ----------

async function updateLeagueRegistry() {
  const existing = await getLeagueRegistry();
  const now = Date.now();

  // Refresh every 7 days
  if (existing.leagues.length > 0 && now - existing.updatedAt < 7 * 86400000) {
    return existing;
  }

  // Try to discover new leagues
  let discovered = [];
  try {
    discovered = await discoverLeagues();
  } catch (e) {
    console.warn("League discovery failed:", e.message);
  }

  // Merge with seeds (seeds take priority for metadata)
  const merged = mergeLeagues(SEED_LEAGUES, discovered);
  const registry = { leagues: merged, updatedAt: now };
  await saveLeagueRegistry(registry);
  return registry;
}

function mergeLeagues(seeds, discovered) {
  const map = new Map();
  for (const l of seeds) map.set(l.key, l);
  for (const l of discovered) {
    if (!map.has(l.key) && !map.has(l.name)) {
      map.set(l.key, l);
    }
  }
  return Array.from(map.values());
}

// ---------- Step 2: Fixtures ----------

async function fetchAndCacheFixtures(dateStr, leagueKeys) {
  const cached = await getCachedFixtures("all", dateStr);
  if (cached && cached.length > 0) {
    console.log("[HoopCast] Using cached fixtures");
    return cached;
  }
  const fixtures = await fetchFixturesForDate(dateStr, leagueKeys);
  if (fixtures.length > 0) {
    await cacheFixtures("all", dateStr, fixtures);
  }
  return fixtures;
}

// ---------- Step 3: Update Completed Games ----------

async function updateCompletedGames(dateStr) {
  const predictions = await getPredictions(dateStr);
  if (!predictions.length) return;

  const fixtures = await fetchFixturesForDate(dateStr, []);

  let updated = false;
  for (const pred of predictions) {
    if (pred.result !== null) continue; // already resolved

    const match = fixtures.find(
      (f) =>
        f.homeTeam === pred.homeTeam &&
        f.awayTeam === pred.awayTeam &&
        f.status === "completed"
    );

    if (match && match.totalScore != null) {
      pred.actualTotal = match.totalScore;
      pred.actualHome = match.homeScore;
      pred.actualAway = match.awayScore;
      pred.status = "completed";
      pred.result =
        pred.prediction === "OVER"
          ? match.totalScore > pred.line
          : match.totalScore <= pred.line;
      updated = true;
    }
  }

  if (updated) {
    await savePredictions(dateStr, predictions);
    // Also push to permanent history
    await appendToHistory(predictions.filter((p) => p.result !== null));
  }
}

async function appendToHistory(resolvedPredictions) {
  const history = await getHistory();
  const existing = new Set(history.entries.map((e) => e.id));
  for (const p of resolvedPredictions) {
    if (!existing.has(p.id)) {
      history.entries.push({
        id: p.id,
        date: p.date,
        league: p.league,
        homeTeam: p.homeTeam,
        awayTeam: p.awayTeam,
        prediction: p.prediction,
        line: p.line,
        expectedTotal: p.expectedTotal,
        confidence: p.confidence,
        confidenceColor: p.confidenceColor,
        actualTotal: p.actualTotal,
        result: p.result,
      });
    }
  }
  // Keep max 2000 entries
  if (history.entries.length > 2000) {
    history.entries = history.entries.slice(-2000);
  }
  await saveHistory(history);
}

// ---------- Step 4: Team & League Stats ----------

function getUniqueTeams(fixtures) {
  const teams = new Set();
  for (const f of fixtures) {
    if (f.homeTeam) teams.add(`${f.league}::${f.homeTeam}`);
    if (f.awayTeam) teams.add(`${f.league}::${f.awayTeam}`);
  }
  return [...teams];
}

async function updateTeamAndLeagueStats(teamKeys, todayFixtures, leagues) {
  // For each league in today's fixtures, build stats from all available games
  const leaguesInPlay = [...new Set(todayFixtures.map((f) => f.league))];

  for (const leagueKey of leaguesInPlay) {
    const leagueFixtures = todayFixtures.filter((f) => f.league === leagueKey);
    const teamsInLeague = [...new Set([
      ...leagueFixtures.map((f) => f.homeTeam),
      ...leagueFixtures.map((f) => f.awayTeam),
    ])];

    // For now, stats are built from whatever fixtures we have cached
    // In production, you'd fetch the full season history per team
    // We use today + recent as proxy if full history unavailable
    const leagueGames = todayFixtures.filter((f) => f.league === leagueKey);
    const ls = buildLeagueStats(leagueGames);
    if (ls) await saveLeagueStats(leagueKey, ls);

    for (const team of teamsInLeague) {
      const existing = await getTeamStats(`${leagueKey}::${team}`);
      // Only rebuild if stale (>6h old)
      if (existing && Date.now() - existing.updatedAt < 6 * 3600000) continue;

      const stats = buildTeamStatsFromGames(team, leagueGames);
      if (stats) {
        await saveTeamStats(`${leagueKey}::${team}`, stats);
      }
    }
  }
}

// ---------- Step 5: Generate Predictions ----------

async function generatePredictions(fixtures, dateStr) {
  const scheduled = fixtures.filter((f) => f.status === "scheduled" || f.status === "live");
  const leagueAccuracyMap = await getLeagueAccuracy();
  const predictions = [];

  for (const fixture of scheduled) {
    if (!fixture.homeTeam || !fixture.awayTeam) continue;

    const homeStats = await getTeamStats(`${fixture.league}::${fixture.homeTeam}`);
    const awayStats = await getTeamStats(`${fixture.league}::${fixture.awayTeam}`);
    const leagueStats = await getLeagueStats(fixture.league);
    const leagueAcc = leagueAccuracyMap[fixture.league] || null;

    // Estimate line if not provided
    const line = fixture.line ?? estimateLine(homeStats, awayStats, leagueStats);

    const result = predictGame(homeStats, awayStats, leagueStats, line, leagueAcc);

    predictions.push({
      id: `${fixture.id || `${fixture.league}-${fixture.homeTeam}-${fixture.awayTeam}`}-${dateStr}`,
      date: dateStr,
      league: fixture.league,
      homeTeam: fixture.homeTeam,
      awayTeam: fixture.awayTeam,
      line,
      lineSource: fixture.line ? "bookmaker" : "estimated",
      ...result,
      status: fixture.status,
      result: null, // to be filled when game completes
      actualTotal: null,
      generatedAt: new Date().toISOString(),
    });
  }

  // Sort by confidence desc
  predictions.sort((a, b) => b.confidence - a.confidence);
  return predictions;
}

// ---------- Step 6: History & Accuracy ----------

async function updateHistoryAndAccuracy() {
  const history = await getHistory();
  if (!history.entries.length) return;

  const accuracy = updateAccuracy(history.entries);
  history.accuracy = accuracy;
  await saveHistory(history);

  // Save per-league accuracy for engine calibration
  const leagueAccuracyMap = {};
  for (const [league, data] of Object.entries(accuracy.byLeague || {})) {
    leagueAccuracyMap[league] = {
      accuracy: data.accuracy,
      gamesTracked: data.gamesTracked,
    };
  }
  await saveLeagueAccuracy(leagueAccuracyMap);
}
