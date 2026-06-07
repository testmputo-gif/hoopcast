/**
 * /api/history
 * GET /api/history?league=NBA&days=30
 */

import { getHistory, getLeagueAccuracy } from "../lib/store.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=1200");
  res.setHeader("Access-Control-Allow-Origin", "*");

  const { league, days } = req.query;

  try {
    const [history, leagueAccuracy] = await Promise.all([
      getHistory(),
      getLeagueAccuracy(),
    ]);

    let entries = history.entries || [];

    if (league) {
      entries = entries.filter((e) => e.league === league);
    }

    if (days) {
      const cutoff = Date.now() - parseInt(days) * 86400000;
      entries = entries.filter((e) => new Date(e.date).getTime() > cutoff);
    }

    return res.status(200).json({
      entries: entries.slice(-500), // max 500 per request
      accuracy: history.accuracy || {},
      leagueAccuracy,
      totalEntries: history.entries?.length || 0,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
