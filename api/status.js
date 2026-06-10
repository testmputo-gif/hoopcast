/**
 * /api/status — self-contained, no imports
 */

const OWNER  = process.env.REPO_OWNER  || process.env.GITHUB_OWNER  || 'testmputo-gif';
const REPO   = process.env.REPO_NAME   || process.env.GITHUB_REPO   || 'hoopcast';
const BRANCH = 'main';

async function read(path) {
  try {
    const r = await fetch(
      `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/data/${path}`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!r.ok) return null;
    return await r.json();
  } catch(e) { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  try {
    const [status, registry, history] = await Promise.all([
      read('system-status.json'),
      read('league-registry.json'),
      read('history.json'),
    ]);
    return res.status(200).json({
      ok: true,
      lastRun:     status?.lastRun     || null,
      lastSuccess: status?.lastSuccess || null,
      predictionsGenerated: status?.predictionsGenerated || 0,
      leagueCount:    registry?.leagues?.length  || 0,
      historyEntries: history?.entries?.length   || 0,
      overallAccuracy:  history?.accuracy?.overall   || null,
      rolling30Accuracy: history?.accuracy?.rolling30 || null,
    });
  } catch(err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
