/**
 * /api/predictions
 * GET /api/predictions?date=YYYY-MM-DD
 * GET /api/predictions?range=3  (returns today + next 3 days)
 */

import { getPredictions, getSystemStatus } from '../lib/store.js';
import { nigeriaDateStr, addDays } from '../lib/scraper.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const baseDate = req.query.date || nigeriaDateStr();
  const range    = parseInt(req.query.range || '0');

  try {
    const status = await getSystemStatus();

    if (range > 0) {
      // Return multiple days grouped
      const days = [];
      for (let i = 0; i <= Math.min(range, 3); i++) {
        const d = addDays(baseDate, i);
        const preds = await getPredictions(d);
        days.push({ date: d, predictions: preds, count: preds.length });
      }
      return res.status(200).json({
        baseDate, range, days,
        totalPredictions: days.reduce((s,d) => s + d.count, 0),
        systemStatus: status,
      });
    }

    // Single date
    const predictions = await getPredictions(baseDate);
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
