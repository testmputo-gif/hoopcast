/**
 * /api/cron-daily
 * Triggered by Vercel Cron at 02:00 UTC (03:00 Nigeria time)
 * Runs the full daily pipeline
 */

import { runDailyPipeline } from "../lib/orchestrator.js";

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  // Verify this is from Vercel Cron
  const authHeader = req.headers["authorization"];
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const status = await runDailyPipeline();
    return res.status(200).json({ success: true, status });
  } catch (err) {
    console.error("[Cron] Pipeline failed:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
