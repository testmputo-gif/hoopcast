/**
 * /api/status - reads directly from GitHub raw content
 */

const OWNER  = process.env.REPO_OWNER  || process.env.GITHUB_OWNER;
const REPO   = process.env.REPO_NAME   || process.env.GITHUB_REPO;
const BRANCH = 'main';

async function rawRead(path) {
  try {
    const res = await fetch(
      `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/data/${path}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch(e) { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=60');
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const [status, registry, history] = await Promise.all([
      rawRead('system-status.json'),
      rawRead('league-registry.json'),
      rawRead('history.json'),
    ]);
    return res.status(200).json({
      ok: true,
      lastRun: status?.lastRun || null,
      lastSuccess: status?.lastSuccess || null,
      predictionsGenerated: status?.predictionsGenerated || 0,
      leagueCount: registry?.leagues?.length || 0,
      historyEntries: history?.entries?.length || 0,
      overallAccuracy: history?.accuracy?.overall || null,
      rolling30Accuracy: history?.accuracy?.rolling30 || null,
      debug: { owner: OWNER, repo: REPO }
    });
  } catch(err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
