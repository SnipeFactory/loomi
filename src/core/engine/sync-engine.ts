import fs from "fs";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { sessions, messages, syncState, watchedPaths } from "../db/schema";
import { parserRegistry } from "../parsers/registry";
import { adapterRegistry } from "../adapters/registry";
import { readNewLines } from "./incremental";
import { calculateCost } from "../utils/cost";
import type { ParsedMessage, ParsedSession, ParseResult } from "../parsers/types";
import { getHookBus } from "../modules/hook-bus";

export async function syncFile(filePath: string) {
  const db = getDb();

  // Verify file exists
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return;
  }

  // Get or create sync state
  let state = db
    .select()
    .from(syncState)
    .where(eq(syncState.filePath, filePath))
    .get();

  if (!state) {
    db.insert(syncState).values({ filePath, lastByteOffset: 0, lastLineCount: 0, lastFileSize: 0 }).run();
    state = db.select().from(syncState).where(eq(syncState.filePath, filePath)).get()!;
  }

  // Check if file has new data
  if (stat.size <= state.lastByteOffset) {
    return;
  }

  // Try adapter-based parsing first (supports parseFile for non-line-based formats)
  const adapter = adapterRegistry.getAdapterForFile(filePath);
  let result: ParseResult;
  let bytesRead: number;
  let lineCount: number;

  if (adapter?.parseFile) {
    // Non-line-based format (e.g., ChatGPT JSON export)
    // Re-parse entire file each time (file may have been replaced)
    result = await adapter.parseFile(filePath);
    bytesRead = stat.size - state.lastByteOffset;
    lineCount = result.messages.length;

    if (result.sessions.size === 0 && result.messages.length === 0) {
      return;
    }
  } else {
    // Line-based incremental parsing
    const parser = parserRegistry.getParserForFile(filePath);
    if (!parser) {
      return;
    }

    const incremental = await readNewLines(filePath, state.lastByteOffset);
    if (incremental.lines.length === 0) {
      return;
    }

    result = parser.parseLines(incremental.lines, filePath);
    bytesRead = incremental.bytesRead;
    lineCount = incremental.lines.length;
  }

  // Upsert sessions
  for (const [, sessionData] of result.sessions) {
    await upsertSession(db, sessionData);
  }

  // Upsert messages
  for (const msgData of result.messages) {
    await upsertMessage(db, msgData);
  }

  // Update session aggregates
  for (const [sessionUuid] of result.sessions) {
    await updateSessionAggregates(db, sessionUuid);
  }

  // Update sync state
  db.update(syncState)
    .set({
      lastByteOffset: state.lastByteOffset + bytesRead,
      lastLineCount: state.lastLineCount + lineCount,
      lastFileSize: stat.size,
      lastModifiedAt: stat.mtime.toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(syncState.filePath, filePath))
    .run();

  console.log(`[Loomi] Synced ${lineCount} entries from ${filePath}`);

  // Emit hook for modules
  const hookBus = getHookBus();
  const firstSession = result.sessions.values().next().value;
  await hookBus.emit("onLogCaptured", {
    filePath,
    sessions: result.sessions,
    newMessageCount: result.messages.length,
    provider: firstSession?.provider || "unknown",
  });
}

async function upsertSession(db: ReturnType<typeof getDb>, data: ParsedSession) {
  const existing = db
    .select()
    .from(sessions)
    .where(eq(sessions.sessionUuid, data.sessionUuid))
    .get();

  if (existing) {
    // Update if new data is more recent
    const updates: Record<string, unknown> = {};
    if (data.lastActivityAt > existing.lastActivityAt) {
      updates.lastActivityAt = data.lastActivityAt;
    }
    if (data.primaryModel && !existing.primaryModel) {
      updates.primaryModel = data.primaryModel;
    }
    if (data.title && !existing.title) {
      updates.title = data.title;
    }
    if (data.gitBranch && !existing.gitBranch) {
      updates.gitBranch = data.gitBranch;
    }
    if (Object.keys(updates).length > 0) {
      db.update(sessions)
        .set(updates)
        .where(eq(sessions.sessionUuid, data.sessionUuid))
        .run();
    }
  } else {
    db.insert(sessions)
      .values({
        sessionUuid: data.sessionUuid,
        toolType: data.toolType,
        projectPath: data.projectPath,
        gitBranch: data.gitBranch,
        title: data.title,
        cwd: data.cwd,
        cliVersion: data.cliVersion,
        startedAt: data.startedAt,
        lastActivityAt: data.lastActivityAt,
        primaryModel: data.primaryModel,
        sourceFilePath: data.sourceFilePath,
        provider: data.provider || "anthropic",
        adapterVersion: data.adapterVersion || null,
        metadataJson: data.metadataJson || null,
      })
      .run();
  }
}

