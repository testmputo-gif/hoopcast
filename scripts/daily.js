#!/usr/bin/env node
/**
 * HoopCast Daily Runner
 * Entry point for GitHub Actions and manual CLI runs.
 * Usage: node scripts/daily.js [YYYY-MM-DD]
 */

import { runDailyPipeline } from "../lib/orchestrator.js";

const date = process.argv[2] || null;

console.log("═══════════════════════════════════════");
console.log("  HoopCast Daily Pipeline");
console.log(`  Target: ${date || "today (Nigeria time)"}`);
console.log("═══════════════════════════════════════");

runDailyPipeline(date)
  .then((status) => {
    console.log("\n✅ Pipeline completed successfully");
    console.log(`   Predictions: ${status.predictionsGenerated}`);
    console.log(`   Leagues:     ${status.leaguesCovered}`);
    console.log(`   Duration:    ${status.elapsedSeconds}s`);
    if (status.errors?.length) {
      console.log(`   Warnings:    ${status.errors.join(", ")}`);
    }
    process.exit(0);
  })
  .catch((err) => {
    console.error("\n❌ Pipeline failed:", err.message);
    console.error(err.stack);
    process.exit(1);
  });
