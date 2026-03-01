import { desc, eq, like, and, sql, asc, lt, gt } from "drizzle-orm";
import { getDb } from "../db";
import { sessions, messages } from "../db/schema";
import type { SessionQueryOptions, SessionListResult, SessionDetailResult, SessionMessagesOptions, ProjectUsageStats } from "./types";

export function listSessions(opts: SessionQueryOptions = {}): SessionListResult {
  const db = getDb();
  const limit = opts.limit || 50;
  const page = opts.page || 1;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (opts.tool) conditions.push(eq(sessions.toolType, opts.tool));
  if (opts.provider) conditions.push(eq(sessions.provider, opts.provider));
  if (opts.projectPath) conditions.push(like(sessions.projectPath, `%${opts.projectPath}%`));
  if (opts.q) conditions.push(like(sessions.title, `%${opts.q}%`));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const results = db
    .select()
    .from(sessions)
    .where(where)
    .orderBy(desc(sessions.lastActivityAt))
    .limit(limit)
    .offset(offset)
    .all();

  const countResult = db
    .select({ count: sql<number>`count(*)` })
    .from(sessions)
    .where(where)
    .get();

  return { sessions: results, total: countResult?.count || 0, page, limit };
}

export function getSessionById(id: number, opts: SessionMessagesOptions = {}): SessionDetailResult | null {
  const db = getDb();
  const session = db.select().from(sessions).where(eq(sessions.id, id)).get();
  if (!session) return null;

  const limit = opts.limit ?? 50;

  const totalResult = db
    .select({ count: sql<number>`count(*)` })
    .from(messages)
    .where(eq(messages.sessionId, id))
    .get();
  const totalMessages = totalResult?.count ?? 0;

  // Live-update poll: fetch only new messages after a given sort_order
  if (opts.afterSortOrder !== undefined) {
    const msgs = db
      .select()
      .from(messages)
      .where(and(eq(messages.sessionId, id), gt(messages.sortOrder, opts.afterSortOrder)))
      .orderBy(asc(messages.sortOrder))
      .all();
    return { session, messages: msgs, totalMessages, hasMore: false };
  }

  // Load-more: fetch N messages before a given sort_order (cursor)
  if (opts.beforeSortOrder !== undefined) {
    const rawMsgs = db
      .select()
      .from(messages)
      .where(and(eq(messages.sessionId, id), lt(messages.sortOrder, opts.beforeSortOrder)))
      .orderBy(desc(messages.sortOrder))
      .limit(limit)
      .all();
    const msgs = rawMsgs.reverse();
    return { session, messages: msgs, totalMessages, hasMore: rawMsgs.length >= limit };
  }

  // Default: last N messages (most recent)
  const rawMsgs = db
    .select()
    .from(messages)
    .where(eq(messages.sessionId, id))
    .orderBy(desc(messages.sortOrder))
    .limit(limit)
    .all();
  const msgs = rawMsgs.reverse();
  return { session, messages: msgs, totalMessages, hasMore: totalMessages > limit };
}

export function getSessionByUuid(uuid: string) {
  const db = getDb();
  return db.select().from(sessions).where(eq(sessions.sessionUuid, uuid)).get() ?? null;
}

export function getDistinctProjects(): string[] {
  const db = getDb();
  const rows = db
    .selectDistinct({ projectPath: sessions.projectPath })
    .from(sessions)
    .where(sql`project_path IS NOT NULL`)
    .all();
  return rows.map((r) => r.projectPath).filter(Boolean) as string[];
}

export function getProjectUsageStats(): ProjectUsageStats[] {
  const db = getDb();
  return db.all(sql`
    SELECT
      project_path as projectPath,
      COUNT(*) as sessionCount,
      SUM(user_message_count + assistant_message_count) as messageCount,
      SUM(total_input_tokens) as totalInputTokens,
      SUM(total_output_tokens) as totalOutputTokens,
      SUM(estimated_cost_usd) as totalCost,
      MAX(last_activity_at) as lastActivityAt
    FROM sessions
    WHERE project_path IS NOT NULL
    GROUP BY project_path
    ORDER BY sessionCount DESC
  `) as ProjectUsageStats[];
}