async function upsertMessage(db: ReturnType<typeof getDb>, data: ParsedMessage) {
  // Get session ID
  const session = db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.sessionUuid, data.sessionUuid))
    .get();

  if (!session) return;

  // Check for existing message by messageUuid
  const existing = db
    .select()
    .from(messages)
    .where(eq(messages.messageUuid, data.messageUuid))
    .get();

  const cost = calculateCost(
    data.model,
    data.inputTokens || 0,
    data.outputTokens || 0,
    data.cacheCreationTokens || 0,
    data.cacheReadTokens || 0,
    data.provider || null
  );

  if (existing) {
    // Update if assistant message gets more content
    if (data.role === "assistant") {
      db.update(messages)
        .set({
          textContent: data.textContent || existing.textContent,
          thinkingContent: data.thinkingContent || existing.thinkingContent,
          toolUseJson: data.toolUseJson || existing.toolUseJson,
          stopReason: data.stopReason || existing.stopReason,
          inputTokens: data.inputTokens ?? existing.inputTokens,
          outputTokens: data.outputTokens ?? existing.outputTokens,
          cacheCreationTokens: data.cacheCreationTokens ?? existing.cacheCreationTokens,
          cacheReadTokens: data.cacheReadTokens ?? existing.cacheReadTokens,
          estimatedCostUsd: cost > 0 ? cost : existing.estimatedCostUsd,
        })
        .where(eq(messages.id, existing.id))
        .run();
    }
  } else {
    db.insert(messages)
      .values({
        sessionId: session.id,
        messageUuid: data.messageUuid,
        parentUuid: data.parentUuid,
        role: data.role,
        rawType: data.rawType,
        userType: data.userType,
        isSidechain: data.isSidechain,
        apiMessageId: data.apiMessageId,
        model: data.model,
        textContent: data.textContent,
        thinkingContent: data.thinkingContent,
        toolUseJson: data.toolUseJson,
        stopReason: data.stopReason,
        inputTokens: data.inputTokens,
        outputTokens: data.outputTokens,
        cacheCreationTokens: data.cacheCreationTokens,
        cacheReadTokens: data.cacheReadTokens,
        estimatedCostUsd: cost > 0 ? cost : null,
        timestamp: data.timestamp,
        sortOrder: data.sortOrder,
        provider: data.provider || null,
        contentBlocksJson: data.contentBlocksJson || null,
      })
      .run();
  }
}

async function updateSessionAggregates(db: ReturnType<typeof getDb>, sessionUuid: string) {
  const session = db
    .select()
    .from(sessions)
    .where(eq(sessions.sessionUuid, sessionUuid))
    .get();
  if (!session) return;

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
}

export async function syncAllWatchedPaths() {
  const db = getDb();

  const paths = db
    .select()
    .from(watchedPaths)
    .where(eq(watchedPaths.enabled, true))
    .all();

  for (const wp of paths) {
    await syncDirectory(wp.path);
  }
}

async function syncDirectory(dirPath: string) {
  const glob = await import("fs").then((m) => m.promises);
  // Supported extensions from all registered adapters
  const supportedExts = [".jsonl", ".json", ".md"];
  try {
    const entries = await glob.readdir(dirPath, { withFileTypes: true, recursive: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (entry.parentPath?.includes("/subagents/")) continue;

      const hasMatchingExt = supportedExts.some((ext) => entry.name.endsWith(ext));
      if (!hasMatchingExt) continue;

      const fullPath = `${entry.parentPath || dirPath}/${entry.name}`;

      // Verify an adapter can handle this file before syncing
      const adapter = adapterRegistry.getAdapterForFile(fullPath);
      if (adapter || entry.name.endsWith(".jsonl")) {
        await syncFile(fullPath);
      }
    }
  } catch (err) {
    console.error(`[Loomi] Failed to sync directory ${dirPath}:`, err);
  }
}
