/**
 * HoopCast Prediction Engine
 * Over/Under market only.
 */

const MONTE_CARLO_RUNS = 5000;
const DEFAULT_LEAGUE_AVG = 215;
const DEFAULT_STD_DEV = 18;

// ---------- Core prediction ----------

export function predictGame(homeStats, awayStats, leagueStats, line, leagueAccuracy) {
  const leagueAvg = (leagueStats && leagueStats.avgTotal) ? leagueStats.avgTotal : DEFAULT_LEAGUE_AVG;
  const leagueStd = (leagueStats && leagueStats.stdDev) ? leagueStats.stdDev : DEFAULT_STD_DEV;

  const possessionEstimate = possessionModel(homeStats, awayStats, leagueAvg);
  const trendEstimate = trendModel(homeStats, awayStats);
  const paceEstimate = paceModel(homeStats, awayStats, leagueAvg);
  const leagueEstimate = leagueAvg;

  const weights = { possession: 0.35, trend: 0.30, pace: 0.20, league: 0.15 };
  const blendedEstimate =
    possessionEstimate * weights.possession +
    trendEstimate * weights.trend +
    paceEstimate * weights.pace +
    leagueEstimate * weights.league;

  const homeAdj = (homeStats && homeStats.homeAvgScored != null && homeStats.awayAvgScored != null)
    ? (homeStats.homeAvgScored - homeStats.awayAvgScored) * 0.5
    : 1.5;
  const finalEstimate = blendedEstimate + homeAdj * 0.3;

  const mc = monteCarlo(finalEstimate, leagueStd, line);
  const components = [possessionEstimate, trendEstimate, paceEstimate];
  const confidence = calculateConfidence(components, line, mc.overProbability, leagueAccuracy);
  const prediction = mc.overProbability >= 50 ? "OVER" : "UNDER";

  return {
    prediction,
    expectedTotal: Math.round(finalEstimate * 10) / 10,
    overProbability: Math.round(mc.overProbability * 10) / 10,
    underProbability: Math.round(mc.underProbability * 10) / 10,
    confidence: Math.round(confidence * 10) / 10,
    confidenceColor: getConfidenceColor(confidence),
    components: {
      possession: Math.round(possessionEstimate),
      trend: Math.round(trendEstimate),
      pace: Math.round(paceEstimate),
      league: Math.round(leagueEstimate),
      blended: Math.round(finalEstimate),
    },
    monteCarloRuns: MONTE_CARLO_RUNS,
    line,
  };
}

// ---------- Model Components ----------

function possessionModel(homeStats, awayStats, leagueAvg) {
  const leagueHalf = leagueAvg / 2;
  const homePPG = (homeStats && homeStats.avgPointsScored) ? homeStats.avgPointsScored : leagueHalf;
  const homeAPG = (homeStats && homeStats.avgPointsAllowed) ? homeStats.avgPointsAllowed : leagueHalf;
  const awayPPG = (awayStats && awayStats.avgPointsScored) ? awayStats.avgPointsScored : leagueHalf;
  const awayAPG = (awayStats && awayStats.avgPointsAllowed) ? awayStats.avgPointsAllowed : leagueHalf;

  const homeExpected = (homePPG * awayAPG) / leagueHalf;
  const awayExpected = (awayPPG * homeAPG) / leagueHalf;
  return homeExpected + awayExpected;
}

function trendModel(homeStats, awayStats) {
  const homeRecent = weightedAvgRecent(homeStats);
  const awayRecent = weightedAvgRecent(awayStats);

  const homePortion = (homeStats && homeStats.avgPointsScored) ? homeStats.avgPointsScored : 107;
  const awayPortion = (awayStats && awayStats.avgPointsScored) ? awayStats.avgPointsScored : 107;
  const baseline = homePortion + awayPortion;

  const homeBase = (homeStats && homeStats.avgTotal10) ? homeStats.avgTotal10 : (homeRecent || 214);
  const awayBase = (awayStats && awayStats.avgTotal10) ? awayStats.avgTotal10 : (awayRecent || 214);

  const homeRatio = homeBase > 0 ? homeRecent / homeBase : 1;
  const awayRatio = awayBase > 0 ? awayRecent / awayBase : 1;
  const avgRatio = (homeRatio + awayRatio) / 2;

  return baseline * (isFinite(avgRatio) ? avgRatio : 1);
}

function weightedAvgRecent(stats) {
  if (!stats) return DEFAULT_LEAGUE_AVG;
  const t5 = stats.avgTotal5;
  const t10 = stats.avgTotal10;
  if (t5 && t10) return t5 * 0.6 + t10 * 0.4;
  if (t5) return t5;
  if (t10) return t10;
  return DEFAULT_LEAGUE_AVG;
}

