/**
 * Demo Data Seeder
 *
 * Reads a scenario JSON file and inserts fake sessions into Loomi's DB.
 * All seeded sessions are tagged with { _demo: true } in metadataJson for easy rollback.
 *
 * Usage:
 *   tsx scripts/seed-demo.ts <scenario.json>
 *   tsx scripts/seed-demo.ts scripts/scenarios/example.json
 *
 * Rollback:
 *   tsx scripts/rollback-demo.ts
 */

import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import { eq, sql } from "drizzle-orm";
import { runMigrations } from "../src/core/db/migrate";
import { getDb } from "../src/core/db";
import { sessions, messages } from "../src/core/db/schema";
import { calculateCost } from "../src/core/utils/cost";

// ── Scenario Types ────────────────────────────────────────────────

interface ScenarioTool {
  name: string;
  input: Record<string, unknown>;
}

interface ScenarioMessage {
  role: "user" | "assistant" | "system";
  text: string;
  thinking?: string;
  inputTokens?: number;
  outputTokens?: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  tools?: ScenarioTool[];
}

interface ScenarioSession {
  /** "claude-cli" | "gemini-cli" | "chatgpt-export" | "cursor" | "aider" */
  tool?: string;
  /** "anthropic" | "google" | "openai" — auto-inferred from tool if omitted */
  provider?: string;
  /** Model name — auto-inferred from provider if omitted */
  model?: string;
  /** Project directory path */
  project?: string;
  gitBranch?: string;
  /** How many days ago the session happened (default: random 0–14) */
  daysAgo?: number;
  /** Total session duration in minutes (used to space out message timestamps) */
  durationMinutes?: number;
  /** Tags auto-applied to session (simulates episodic-memory module output) */
  tags?: string[];
  messages: ScenarioMessage[];
}

interface DemoScenario {
  sessions: ScenarioSession[];
}

// ── Helpers ───────────────────────────────────────────────────────

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function makeTimestamp(baseDate: Date, minuteOffset: number): string {
  const d = new Date(baseDate);
  d.setMinutes(d.getMinutes() + minuteOffset);
  return d.toISOString();
}

function resolveSessionDefaults(s: ScenarioSession) {
  const tool = s.tool ?? "claude-cli";

  let provider = s.provider;
  if (!provider) {
    if (tool === "gemini-cli") provider = "google";
    else if (tool === "chatgpt-export") provider = "openai";
    else provider = "anthropic";
  }

  let model = s.model;
  if (!model) {
    if (provider === "google") model = "gemini-2.0-flash";
    else if (provider === "openai") model = "gpt-4o";
    else model = "claude-sonnet-4-6";
  }

  return { tool, provider, model };
}

// ── Core Insert Logic ─────────────────────────────────────────────

