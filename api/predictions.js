/**
 * /api/predictions
 * Reads prediction files directly from GitHub raw content.
 * No authentication needed for public repos.
 */

import { nigeriaDateStr, addDays } from '../lib/scraper.js';

const OWNER = process.env.REPO_OWNER   || process.env.GITHUB_OWNER;
const REPO  = process.env.REPO_NAME    || process.env.GITHUB_REPO;
const BRANCH = 'main';

async function readFromGitHub(path) {
  const url = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/data/${path}`;
  try {
    const res = await fetch(url, {
      headers: { 'Cache-Control': 'no-cache' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch(e) {
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const baseDate = req.query.date || nigeriaDateStr();
  const range    = parseInt(req.query.range || '0');

  try {
    const status = await readFromGitHub('system-status.json');

    if (range > 0) {
      const days = [];
      for (let i = 0; i <= Math.min(range, 3); i++) {
        const d = addDays(baseDate, i);
        const preds = (await readFromGitHub(`predictions/${d}.json`)) || [];
        days.push({ date: d, predictions: preds, count: preds.length });
      }
      return res.status(200).json({
        baseDate, range, days,
        totalPredictions: days.reduce((s,d) => s + d.count, 0),
        systemStatus: status,
      });
    }

    const predictions = (await readFromGitHub(`predictions/${baseDate}.json`)) || [];
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