function paceModel(homeStats, awayStats, leagueAvg) {
  const homePace = (homeStats && homeStats.pace) ? homeStats.pace : leagueAvg;
  const awayPace = (awayStats && awayStats.pace) ? awayStats.pace : leagueAvg;
  const combinedPace = (homePace + awayPace) / 2;
  return (combinedPace / leagueAvg) * leagueAvg;
}

// ---------- Monte Carlo ----------

function monteCarlo(expectedTotal, stdDev, line) {
  let overCount = 0;
  let underCount = 0;
  let totalSum = 0;
  const effectiveStd = Math.max(stdDev, 12);

  for (let i = 0; i < MONTE_CARLO_RUNS; i++) {
    const simTotal = gaussianRandom(expectedTotal, effectiveStd);
    totalSum += simTotal;
    if (simTotal > line) {
      overCount++;
    } else {
      underCount++;
    }
  }

  return {
    overProbability: (overCount / MONTE_CARLO_RUNS) * 100,
    underProbability: (underCount / MONTE_CARLO_RUNS) * 100,
    simulatedAvg: totalSum / MONTE_CARLO_RUNS,
  };
}

function gaussianRandom(mean, std) {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return mean + std * Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// ---------- Confidence ----------

function calculateConfidence(componentEstimates, line, overProbability, leagueAccuracy) {
  const mcEdge = Math.abs(overProbability - 50) * 2;

  const validComponents = componentEstimates.filter(function(e) { return e > 0; });
  let agreementScore = 50;
  if (validComponents.length > 1) {
    const mean = validComponents.reduce(function(a, b) { return a + b; }, 0) / validComponents.length;
    const variance = validComponents.reduce(function(s, e) { return s + Math.pow(e - mean, 2); }, 0) / validComponents.length;
    const spread = Math.sqrt(variance);
    agreementScore = Math.max(0, 100 - (spread / 20) * 100);
  }

  let rawConfidence = mcEdge * 0.55 + agreementScore * 0.45;

  if (leagueAccuracy && typeof leagueAccuracy.accuracy === "number" && leagueAccuracy.gamesTracked >= 20) {
    const calibrationFactor = leagueAccuracy.accuracy / 65;
    rawConfidence = rawConfidence * Math.min(calibrationFactor, 1.15);
  } else if (leagueAccuracy && leagueAccuracy.gamesTracked < 20) {
    rawConfidence = Math.min(rawConfidence, 72);
  }

  return Math.min(99, Math.max(40, rawConfidence));
}

function getConfidenceColor(confidence) {
  if (confidence >= 90) return "green";
  if (confidence >= 80) return "lemon";
  if (confidence >= 70) return "blue";
  return "red";
}

// ---------- History accuracy ----------

export function updateAccuracy(history) {
  const result = {
    overall: calcAccuracyFromEntries(history),
    byLeague: {},
    byColor: { green: null, lemon: null, blue: null, red: null },
    rolling30: null,
  };

  const leagues = [];
  history.forEach(function(h) {
    if (leagues.indexOf(h.league) === -1) leagues.push(h.league);
  });

  leagues.forEach(function(league) {
    const entries = history.filter(function(h) { return h.league === league; });
    result.byLeague[league] = {
      accuracy: calcAccuracyFromEntries(entries),
      gamesTracked: entries.length,
    };
  });

  ["green", "lemon", "blue", "red"].forEach(function(color) {
    const entries = history.filter(function(h) { return h.confidenceColor === color; });
    result.byColor[color] = entries.length ? calcAccuracyFromEntries(entries) : null;
  });

  const cutoff = Date.now() - 30 * 86400000;
  const recent = history.filter(function(h) { return new Date(h.date).getTime() > cutoff; });
  result.rolling30 = recent.length ? calcAccuracyFromEntries(recent) : null;

  return result;
}

function calcAccuracyFromEntries(entries) {
  const resolved = entries.filter(function(e) { return e.result !== null && e.result !== undefined; });
  if (!resolved.length) return null;
  const correct = resolved.filter(function(e) { return e.result === true; }).length;
  return Math.round((correct / resolved.length) * 1000) / 10;
}

// ---------- Line estimator ----------

export function estimateLine(homeStats, awayStats, leagueStats) {
  const leagueAvg = (leagueStats && leagueStats.avgTotal) ? leagueStats.avgTotal : DEFAULT_LEAGUE_AVG;
  const leagueHalf = leagueAvg / 2;
  const homePPG = (homeStats && homeStats.avgPointsScored) ? homeStats.avgPointsScored : leagueHalf;
  const homeAPG = (homeStats && homeStats.avgPointsAllowed) ? homeStats.avgPointsAllowed : leagueHalf;
  const awayPPG = (awayStats && awayStats.avgPointsScored) ? awayStats.avgPointsScored : leagueHalf;
  const awayAPG = (awayStats && awayStats.avgPointsAllowed) ? awayStats.avgPointsAllowed : leagueHalf;
  const raw = ((homePPG + awayAPG) / 2) + ((awayPPG + homeAPG) / 2);
  return Math.round(raw * 2) / 2;
}
