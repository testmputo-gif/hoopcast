/**
 * /api/status
 * GET /api/status - system health check
 */

import { getSystemStatus, getLeagueRegistry, getHistory } from "../lib/store.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=60");
  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    const [status, registry, history] = await Promise.all([
      getSystemStatus(),
      getLeagueRegistry(),
      getHistory(),
    ]);

    return res.status(200).json({
      ok: true,
      lastRun: status.lastRun,
      lastSuccess: status.lastSuccess,
      leagueCount: registry.leagues?.length || 0,
      historyEntries: history.entries?.length || 0,
      overallAccuracy: history.accuracy?.overall || null,
      rolling30Accuracy: history.accuracy?.rolling30 || null,
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
}
