/**
 * HoopCast Data Store
 * Uses GitHub repository as the database.
 * All data is saved as JSON files in the /data folder of your GitHub repo.
 * No external database needed. GitHub is free. This costs $0.
 */

const GITHUB_OWNER = process.env.GITHUB_OWNER;   // your GitHub username
const GITHUB_REPO  = process.env.GITHUB_REPO;    // your repo name e.g. "hoopcast"
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;   // GitHub Personal Access Token

const BASE_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/data`;

// In-memory cache so we don't hit GitHub API repeatedly in one run
const _cache = new Map();

// ---------- GitHub file read/write ----------

async function githubRead(filename) {
  if (_cache.has(filename)) return _cache.get(filename);

  try {
    const res = await fetch(`${BASE_URL}/${filename}`, {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
      },
    });
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const json = await res.json();
    // GitHub returns file content as base64
    const content = JSON.parse(Buffer.from(json.content, "base64").toString("utf8"));
    _cache.set(filename, { content, sha: json.sha });
    return { content, sha: json.sha };
  } catch (e) {
    console.warn(`GitHub read failed for ${filename}:`, e.message);
    return null;
  }
}

async function githubWrite(filename, data, existingSha = null) {
  const content = Buffer.from(JSON.stringify(data, null, 2)).toString("base64");

  // If we don't have the sha, try to get it (needed to update existing files)
  let sha = existingSha;
  if (!sha) {
    const existing = await githubRead(filename);
    sha = existing?.sha || null;
  }

  const body = {
    message: `chore: update ${filename} [skip ci]`,
    content,
    ...(sha ? { sha } : {}),
  };

  try {
    const res = await fetch(`${BASE_URL}/${filename}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error(`GitHub write failed for ${filename}:`, err);
      return false;
    }
    const json = await res.json();
    // Update cache with new sha
    _cache.set(filename, { content: data, sha: json.content?.sha });
    return true;
  } catch (e) {
    console.error(`GitHub write error for ${filename}:`, e.message);
    return false;
  }
}

// ---------- Simple get/set helpers ----------

async function get(filename) {
  const result = await githubRead(filename);
  return result?.content ?? null;
}

async function set(filename, data) {
  return githubWrite(filename, data);
}

// ---------- Domain-specific helpers ----------

export async function getTeamStats(teamKey) {
  const safe = teamKey.replace(/[^a-zA-Z0-9_-]/g, "_");
  return get(`teams/${safe}.json`);
}

export async function saveTeamStats(teamKey, stats) {
  const safe = teamKey.replace(/[^a-zA-Z0-9_-]/g, "_");
  return set(`teams/${safe}.json`, { ...stats, updatedAt: Date.now() });
}

export async function getLeagueStats(leagueKey) {
  const safe = leagueKey.replace(/[^a-zA-Z0-9_-]/g, "_");
  return get(`leagues/${safe}.json`);
}

export async function saveLeagueStats(leagueKey, stats) {
  const safe = leagueKey.replace(/[^a-zA-Z0-9_-]/g, "_");
  return set(`leagues/${safe}.json`, { ...stats, updatedAt: Date.now() });
}

export async function getPredictions(dateStr) {
  return (await get(`predictions/${dateStr}.json`)) || [];
}

export async function savePredictions(dateStr, predictions) {
  return set(`predictions/${dateStr}.json`, predictions);
}

export async function getHistory() {
  return (await get("history.json")) || { entries: [], accuracy: {} };
}

export async function saveHistory(history) {
  return set("history.json", history);
}

export async function getLeagueAccuracy() {
  return (await get("league-accuracy.json")) || {};
}

export async function saveLeagueAccuracy(data) {
  return set("league-accuracy.json", data);
}

export async function getLeagueRegistry() {
  return (await get("league-registry.json")) || { leagues: [], updatedAt: 0 };
}

export async function saveLeagueRegistry(registry) {
  return set("league-registry.json", registry);
}

export async function getSystemStatus() {
  return (await get("system-status.json")) || { lastRun: null, lastSuccess: null, errors: [] };
}

export async function saveSystemStatus(status) {
  return set("system-status.json", status);
}

export async function getCachedFixtures(leagueKey, dateStr) {
  const safe = leagueKey.replace(/[^a-zA-Z0-9_-]/g, "_");
  const data = await get(`fixtures/${safe}_${dateStr}.json`);
  if (!data) return null;
  // Fixtures are only valid for 6 hours
  if (Date.now() - (data.cachedAt || 0) > 6 * 3600 * 1000) return null;
  return data.fixtures;
}

export async function cacheFixtures(leagueKey, dateStr, fixtures) {
  const safe = leagueKey.replace(/[^a-zA-Z0-9_-]/g, "_");
  return set(`fixtures/${safe}_${dateStr}.json`, { fixtures, cachedAt: Date.now() });
}
