/**
 * /api/run-pipeline
 * POST /api/run-pipeline
 * Manual trigger for the daily pipeline (protected)
 */

import { runDailyPipeline } from "../lib/orchestrator.js";

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { secret, date } = req.body || {};
  if (process.env.ADMIN_SECRET && secret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const status = await runDailyPipeline(date || null);
    return res.status(200).json({ success: true, status });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}
