/**
 * HoopCast Data Collector
 * Scrapes public basketball statistics. Caches aggressively to avoid rate limits.
 * Falls back gracefully if a source is unavailable.
 */

// ---------- Timezone util ----------
export function toNigeriaTime(date = new Date()) {
  return new Date(date.toLocaleString("en-US", { timeZone: "Africa/Lagos" }));
}

export function nigeriaDateStr(date = new Date()) {
  const d = toNigeriaTime(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ---------- League Registry ----------
// Leagues auto-discovered from API-Basketball (free tier) or Basketball Reference
// League list is saved to KV and updated periodically

export const SEED_LEAGUES = [
  // Top-tier
  { key: "NBA", name: "NBA", country: "USA", tier: 1 },
  { key: "EuroLeague", name: "EuroLeague", country: "Europe", tier: 1 },
  { key: "EuroCup", name: "EuroCup", country: "Europe", tier: 2 },
  // Major national
  { key: "ACB", name: "Liga ACB", country: "Spain", tier: 2 },
  { key: "Lega Basket", name: "Lega Basket Serie A", country: "Italy", tier: 2 },
  { key: "Pro A", name: "Pro A", country: "France", tier: 2 },
  { key: "BBL", name: "Basketball Bundesliga", country: "Germany", tier: 2 },
  { key: "VTB", name: "VTB United League", country: "Russia/Europe", tier: 2 },
  { key: "BSL", name: "Basketball Super League", country: "Turkey", tier: 2 },
  { key: "NBL", name: "National Basketball League", country: "Australia", tier: 2 },
  { key: "CBA", name: "Chinese Basketball Association", country: "China", tier: 2 },
  { key: "KBL", name: "Korean Basketball League", country: "South Korea", tier: 2 },
  { key: "SBL", name: "Super Basketball League", country: "Taiwan", tier: 3 },
  { key: "PBA", name: "Philippine Basketball Association", country: "Philippines", tier: 2 },
  { key: "BNXT", name: "BNXT League", country: "Belgium/Netherlands", tier: 2 },
  { key: "LNB Pro B", name: "LNB Pro B", country: "France", tier: 3 },
  { key: "HEBA", name: "Greek Basket League", country: "Greece", tier: 2 },
  { key: "NLB", name: "NLB Regional League", country: "Balkans", tier: 3 },
  { key: "LKL", name: "LKL", country: "Lithuania", tier: 3 },
  { key: "PLK", name: "PLK", country: "Poland", tier: 3 },
  { key: "UniLeague", name: "UniLeague", country: "Czech/Slovak", tier: 3 },
];

// ---------- API-Basketball (free tier, 100 req/day) ----------
const API_BASKETBALL_HOST = "v1.basketball.api-sports.io";

async function apiBasketball(endpoint, params = {}) {
  const key = process.env.API_BASKETBALL_KEY;
  if (!key) return null;
  const url = new URL(`https://${API_BASKETBALL_HOST}/${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  try {
    const res = await fetch(url.toString(), {
      headers: { "x-apisports-key": key },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.response || null;
  } catch (e) {
    console.warn("API-Basketball error:", e.message);
    return null;
  }
}

// ---------- The Sports DB (completely free) ----------
async function theSportsDB(endpoint) {
  try {
    const res = await fetch(`https://www.thesportsdb.com/api/v1/json/3/${endpoint}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn("TheSportsDB error:", e.message);
    return null;
  }
}

// ---------- Ball Don't Lie (free) ----------
async function ballDontLie(endpoint, params = {}) {
  const url = new URL(`https://www.balldontlie.io/api/v1/${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.warn("BallDontLie error:", e.message);
    return null;
  }
}

// ---------- NBA games via BallDontLie ----------
export async function fetchNBAGames(dateStr) {
  const data = await ballDontLie("games", { dates: [dateStr], per_page: 100 });
  if (!data || !data.data) return [];
  return data.data.map((g) => ({
    id: `NBA-${g.id}`,
    league: "NBA",
    date: g.date?.split("T")[0] || dateStr,
    homeTeam: g.home_team?.full_name || g.home_team?.name,
    awayTeam: g.visitor_team?.full_name || g.visitor_team?.name,
    homeScore: g.home_team_score || null,
    awayScore: g.visitor_team_score || null,
    status: g.status === "Final" ? "completed" : g.status === "In Progress" ? "live" : "scheduled",
    totalScore: g.home_team_score && g.visitor_team_score ? g.home_team_score + g.visitor_team_score : null,
    source: "balldontlie",
  }));
}

export async function fetchNBATeamStats(teamName) {
  // Get recent games for a team
  const data = await ballDontLie("games", { "team_ids[]": [], per_page: 20, seasons: [currentSeason()] });
  return data;
}

function currentSeason() {
  const now = toNigeriaTime();
  const month = now.getMonth() + 1;
  // NBA season starts October, so if before July we're in previous year's season
  return month < 7 ? now.getFullYear() - 1 : now.getFullYear();
}

// ---------- API-Basketball games ----------
export async function fetchLeagueGames(leagueKey, dateStr) {
  const data = await apiBasketball("games", { date: dateStr, league: leagueKey });
  if (!data) return [];
  return data.map((g) => ({
    id: `${leagueKey}-${g.id}`,
    league: leagueKey,
    date: g.date?.split("T")[0] || dateStr,
    homeTeam: g.teams?.home?.name,
    awayTeam: g.teams?.away?.name,
    homeScore: g.scores?.home?.total ?? null,
    awayScore: g.scores?.away?.total ?? null,
    status: mapApiStatus(g.status?.short),
    totalScore:
      g.scores?.home?.total != null && g.scores?.away?.total != null
        ? g.scores.home.total + g.scores.away.total
        : null,
    source: "api-basketball",
  }));
}

function mapApiStatus(s) {
  if (!s) return "scheduled";
  if (["FT", "AOT", "CANC"].includes(s)) return "completed";
  if (["LIVE", "Q1", "Q2", "Q3", "Q4", "OT", "HT", "BT"].includes(s)) return "live";
  return "scheduled";
}

export async function fetchTeamHistory(teamId, leagueId, season) {
  const data = await apiBasketball("games", {
    team: teamId,
    league: leagueId,
    season: season || currentSeason(),
  });
  return data || [];
}

// ---------- TheSportsDB league search ----------
export async function discoverLeagues() {
  const data = await theSportsDB("search_all_leagues.php?s=Basketball");
  if (!data || !data.leagues) return [];
  return data.leagues
    .filter((l) => l.strSport === "Basketball")
    .map((l) => ({
      key: l.idLeague,
      name: l.strLeague,
      country: l.strCountry,
      tier: 3,
      source: "thesportsdb",
    }));
}

// ---------- Unified fixture fetcher ----------
export async function fetchFixturesForDate(dateStr, leagueKeys = []) {
  const fixtures = [];

  // NBA always via BallDontLie (more reliable)
  const nbaGames = await fetchNBAGames(dateStr);
  fixtures.push(...nbaGames);

  // Other leagues via API-Basketball if key available
  if (process.env.API_BASKETBALL_KEY) {
    for (const key of leagueKeys.filter((k) => k !== "NBA").slice(0, 10)) {
      const games = await fetchLeagueGames(key, dateStr);
      fixtures.push(...games);
      await sleep(200); // gentle rate limiting
    }
  }

  return fixtures;
}

// ---------- Build team stats from game history ----------
export function buildTeamStatsFromGames(teamName, allGames) {
  const teamGames = allGames.filter(
    (g) =>
      g.status === "completed" &&
      (g.homeTeam === teamName || g.awayTeam === teamName) &&
      g.homeScore != null &&
      g.awayScore != null
  );

  if (teamGames.length === 0) return null;

  // Sort most recent first
  teamGames.sort((a, b) => new Date(b.date) - new Date(a.date));

  const recent5 = teamGames.slice(0, 5);
  const recent10 = teamGames.slice(0, 10);

  function scored(g) {
    return g.homeTeam === teamName ? g.homeScore : g.awayScore;
  }
  function allowed(g) {
    return g.homeTeam === teamName ? g.awayScore : g.homeScore;
  }

  const avg = (arr, fn) => arr.reduce((s, g) => s + fn(g), 0) / arr.length;

  const homeGames = teamGames.filter((g) => g.homeTeam === teamName);
  const awayGames = teamGames.filter((g) => g.awayTeam === teamName);

  const totals = teamGames.map((g) => g.totalScore);
  const overLine = 220; // default, will be adjusted per-game
  const overCount = totals.filter((t) => t > overLine).length;
  const underCount = totals.filter((t) => t <= overLine).length;

  return {
    teamName,
    gamesPlayed: teamGames.length,
    avgPointsScored: avg(teamGames, scored),
    avgPointsAllowed: avg(teamGames, allowed),
    recent5Totals: recent5.map((g) => g.totalScore),
    recent10Totals: recent10.map((g) => g.totalScore),
    avgTotal5: avg(recent5, (g) => g.totalScore),
    avgTotal10: avg(recent10, (g) => g.totalScore),
    homeAvgScored: homeGames.length ? avg(homeGames, scored) : null,
    homeAvgAllowed: homeGames.length ? avg(homeGames, allowed) : null,
    awayAvgScored: awayGames.length ? avg(awayGames, scored) : null,
    awayAvgAllowed: awayGames.length ? avg(awayGames, allowed) : null,
    recentOverPct: totals.length ? (overCount / totals.length) * 100 : 50,
    recentUnderPct: totals.length ? (underCount / totals.length) * 100 : 50,
    pace: estimatePace(teamGames, teamName),
    lastGameDate: teamGames[0]?.date || null,
    restDays: calcRestDays(teamGames),
  };
}

function estimatePace(games, teamName) {
  // Proxy: higher scoring teams have faster pace
  const totals = games.map((g) => g.totalScore).filter(Boolean);
  return totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : 200;
}

function calcRestDays(games) {
  if (games.length < 2) return 3;
  const last = new Date(games[0].date);
  const secondLast = new Date(games[1].date);
  return Math.round((last - secondLast) / 86400000);
}

export function buildLeagueStats(allGames) {
  const completed = allGames.filter((g) => g.status === "completed" && g.totalScore != null);
  if (completed.length === 0) return null;
  const totals = completed.map((g) => g.totalScore);
  const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
  const stdDev = Math.sqrt(totals.map((t) => Math.pow(t - avg, 2)).reduce((a, b) => a + b, 0) / totals.length);
  return {
    avgTotal: avg,
    stdDev,
    gamesAnalyzed: completed.length,
    minTotal: Math.min(...totals),
    maxTotal: Math.max(...totals),
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
