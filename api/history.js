/**
 * /api/history — self-contained, no imports
 */

const OWNER  = process.env.REPO_OWNER  || process.env.GITHUB_OWNER  || 'testmputo-gif';
const REPO   = process.env.REPO_NAME   || process.env.GITHUB_REPO   || 'hoopcast';
const BRANCH = 'main';

async function read(path) {
  try {
    const r = await fetch(
      `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/data/${path}`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!r.ok) return null;
    return await r.json();
  } catch(e) { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  const league = req.query && req.query.league ? req.query.league : null;
  const days   = req.query && req.query.days   ? parseInt(req.query.days) : null;
  try {
    const [history, leagueAccuracy] = await Promise.all([
      read('history.json'),
      read('league-accuracy.json'),
    ]);
    let entries = (history && history.entries) ? history.entries : [];
    if (league) entries = entries.filter(e => e.league === league);
    if (days) {
      const cutoff = Date.now() - days * 86400000;
      entries = entries.filter(e => new Date(e.date).getTime() > cutoff);
    }
    return res.status(200).json({
      entries: entries.slice(-500),
      accuracy: (history && history.accuracy) ? history.accuracy : {},
      leagueAccuracy: leagueAccuracy || {},
      totalEntries: (history && history.entries) ? history.entries.length : 0,
    });
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
}
