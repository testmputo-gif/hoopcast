/**
 * /api/history - reads directly from GitHub raw content
 */

const OWNER  = process.env.REPO_OWNER  || process.env.GITHUB_OWNER;
const REPO   = process.env.REPO_NAME   || process.env.GITHUB_REPO;
const BRANCH = 'main';

async function rawRead(path) {
  try {
    const res = await fetch(
      `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/data/${path}`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch(e) { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=300');
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { league, days } = req.query;
  try {
    const [history, leagueAccuracy] = await Promise.all([
      rawRead('history.json'),
      rawRead('league-accuracy.json'),
    ]);

    let entries = history?.entries || [];
    if (league) entries = entries.filter(e => e.league === league);
    if (days) {
      const cutoff = Date.now() - parseInt(days) * 86400000;
      entries = entries.filter(e => new Date(e.date).getTime() > cutoff);
    }

    return res.status(200).json({
      entries: entries.slice(-500),
      accuracy: history?.accuracy || {},
      leagueAccuracy: leagueAccuracy || {},
      totalEntries: history?.entries?.length || 0,
    });
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
}
