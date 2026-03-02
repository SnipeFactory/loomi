/**
 * Demo Data Rollback
 *
 * Removes all sessions tagged with { _demo: true } in metadataJson.
 * Cascade deletes handle messages, summaries, and vector embeddings automatically.
 *
 * Usage:
 *   tsx scripts/rollback-demo.ts
 */

import { sql } from "drizzle-orm";
import { runMigrations } from "../src/core/db/migrate";
import { getDb } from "../src/core/db";
import { sessions } from "../src/core/db/schema";

async function main() {
  runMigrations();

  const db = getDb();

  const demoSessions = db
    .select({
      id: sessions.id,
      title: sessions.title,
      toolType: sessions.toolType,
      provider: sessions.provider,
      userMessageCount: sessions.userMessageCount,
      assistantMessageCount: sessions.assistantMessageCount,
      estimatedCostUsd: sessions.estimatedCostUsd,
    })
    .from(sessions)
    .where(sql`json_extract(metadata_json, '$._demo') = 1`)
    .all();

  if (demoSessions.length === 0) {
    console.log("No demo sessions found in the database.");
    process.exit(0);
  }

  console.log(`\nFound ${demoSessions.length} demo session(s) to remove:\n`);
  for (const s of demoSessions) {
    const msgs = s.userMessageCount + s.assistantMessageCount;
    const cost = s.estimatedCostUsd?.toFixed(4) ?? "0.0000";
    console.log(`  - [${s.toolType}/${s.provider}] "${s.title ?? "(no title)"}" — ${msgs} messages, $${cost}`);
  }

  console.log("\nDeleting...");

  for (const s of demoSessions) {
    db.delete(sessions).where(sql`id = ${s.id}`).run();
  }

  console.log(`\n✅ Removed ${demoSessions.length} demo sessions.`);
  console.log("   (Messages and vector embeddings cleaned up automatically via cascade.)");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
