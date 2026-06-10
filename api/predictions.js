/**
 * /api/predictions — completely self-contained, no imports
 * Reads directly from public GitHub raw content URL
 */

function todayNigeria() {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Lagos' }));
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().split('T')[0];
}

const OWNER  = process.env.REPO_OWNER  || process.env.GITHUB_OWNER  || 'testmputo-gif';
const REPO   = process.env.REPO_NAME   || process.env.GITHUB_REPO   || 'hoopcast';
const BRANCH = 'main';

async function read(path) {
  const url = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/data/${path}`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) return null;
    return await r.json();
  } catch(e) { return null; }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const baseDate = (req.query && req.query.date) ? req.query.date : todayNigeria();
  const range    = (req.query && req.query.range) ? parseInt(req.query.range) : 0;

  try {
    const status = await read('system-status.json');

    if (range > 0) {
      const days = [];
      for (let i = 0; i <= Math.min(range, 3); i++) {
        const d = addDays(baseDate, i);
        const preds = (await read(`predictions/${d}.json`)) || [];
        days.push({ date: d, predictions: preds, count: preds.length });
      }
      return res.status(200).json({
        baseDate, range, days,
        totalPredictions: days.reduce((s, d) => s + d.count, 0),
        systemStatus: status,
      });
    }

    const predictions = (await read(`predictions/${baseDate}.json`)) || [];
    return res.status(200).json({
      date: baseDate,
      predictions,
      totalPredictions: predictions.length,
      systemStatus: status,
    });

  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
}
