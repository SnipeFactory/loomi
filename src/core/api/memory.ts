/**
 * Episodic Memory API — indexing + hybrid search.
 * Ported from episodic-memory src/search.ts & src/indexer.ts.
 *
 * Search sources:
 *   vec_messages     — EN vector (all-MiniLM-L6-v2, English-optimized)
 *   vec_messages_ml  — ML vector (paraphrase-multilingual-MiniLM-L12-v2, Korean/English)
 *   messages_fts     — FTS5 full-text search
 * All three are merged via Reciprocal Rank Fusion (RRF).
 */

import { sql, eq } from "drizzle-orm";
import { getDb } from "../db";
import { sessions, messages } from "../db/schema";
import {
  generateEmbedding,
  generateMessagePairEmbedding,
  generateMultilingualEmbedding,
  generateMultilingualMessagePairEmbedding,
} from "../embeddings";
import { conceptsToTagString, getSessionConcepts } from "./auto-tagger";

// ── Types ────────────────────────────────────────────────────────

export interface MemorySearchOptions {
  query: string | string[];
  mode?: "vector" | "vector-ml" | "text" | "both";
  limit?: number;
  after?: string;   // ISO date YYYY-MM-DD
  before?: string;  // ISO date YYYY-MM-DD
  project?: string; // partial match against project_path (e.g. "loomi", "snipe")
}

export interface MemorySearchResult {
  messageId: number;
  sessionUuid: string;
  sessionTitle: string | null;
  projectPath: string | null;
  userText: string | null;
  assistantText: string | null;
  timestamp: string;
  score: number;
  source: "vector" | "vector-ml" | "fts";
}

export interface IndexingStatus {
  totalMessages: number;
  indexedMessages: number;
  pendingMessages: number;
  mlIndexedMessages: number;
  mlPendingMessages: number;
}

// ── Indexing ─────────────────────────────────────────────────────

/**
 * Index a single user message and its paired assistant response
 * into BOTH vec_messages (EN) and vec_messages_ml (ML).
 * Only generates an embedding if the entry doesn't already exist in the table.
 */
export async function indexMessagePair(
  userMsgId: number,
  sessionTagString?: string
): Promise<boolean> {
  const db = getDb();

  // Get user message
  const userMsg = db
    .select()
    .from(messages)
    .where(eq(messages.id, userMsgId))
    .get();
  if (!userMsg || userMsg.role !== "user") return false;

  // Find the next assistant message in the same session by sort_order
  const assistantMsg = db.all(sql`
    SELECT * FROM messages
    WHERE session_id = ${userMsg.sessionId}
      AND sort_order > ${userMsg.sortOrder}
      AND role = 'assistant'
    ORDER BY sort_order ASC
    LIMIT 1
  `)[0] as typeof messages.$inferSelect | undefined;

  const userText = userMsg.textContent || "";
  const assistantText = (assistantMsg as Record<string, unknown>)?.text_content as string || "";

  // Skip messages that are noise — not worth indexing:
  //   • tool_result / tool_error outputs
  //   • very short messages (< 5 chars) — greetings like "hi", "hey"
  //   • Claude Code context-window summary injections
  const isNoise =
    !userText ||
    userText.startsWith("[tool_result]") ||
    userText.startsWith("[tool_error]") ||
    userText.trim().length < 5 ||
    userText.startsWith("This session is being continued from a previous conversation");

  if (isNoise) {
    db.run(sql`
      UPDATE messages
      SET embedding_indexed_at = ${Date.now()}, ml_indexed_at = ${Date.now()}
      WHERE id = ${userMsgId}
    `);
    return false;
  }

  // Extract tool names from assistant's tool_use_json
  let toolNames: string[] | undefined;
  const toolJson = (assistantMsg as Record<string, unknown>)?.tool_use_json as string | null;
  if (toolJson) {
    try {
      const tools = JSON.parse(toolJson) as { name: string }[];
      toolNames = tools.map((t) => t.name);
    } catch { /* ignore */ }
  }

  // ── EN vector (vec_messages) ─────────────────────────────────
  const alreadyEN = db.all(sql`SELECT id FROM vec_messages WHERE id = ${String(userMsgId)}`).length > 0;
  if (!alreadyEN) {
    const embedding = await generateMessagePairEmbedding(userText, assistantText, toolNames, sessionTagString);
    db.run(sql`DELETE FROM vec_messages WHERE id = ${String(userMsgId)}`);
    db.run(sql`
      INSERT INTO vec_messages (id, embedding)
      VALUES (${String(userMsgId)}, ${new Float32Array(embedding) as unknown as string})
    `);
    db.run(sql`UPDATE messages SET embedding_indexed_at = ${Date.now()} WHERE id = ${userMsgId}`);
  }

  // ── ML vector (vec_messages_ml) ──────────────────────────────
  const alreadyML = db.all(sql`SELECT id FROM vec_messages_ml WHERE id = ${String(userMsgId)}`).length > 0;
  if (!alreadyML) {
    const mlEmbedding = await generateMultilingualMessagePairEmbedding(userText, assistantText, toolNames, sessionTagString);
    db.run(sql`DELETE FROM vec_messages_ml WHERE id = ${String(userMsgId)}`);
    db.run(sql`
      INSERT INTO vec_messages_ml (id, embedding)
      VALUES (${String(userMsgId)}, ${new Float32Array(mlEmbedding) as unknown as string})
    `);
    db.run(sql`UPDATE messages SET ml_indexed_at = ${Date.now()} WHERE id = ${userMsgId}`);
  }

  return true;
}