async function seedSession(s: ScenarioSession): Promise<{ sessionCount: number; messageCount: number }> {
  const db = getDb();
  const { tool, provider, model } = resolveSessionDefaults(s);
  const daysAgo = s.daysAgo ?? Math.floor(Math.random() * 14);
  const durationMinutes = s.durationMinutes ?? 30;

  // Base date for this session
  const baseDate = new Date();
  baseDate.setDate(baseDate.getDate() - daysAgo);
  baseDate.setHours(Math.floor(Math.random() * 10) + 9, 0, 0, 0); // 09:00–19:00

  const sessionUuid = randomUUID();
  const startedAt = makeTimestamp(baseDate, 0);
  const lastActivityAt = makeTimestamp(baseDate, durationMinutes);

  const firstUserMsg = s.messages.find((m) => m.role === "user");
  const title = (firstUserMsg?.text ?? "Demo Session").slice(0, 100);

  // Insert session
  db.insert(sessions)
    .values({
      sessionUuid,
      toolType: tool,
      projectPath: s.project ?? null,
      gitBranch: s.gitBranch ?? null,
      title,
      cwd: s.project ?? null,
      cliVersion: null,
      startedAt,
      lastActivityAt,
      primaryModel: model,
      sourceFilePath: null,
      provider,
      adapterVersion: null,
      metadataJson: JSON.stringify({ _demo: true }),
      sessionTags: s.tags ? JSON.stringify(s.tags) : null,
    })
    .run();

  const session = db.select({ id: sessions.id }).from(sessions).where(eq(sessions.sessionUuid, sessionUuid)).get()!;

  // Insert messages
  const msgCount = s.messages.length;
  const msgInterval = msgCount > 1 ? durationMinutes / (msgCount - 1) : 0;
  let prevUuid: string | null = null;

  for (let i = 0; i < s.messages.length; i++) {
    const m = s.messages[i];
    const msgUuid = randomUUID();
    const timestamp = makeTimestamp(baseDate, i * msgInterval);

    const isAssistant = m.role === "assistant";

    const inputTokens = m.inputTokens ?? (isAssistant ? estimateTokens(m.text) + 200 : estimateTokens(m.text));
    const outputTokens = m.outputTokens ?? (isAssistant ? estimateTokens(m.text) : 0);
    const cacheCreationTokens = m.cacheCreationTokens ?? 0;
    const cacheReadTokens = m.cacheReadTokens ?? 0;

    const cost = isAssistant
      ? calculateCost(model, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens, provider)
      : 0;

    const toolUseJson =
      m.tools && m.tools.length > 0
        ? JSON.stringify(m.tools.map((t) => ({ name: t.name, input: t.input })))
        : null;

    const stopReason = isAssistant ? (m.tools?.length ? "tool_use" : "end_turn") : null;

    db.insert(messages)
      .values({
        sessionId: session.id,
        messageUuid: msgUuid,
        parentUuid: prevUuid,
        role: m.role,
        rawType: m.role,
        userType: null,
        isSidechain: false,
        apiMessageId: null,
        model: isAssistant ? model : null,
        textContent: m.text,
        thinkingContent: m.thinking ?? null,
        toolUseJson,
        stopReason,
        inputTokens: isAssistant ? inputTokens : null,
        outputTokens: isAssistant ? outputTokens : null,
        cacheCreationTokens: cacheCreationTokens || null,
        cacheReadTokens: cacheReadTokens || null,
        estimatedCostUsd: cost > 0 ? cost : null,
        timestamp,
        sortOrder: i,
        provider,
        contentBlocksJson: null,
      })
      .run();

    prevUuid = msgUuid;
  }

  // Recalculate session aggregates
  const stats = db
    .select({
      userCount: sql<number>`SUM(CASE WHEN role = 'user' THEN 1 ELSE 0 END)`,
      assistantCount: sql<number>`SUM(CASE WHEN role = 'assistant' THEN 1 ELSE 0 END)`,
      totalInput: sql<number>`COALESCE(SUM(input_tokens), 0)`,
      totalOutput: sql<number>`COALESCE(SUM(output_tokens), 0)`,
      totalCacheCreation: sql<number>`COALESCE(SUM(cache_creation_tokens), 0)`,
      totalCacheRead: sql<number>`COALESCE(SUM(cache_read_tokens), 0)`,
      totalCost: sql<number>`COALESCE(SUM(estimated_cost_usd), 0)`,
    })
    .from(messages)
    .where(eq(messages.sessionId, session.id))
    .get();

  if (stats) {
    db.update(sessions)
      .set({
        userMessageCount: stats.userCount || 0,
        assistantMessageCount: stats.assistantCount || 0,
        totalInputTokens: stats.totalInput || 0,
        totalOutputTokens: stats.totalOutput || 0,
        totalCacheCreationTokens: stats.totalCacheCreation || 0,
        totalCacheReadTokens: stats.totalCacheRead || 0,
        estimatedCostUsd: stats.totalCost || 0,
      })
      .where(eq(sessions.id, session.id))
      .run();
  }

  const shortTitle = title.length > 50 ? title.slice(0, 50) + "…" : title;
  console.log(`  ✓ [${tool}/${model}] "${shortTitle}" — ${s.messages.length} messages`);

  return { sessionCount: 1, messageCount: s.messages.length };
}

// ── Entry ─────────────────────────────────────────────────────────

async function main() {
  const scenarioPath = process.argv[2];
  if (!scenarioPath) {
    console.error("Usage: tsx scripts/seed-demo.ts <scenario.json>");
    console.error("Example: tsx scripts/seed-demo.ts scripts/scenarios/example.json");
    process.exit(1);
  }

  let scenario: DemoScenario;
  try {
    scenario = JSON.parse(readFileSync(scenarioPath, "utf-8"));
  } catch (e) {
    console.error(`Failed to read scenario file: ${scenarioPath}`);
    console.error(e);
    process.exit(1);
  }

  runMigrations();

  console.log(`\nSeeding ${scenario.sessions.length} session(s) from: ${scenarioPath}\n`);

  let totalSessions = 0;
  let totalMessages = 0;

  for (const s of scenario.sessions) {
    const result = await seedSession(s);
    totalSessions += result.sessionCount;
    totalMessages += result.messageCount;
  }

  console.log(`\n✅ Done — ${totalSessions} sessions, ${totalMessages} messages inserted.`);
  console.log("   Rollback: tsx scripts/rollback-demo.ts");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
