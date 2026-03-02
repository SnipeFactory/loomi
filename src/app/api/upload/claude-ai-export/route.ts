export const runtime = "nodejs";
// Allow large ZIP files (up to 500 MB)
export const maxDuration = 120;

import path from "path";
import fs from "fs";
import { NextRequest, NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@core/db";
import { sessions, messages } from "@core/db/schema";
import { calculateCost } from "@core/utils/cost";
import { claudeAiExportAdapter } from "@core/adapters/claude-ai-export";
import type { ParsedSession, ParsedMessage } from "@core/parsers/types";

// ── Types ────────────────────────────────────────────────────────

interface ImportResult {
  imported: number;
  updated: number;
  skipped: number;
  totalSessions: number;
}

// ── DB helpers ───────────────────────────────────────────────────

function getSessionByUuid(uuid: string) {
  const db = getDb();
  return db.select().from(sessions).where(eq(sessions.sessionUuid, uuid)).get();
}

function getMessageByUuid(uuid: string) {
  const db = getDb();
  return db.select({ id: messages.id }).from(messages).where(eq(messages.messageUuid, uuid)).get();
}

function upsertSession(data: ParsedSession): void {
  const db = getDb();
  const existing = getSessionByUuid(data.sessionUuid);

  if (existing) {
    const updates: Record<string, unknown> = {};
    if (data.lastActivityAt > existing.lastActivityAt) updates.lastActivityAt = data.lastActivityAt;
    if (data.title && !existing.title) updates.title = data.title;
    if (Object.keys(updates).length > 0) {
      db.update(sessions).set(updates).where(eq(sessions.sessionUuid, data.sessionUuid)).run();
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

function upsertMessage(data: ParsedMessage): void {
  const db = getDb();

  const session = db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.sessionUuid, data.sessionUuid))
    .get();
  if (!session) return;

  const existing = db
    .select({ id: messages.id })
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

  if (!existing) {
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

function updateSessionAggregates(sessionUuid: string): void {
  const db = getDb();
  const session = db.select().from(sessions).where(eq(sessions.sessionUuid, sessionUuid)).get();
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

// ── ZIP parsing ──────────────────────────────────────────────────

const MAX_UPLOAD_SIZE = 200 * 1024 * 1024; // 200 MB

async function parseZip(buffer: Buffer): Promise<unknown[]> {
  const AdmZip = (await import("adm-zip")).default;
  const zip = new AdmZip(buffer);
  const entry = zip.getEntry("conversations.json");
  if (!entry) throw new Error("conversations.json not found in ZIP");
  return JSON.parse(entry.getData().toString("utf-8"));
}

async function parseZipFromPath(filePath: string): Promise<unknown[]> {
  const AdmZip = (await import("adm-zip")).default;
  const zip = new AdmZip(filePath);
  const entry = zip.getEntry("conversations.json");
  if (!entry) throw new Error("conversations.json not found in ZIP");
  return JSON.parse(entry.getData().toString("utf-8"));
}

// ── Main import logic ─────────────────────────────────────────────

async function importConversations(conversations: unknown[]): Promise<ImportResult> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const convArray = conversations as any[];

  let imported = 0;
  let updated = 0;
  let skipped = 0;

  for (const conv of convArray) {
    if (!conv?.uuid || !Array.isArray(conv?.chat_messages)) continue;

    const sessionUuid: string = conv.uuid;
    const chatMessages: { uuid: string }[] = conv.chat_messages;
    const lastMsgUuid = chatMessages.at(-1)?.uuid;

    const existingSession = getSessionByUuid(sessionUuid);

    if (!existingSession) {
      // Full import
      const result = claudeAiExportAdapter.parseConversations([conv]);
      for (const [, sessionData] of result.sessions) {
        upsertSession(sessionData);
      }
      for (const msgData of result.messages) {
        upsertMessage(msgData);
      }
      for (const [uuid] of result.sessions) {
        updateSessionAggregates(uuid);
      }
      imported++;
    } else if (lastMsgUuid && !getMessageByUuid(lastMsgUuid)) {
      // Incremental: session exists but has new messages
      const result = claudeAiExportAdapter.parseConversations([conv]);
      for (const msgData of result.messages) {
        upsertMessage(msgData);
      }
      updateSessionAggregates(sessionUuid);
      updated++;
    } else {
      skipped++;
    }
  }

  return { imported, updated, skipped, totalSessions: convArray.length };
}

// ── Route handler ─────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
      // Local path mode — server reads the file directly from filesystem
      const body = await request.json();
      const localPath: unknown = body?.localPath;

      if (
        !localPath ||
        typeof localPath !== "string" ||
        !path.isAbsolute(localPath) ||
        !localPath.endsWith(".zip")
      ) {
        return NextResponse.json(
          { error: "localPath must be an absolute path to a .zip file" },
          { status: 400 }
        );
      }

      if (!fs.existsSync(localPath)) {
        return NextResponse.json({ error: "File not found" }, { status: 404 });
      }

      const conversations = await parseZipFromPath(localPath);
      if (!Array.isArray(conversations)) {
        return NextResponse.json({ error: "Invalid conversations.json format" }, { status: 422 });
      }

      const result = await importConversations(conversations);
      return NextResponse.json(result);
    } else {
      // Multipart upload mode (existing)
      const formData = await request.formData();
      const file = formData.get("file") as File | null;

      if (!file) {
        return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
      }

      if (!file.name.endsWith(".zip")) {
        return NextResponse.json({ error: "Only .zip files are accepted" }, { status: 400 });
      }

      if (file.size > MAX_UPLOAD_SIZE) {
        return NextResponse.json(
          { error: "File exceeds 200 MB limit. Use Local Path mode instead." },
          { status: 400 }
        );
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const conversations = await parseZip(buffer);

      if (!Array.isArray(conversations)) {
        return NextResponse.json({ error: "Invalid conversations.json format" }, { status: 422 });
      }

      const result = await importConversations(conversations);
      return NextResponse.json(result);
    }
  } catch (err) {
    console.error("[claude-ai-import] Error:", err);
    const message = err instanceof Error ? err.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