/**
 * Index all unindexed user messages in a session (EN + ML).
 */
export async function indexSession(sessionId: number): Promise<number> {
  const db = getDb();

  const unindexed = db.all(sql`
    SELECT id FROM messages
    WHERE session_id = ${sessionId}
      AND role = 'user'
      AND (embedding_indexed_at IS NULL OR ml_indexed_at IS NULL)
    ORDER BY sort_order ASC
  `) as { id: number }[];

  const concepts = getSessionConcepts(sessionId);
  const tagString = concepts ? conceptsToTagString(concepts) : undefined;

  let count = 0;
  for (const msg of unindexed) {
    const ok = await indexMessagePair(msg.id, tagString);
    if (ok) count++;
  }

  return count;
}

/**
 * Index all unindexed messages across all sessions (EN + ML).
 */
export async function indexAll(): Promise<number> {
  const db = getDb();

  const unindexed = db.all(sql`
    SELECT id, session_id FROM messages
    WHERE role = 'user'
      AND (embedding_indexed_at IS NULL OR ml_indexed_at IS NULL)
    ORDER BY session_id ASC, sort_order ASC
  `) as { id: number; session_id: number }[];

  const tagCache = new Map<number, string | undefined>();

  let count = 0;
  for (const msg of unindexed) {
    if (!tagCache.has(msg.session_id)) {
      const concepts = getSessionConcepts(msg.session_id);
      tagCache.set(msg.session_id, concepts ? conceptsToTagString(concepts) : undefined);
    }
    const ok = await indexMessagePair(msg.id, tagCache.get(msg.session_id));
    if (ok) count++;
  }

  return count;
}

// ── Search ───────────────────────────────────────────────────────

/**
 * Hybrid search: EN vector + ML vector + FTS5 with Reciprocal Rank Fusion.
 */
export async function searchMemory(opts: MemorySearchOptions): Promise<MemorySearchResult[]> {
  const mode = opts.mode || "both";
  const limit = opts.limit || 10;

  if (Array.isArray(opts.query)) {
    return searchMultipleConcepts(opts.query, opts);
  }

  const query = opts.query;

  const enResults  = (mode === "vector" || mode === "both") ? await vectorSearchEN(query, limit * 2, opts) : [];
  const mlResults  = (mode === "vector-ml" || mode === "both") ? await vectorSearchML(query, limit * 2, opts) : [];
  const ftsResults = (mode === "text" || mode === "both") ? ftsSearch(query, limit * 2, opts) : [];

  if (mode === "vector")    return enResults.slice(0, limit);
  if (mode === "vector-ml") return mlResults.slice(0, limit);
  if (mode === "text")      return ftsResults.slice(0, limit);

  return rrfMerge([enResults, mlResults, ftsResults], limit);
}

/**
 * Search for multiple concepts (AND match) using EN vector.
 */
