/**
 * /api/predictions
 * GET /api/predictions?date=YYYY-MM-DD
 * Returns predictions for a given date (defaults to today Nigeria time)
 */

import { getPredictions, getSystemStatus } from "../lib/store.js";
import { nigeriaDateStr } from "../lib/scraper.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const date = req.query.date || nigeriaDateStr();

  try {
    const [predictions, status] = await Promise.all([
      getPredictions(date),
      getSystemStatus(),
    ]);

    return res.status(200).json({
      date,
      predictions,
      totalPredictions: predictions.length,
      systemStatus: status,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
