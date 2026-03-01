import { eq, sql, asc } from "drizzle-orm";
import { getDb } from "../db";
import { messages } from "../db/schema";
import type { ToolUsageRecord } from "./types";

export function getMessagesBySessionId(sessionId: number) {
  const db = getDb();
  return db
    .select()
    .from(messages)
    .where(eq(messages.sessionId, sessionId))
    .orderBy(asc(messages.sortOrder))
    .all();
}

export function getToolUsageStats(sessionId?: number): ToolUsageRecord[] {
  const db = getDb();
  const rows = sessionId
    ? db.all(sql`
        SELECT tool_use_json, session_id
        FROM messages
        WHERE tool_use_json IS NOT NULL AND session_id = ${sessionId}
      `) as { tool_use_json: string; session_id: number }[]
    : db.all(sql`
        SELECT tool_use_json, session_id
        FROM messages
        WHERE tool_use_json IS NOT NULL
      `) as { tool_use_json: string; session_id: number }[];

  const toolMap = new Map<string, { count: number; sessionIds: Set<number> }>();
  for (const row of rows) {
    try {
      const tools = JSON.parse(row.tool_use_json);
      for (const tool of tools) {
        if (!toolMap.has(tool.name)) {
          toolMap.set(tool.name, { count: 0, sessionIds: new Set() });
        }
        const entry = toolMap.get(tool.name)!;
        entry.count++;
        entry.sessionIds.add(row.session_id);
      }
    } catch {
      // skip malformed JSON
    }
  }

  return Array.from(toolMap.entries())
    .map(([name, data]) => ({
      toolName: name,
      usageCount: data.count,
      sessionCount: data.sessionIds.size,
    }))
    .sort((a, b) => b.usageCount - a.usageCount);
}