async function searchMultipleConcepts(
  queries: string[],
  opts: MemorySearchOptions
): Promise<MemorySearchResult[]> {
  const limit = opts.limit || 10;

  const resultSets = await Promise.all(
    queries.map((q) => vectorSearchEN(q, limit * 3, opts))
  );

  const idSets = resultSets.map((results) => new Set(results.map((r) => r.messageId)));
  const intersection = resultSets[0].filter((r) =>
    idSets.every((set) => set.has(r.messageId))
  );

  return intersection.slice(0, limit).map((r) => {
    const scores = resultSets.map((results) => {
      const match = results.find((rr) => rr.messageId === r.messageId);
      return match?.score || 0;
    });
    return { ...r, score: scores.reduce((a, b) => a + b, 0) / scores.length };
  });
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function vectorSearchEN(
  query: string,
  limit: number,
  opts: MemorySearchOptions
): Promise<MemorySearchResult[]> {
  const db = getDb();
  const embedding = await generateEmbedding(query);

  let dateFilter = "";
  if (opts.after && ISO_DATE_RE.test(opts.after)) dateFilter += ` AND m.timestamp >= '${opts.after}'`;
  if (opts.before && ISO_DATE_RE.test(opts.before)) dateFilter += ` AND m.timestamp <= '${opts.before}'`;
  if (opts.project) dateFilter += ` AND s.project_path LIKE '%${opts.project.replace(/'/g, "''")}%'`;

  const results = db.all(sql.raw(`
    SELECT
      v.id as msg_id,
      v.distance,
      m.text_content as user_text,
      m.timestamp,
      s.session_uuid,
      s.title as session_title,
      s.project_path,
      (SELECT text_content FROM messages m2
       WHERE m2.session_id = m.session_id
         AND m2.sort_order > m.sort_order
         AND m2.role = 'assistant'
       ORDER BY m2.sort_order ASC LIMIT 1) as assistant_text
    FROM vec_messages v
    JOIN messages m ON m.id = CAST(v.id AS INTEGER)
    JOIN sessions s ON s.id = m.session_id
    WHERE v.embedding MATCH '${JSON.stringify(Array.from(new Float32Array(embedding)))}'
      AND k = ${limit}
      ${dateFilter}
    ORDER BY v.distance ASC
  `)) as VecRow[];

  return results.map((r) => ({
    messageId: parseInt(r.msg_id),
    sessionUuid: r.session_uuid,
    sessionTitle: r.session_title,
    projectPath: r.project_path,
    userText: r.user_text,
    assistantText: r.assistant_text,
    timestamp: r.timestamp,
    score: 1 - r.distance,
    source: "vector" as const,
  }));
}

async function vectorSearchML(
  query: string,
  limit: number,
  opts: MemorySearchOptions
): Promise<MemorySearchResult[]> {
  const db = getDb();
  const embedding = await generateMultilingualEmbedding(query);

  let dateFilter = "";
  if (opts.after && ISO_DATE_RE.test(opts.after)) dateFilter += ` AND m.timestamp >= '${opts.after}'`;
  if (opts.before && ISO_DATE_RE.test(opts.before)) dateFilter += ` AND m.timestamp <= '${opts.before}'`;
  if (opts.project) dateFilter += ` AND s.project_path LIKE '%${opts.project.replace(/'/g, "''")}%'`;

  const results = db.all(sql.raw(`
    SELECT
      v.id as msg_id,
      v.distance,
      m.text_content as user_text,
      m.timestamp,
      s.session_uuid,
      s.title as session_title,
      s.project_path,
      (SELECT text_content FROM messages m2
       WHERE m2.session_id = m.session_id
         AND m2.sort_order > m.sort_order
         AND m2.role = 'assistant'
       ORDER BY m2.sort_order ASC LIMIT 1) as assistant_text
    FROM vec_messages_ml v
    JOIN messages m ON m.id = CAST(v.id AS INTEGER)
    JOIN sessions s ON s.id = m.session_id
    WHERE v.embedding MATCH '${JSON.stringify(Array.from(new Float32Array(embedding)))}'
      AND k = ${limit}
      ${dateFilter}
    ORDER BY v.distance ASC
  `)) as VecRow[];

  return results.map((r) => ({
    messageId: parseInt(r.msg_id),
    sessionUuid: r.session_uuid,
    sessionTitle: r.session_title,
    projectPath: r.project_path,
    userText: r.user_text,
    assistantText: r.assistant_text,
    timestamp: r.timestamp,
    score: 1 - r.distance,
    source: "vector-ml" as const,
  }));
}

interface VecRow {
  msg_id: string;
  distance: number;
  user_text: string | null;
  assistant_text: string | null;
  timestamp: string;
  session_uuid: string;
  session_title: string | null;
  project_path: string | null;
}

function ftsSearch(
  query: string,
  limit: number,
  opts: MemorySearchOptions
): MemorySearchResult[] {
  const db = getDb();

  let dateFilter = "";
  if (opts.after && ISO_DATE_RE.test(opts.after)) dateFilter += ` AND m.timestamp >= '${opts.after}'`;
  if (opts.before && ISO_DATE_RE.test(opts.before)) dateFilter += ` AND m.timestamp <= '${opts.before}'`;

  const results = db.all(sql.raw(`
    SELECT
      m.id as msg_id,
      rank as fts_rank,
      m.text_content as user_text,
      m.timestamp,
      s.session_uuid,
      s.title as session_title,
      s.project_path,
      (SELECT text_content FROM messages m2
       WHERE m2.session_id = m.session_id
         AND m2.sort_order > m.sort_order
         AND m2.role = 'assistant'
       ORDER BY m2.sort_order ASC LIMIT 1) as assistant_text
    FROM messages_fts fts
    JOIN messages m ON m.id = fts.rowid
    JOIN sessions s ON s.id = m.session_id
    WHERE messages_fts MATCH '${query.replace(/'/g, "''")}'
      AND m.role = 'user'
      AND m.text_content NOT LIKE '[tool_result]%'
      AND m.text_content NOT LIKE '[tool_error]%'
      AND length(m.text_content) >= 5
      AND m.text_content NOT LIKE 'This session is being continued from a previous conversation%'
      ${opts.project ? `AND s.project_path LIKE '%${opts.project.replace(/'/g, "''")}%'` : ""}
      ${dateFilter}
    ORDER BY rank
    LIMIT ${limit}
  `)) as { msg_id: number; fts_rank: number; user_text: string | null; assistant_text: string | null; timestamp: string; session_uuid: string; session_title: string | null; project_path: string | null }[];

  return results.map((r) => ({
    messageId: r.msg_id,
    sessionUuid: r.session_uuid,
    sessionTitle: r.session_title,
    projectPath: r.project_path,
    userText: r.user_text,
    assistantText: r.assistant_text,
    timestamp: r.timestamp,
    score: -r.fts_rank,
    source: "fts" as const,
  }));
}

/**
 * Reciprocal Rank Fusion — merges N result sets.
 * RRF score = sum(1 / (k + rank)) across all result sets.
 */
function rrfMerge(
  resultSets: MemorySearchResult[][],
  limit: number,
  k = 60
): MemorySearchResult[] {
  const scoreMap = new Map<number, { result: MemorySearchResult; score: number }>();

  for (const results of resultSets) {
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const rrfScore = 1 / (k + i + 1);
      const existing = scoreMap.get(r.messageId);
      if (existing) {
        existing.score += rrfScore;
      } else {
        scoreMap.set(r.messageId, { result: r, score: rrfScore });
      }
    }
  }

  return [...scoreMap.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => ({ ...entry.result, score: entry.score }));
}

// ── Cleanup ───────────────────────────────────────────────────────

/**
 * Delete vec_messages / vec_messages_ml entries where the user message has no text content.
 */
export function cleanupNullVectors(): number {
  const db = getDb();

  const nullFilter = `
    WHERE m.role = 'user'
      AND (m.text_content IS NULL OR m.text_content = '')
  `;

  const en = db.run(sql.raw(`
    DELETE FROM vec_messages
    WHERE id IN (
      SELECT CAST(v.id AS TEXT) FROM vec_messages v
      JOIN messages m ON m.id = CAST(v.id AS INTEGER)
      ${nullFilter}
    )
  `)).changes;

  const ml = db.run(sql.raw(`
    DELETE FROM vec_messages_ml
    WHERE id IN (
      SELECT CAST(v.id AS TEXT) FROM vec_messages_ml v
      JOIN messages m ON m.id = CAST(v.id AS INTEGER)
      ${nullFilter}
    )
  `)).changes;

  return en + ml;
}

/**
 * Remove vec entries for tool_result/tool_error messages and reset
 * their indexed_at so index-all re-processes them (and skips them via the new guard).
 */
export function cleanupToolResultVectors(): { deleted: number; reset: number } {
  const db = getDb();

  const toolFilter = `
    WHERE m.role = 'user'
      AND (
        m.text_content LIKE '[tool_result]%'
        OR m.text_content LIKE '[tool_error]%'
      )
  `;

  const enDeleted = db.run(sql.raw(`
    DELETE FROM vec_messages
    WHERE id IN (
      SELECT CAST(v.id AS TEXT) FROM vec_messages v
      JOIN messages m ON m.id = CAST(v.id AS INTEGER)
      ${toolFilter}
    )
  `)).changes;

  const mlDeleted = db.run(sql.raw(`
    DELETE FROM vec_messages_ml
    WHERE id IN (
      SELECT CAST(v.id AS TEXT) FROM vec_messages_ml v
      JOIN messages m ON m.id = CAST(v.id AS INTEGER)
      ${toolFilter}
    )
  `)).changes;

  const reset = db.run(sql`
    UPDATE messages
    SET embedding_indexed_at = NULL, ml_indexed_at = NULL
    WHERE role = 'user'
      AND (
        text_content LIKE '[tool_result]%'
        OR text_content LIKE '[tool_error]%'
      )
  `).changes;

  return { deleted: enDeleted + mlDeleted, reset };
}

/**
 * Remove vec entries for newly-added noise categories:
 *   • short messages (< 5 chars)
 *   • Claude Code context-window summary injections
 * Resets indexed_at so index-all re-processes them (and skips via isNoise guard).
 */
export function cleanupNoiseVectors(): { deleted: number; reset: number } {
  const db = getDb();

  const noiseWhere = `
    WHERE m.role = 'user'
      AND (
        length(m.text_content) < 5
        OR m.text_content LIKE 'This session is being continued from a previous conversation%'
      )
  `;

  const enDeleted = db.run(sql.raw(
    `DELETE FROM vec_messages WHERE id IN (SELECT CAST(v.id AS TEXT) FROM vec_messages v JOIN messages m ON m.id = CAST(v.id AS INTEGER) ${noiseWhere})`
  )).changes;

  const mlDeleted = db.run(sql.raw(
    `DELETE FROM vec_messages_ml WHERE id IN (SELECT CAST(v.id AS TEXT) FROM vec_messages_ml v JOIN messages m ON m.id = CAST(v.id AS INTEGER) ${noiseWhere})`
  )).changes;

  const reset = db.run(sql`
    UPDATE messages
    SET embedding_indexed_at = NULL, ml_indexed_at = NULL
    WHERE role = 'user'
      AND (
        length(text_content) < 5
        OR text_content LIKE 'This session is being continued from a previous conversation%'
      )
  `).changes;

  return { deleted: enDeleted + mlDeleted, reset };
}

// ── Status ───────────────────────────────────────────────────────

export function getIndexingStatus(): IndexingStatus {
  const db = getDb();

  const total = db.all(sql`
    SELECT COUNT(*) as cnt FROM messages WHERE role = 'user'
  `)[0] as { cnt: number };

  const indexed = db.all(sql`
    SELECT COUNT(*) as cnt FROM messages WHERE role = 'user' AND embedding_indexed_at IS NOT NULL
  `)[0] as { cnt: number };

  const mlIndexed = db.all(sql`
    SELECT COUNT(*) as cnt FROM messages WHERE role = 'user' AND ml_indexed_at IS NOT NULL
  `)[0] as { cnt: number };

  return {
    totalMessages: total.cnt,
    indexedMessages: indexed.cnt,
    pendingMessages: total.cnt - indexed.cnt,
    mlIndexedMessages: mlIndexed.cnt,
    mlPendingMessages: total.cnt - mlIndexed.cnt,
  };
}
