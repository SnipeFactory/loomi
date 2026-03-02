/**
 * Episodic Memory API — indexing + hybrid search.
 * Ported from episodic-memory src/search.ts & src/indexer.ts.
 *
 * Search sources:
 *   vec_messages     — EN vector (all-MiniLM-L6-v2, English-optimized)
 *   vec_messages_ml  — ML vector (paraphrase-multilingual-MiniLM-L12-v2, Korean/English)
 *   messages_fts     — FTS5 full-text search
 * Vector + FTS results are merged via Reciprocal Rank Fusion (RRF).
 *
 * Model selection is automatic based on language detection (franc).
 * Configurable via episodic-memory module settings (defaultModel + languageModelMap).
 */

import { sql, eq } from "drizzle-orm";
import { getDb } from "../db";
import { sessions, messages } from "../db/schema";
import { MODEL_TABLE_REGISTRY } from "../embeddings";
import { selectModelForText } from "../embeddings/model-selector";
import { getEmbeddingWorkerClient } from "../embeddings/worker-client";
import { conceptsToTagString, getSessionConcepts } from "./auto-tagger";

// ── Types ────────────────────────────────────────────────────────

/** Custom embed function — lets MCP server use inline ONNX instead of the worker client */
export type EmbedFn = (text: string, modelName: string) => Promise<number[]>;

export interface MemorySearchOptions {
  query: string | string[];
  mode?: "vector" | "vector-ml" | "text" | "both";
  limit?: number;
  after?: string;   // ISO date YYYY-MM-DD
  before?: string;  // ISO date YYYY-MM-DD
  project?: string; // partial match against project_path (e.g. "loomi", "snipe")
  embedFn?: EmbedFn; // optional custom embed function (for MCP inline use)
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

export interface SessionSearchOptions {
  query: string;
  limit?: number;
  after?: string;
  before?: string;
  project?: string;
  embedFn?: EmbedFn;
}

export interface SessionSearchResult {
  sessionId: number;
  sessionUuid: string;
  sessionTitle: string | null;
  projectPath: string | null;
  summary: string | null;
  keywords: string | null;
  sessionTags: string | null;
  lastActivityAt: string;
  score: number;
  source: "vector-session" | "fts-session";
}

export interface IndexingStatus {
  totalMessages: number;
  indexedMessages: number;
  pendingMessages: number;
  mlIndexedMessages: number;
  mlPendingMessages: number;
  totalSessionsWithSummary: number;
  indexedSessionSummaries: number;
  pendingSessionSummaries: number;
}

// ── Indexing ─────────────────────────────────────────────────────

/**
 * Index a single user message and its paired assistant response.
 * Language is auto-detected → selects the appropriate model → stores in the matching vec table.
 * Re-indexes if the stored embedding_model differs from the currently selected model.
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

  // Auto-select model based on detected language
  const selectedModel = await selectModelForText(userText);
  const vecTable = MODEL_TABLE_REGISTRY[selectedModel];
  if (!vecTable) {
    console.warn("[Loomi] Unknown model in registry:", selectedModel);
    return false;
  }

  // Check if already indexed with the same model — skip if so
  const currentModel = (userMsg as Record<string, unknown>).embedding_model as string | null;
  if (currentModel === selectedModel) return true;

  // If previously indexed with a different model, clean up the old vec entry
  if (currentModel && currentModel !== selectedModel) {
    const oldTable = MODEL_TABLE_REGISTRY[currentModel];
    if (oldTable) {
      db.run(sql.raw(`DELETE FROM ${oldTable} WHERE id = '${userMsgId}'`));
    }
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

  // Generate embedding and insert into the selected model's vec table
  const embedding = await getEmbeddingWorkerClient().embedPair(
    userText, assistantText, selectedModel, toolNames, sessionTagString
  );
  db.run(sql.raw(`DELETE FROM ${vecTable} WHERE id = '${userMsgId}'`));
  db.run(sql.raw(`
    INSERT INTO ${vecTable} (id, embedding)
    VALUES ('${userMsgId}', '${JSON.stringify(Array.from(new Float32Array(embedding)))}')
  `));

  db.run(sql`
    UPDATE messages
    SET embedding_model = ${selectedModel},
        embedding_indexed_at = ${Date.now()},
        ml_indexed_at = ${Date.now()}
    WHERE id = ${userMsgId}
  `);

  return true;
}

/** ML model used for all session-level embeddings (language-agnostic, single table) */
const SESSION_ML_MODEL = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";

/**
 * Index a session's summary into vec_session_summaries + sessions_fts.
 * Reads the summary from module_data (written by log-summarizer).
 * Returns false if no summary exists yet.
 */
export async function indexSessionSummary(sessionId: number): Promise<boolean> {
  const db = getDb();

  const session = db.all(sql`
    SELECT id, session_uuid, session_tags FROM sessions WHERE id = ${sessionId}
  `)[0] as { id: number; session_uuid: string; session_tags: string | null } | undefined;
  if (!session) return false;

  const moduleRow = db.all(sql`
    SELECT value FROM module_data
    WHERE module_id = 'log-summarizer' AND key = ${"summary:" + session.session_uuid}
  `)[0] as { value: string | null } | undefined;
  if (!moduleRow?.value) return false;

  let summary: string;
  let keywords: string | undefined;
  try {
    const parsed = JSON.parse(moduleRow.value) as { summary?: string; keywords?: string };
    summary = parsed.summary ?? "";
    keywords = parsed.keywords;
  } catch {
    return false;
  }
  if (!summary.trim()) return false;

  const sessionTags = session.session_tags || "";
  const textToEmbed = [summary, keywords, sessionTags].filter(Boolean).join(" ");

  const embedding = await getEmbeddingWorkerClient().embed(textToEmbed, SESSION_ML_MODEL);
  const embeddingJson = JSON.stringify(Array.from(new Float32Array(embedding)));

  // Upsert vec_session_summaries
  db.run(sql.raw(`DELETE FROM vec_session_summaries WHERE id = '${sessionId}'`));
  db.run(sql.raw(`
    INSERT INTO vec_session_summaries (id, embedding)
    VALUES ('${sessionId}', '${embeddingJson}')
  `));

  // Upsert sessions_fts (delete + insert)
  const uuid = session.session_uuid.replace(/'/g, "''");
  const safeSummary = (summary || "").replace(/'/g, "''");
  const safeKeywords = (keywords || "").replace(/'/g, "''");
  const safeTags = sessionTags.replace(/'/g, "''");
  db.run(sql.raw(`DELETE FROM sessions_fts WHERE session_uuid = '${uuid}'`));
  db.run(sql.raw(`
    INSERT INTO sessions_fts (session_uuid, summary, keywords, session_tags)
    VALUES ('${uuid}', '${safeSummary}', '${safeKeywords}', '${safeTags}')
  `));

  db.run(sql`UPDATE sessions SET summary_indexed_at = ${Date.now()} WHERE id = ${sessionId}`);
  return true;
}

/**
 * Batch-index all sessions that have a log-summarizer summary but haven't been indexed yet.
 */
export async function indexAllSessionSummaries(): Promise<number> {
  const db = getDb();

  const pending = db.all(sql`
    SELECT DISTINCT s.id, s.session_uuid
    FROM sessions s
    JOIN module_data md
      ON md.key = 'summary:' || s.session_uuid AND md.module_id = 'log-summarizer'
    WHERE s.summary_indexed_at IS NULL
    ORDER BY s.id ASC
  `) as { id: number; session_uuid: string }[];

  let count = 0;
  for (const s of pending) {
    const ok = await indexSessionSummary(s.id);
    if (ok) count++;
  }
  return count;
}

/**
 * Index all unindexed user messages in a session.
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

  // Attempt session summary indexing (no-op if log-summarizer hasn't run yet)
  await indexSessionSummary(sessionId).catch(() => {});

  return count;
}

/**
 * Index all unindexed messages across all sessions.
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

  // Batch-index all pending session summaries
  await indexAllSessionSummaries().catch(() => {});

  return count;
}

// ── Search ───────────────────────────────────────────────────────

/**
 * Hybrid search: auto-selected vector model + FTS5 with Reciprocal Rank Fusion.
 * Model is selected based on query language detection.
 */
export async function searchMemory(opts: MemorySearchOptions): Promise<MemorySearchResult[]> {
  const mode = opts.mode || "both";
  const limit = opts.limit || 10;

  if (Array.isArray(opts.query)) {
    return searchMultipleConcepts(opts.query, opts);
  }

  const query = opts.query;

  const vecResults  = (mode === "vector" || mode === "vector-ml" || mode === "both") ? await vectorSearch(query, limit * 2, opts) : [];
  const ftsResults  = (mode === "text" || mode === "both") ? ftsSearch(query, limit * 2, opts) : [];

  if (mode === "vector" || mode === "vector-ml") return vecResults.slice(0, limit);
  if (mode === "text") return ftsResults.slice(0, limit);

  return rrfMerge([vecResults, ftsResults], limit);
}

/**
 * Search for multiple concepts (AND match) using auto-selected vector model.
 */
async function searchMultipleConcepts(
  queries: string[],
  opts: MemorySearchOptions
): Promise<MemorySearchResult[]> {
  const limit = opts.limit || 10;

  const resultSets = await Promise.all(
    queries.map((q) => vectorSearch(q, limit * 3, opts))
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

/**
 * Vector search — auto-selects model based on query language, searches the matching vec table.
 */
async function vectorSearch(
  query: string,
  limit: number,
  opts: MemorySearchOptions
): Promise<MemorySearchResult[]> {
  const db = getDb();
  const modelName = await selectModelForText(query);
  const vecTable = MODEL_TABLE_REGISTRY[modelName];
  if (!vecTable) return [];

  const doEmbed = opts.embedFn || ((text: string, model: string) => getEmbeddingWorkerClient().embed(text, model));
  const embedding = await doEmbed(query, modelName);
  const source = vecTable === "vec_messages" ? ("vector" as const) : ("vector-ml" as const);

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
    FROM ${vecTable} v
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
    source,
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

// ── Session Search ────────────────────────────────────────────────

interface VecSessionRow {
  session_id: string;
  distance: number;
  session_uuid: string;
  session_title: string | null;
  project_path: string | null;
  last_activity_at: string;
}

interface FtsSessionRow {
  session_id: number;
  fts_rank: number;
  session_uuid: string;
  session_title: string | null;
  project_path: string | null;
  last_activity_at: string;
  summary: string | null;
  keywords: string | null;
  session_tags: string | null;
}

async function vectorSearchSessions(
  query: string,
  limit: number,
  opts: SessionSearchOptions,
  embedFn: EmbedFn,
): Promise<SessionSearchResult[]> {
  const db = getDb();
  const embedding = await embedFn(query, SESSION_ML_MODEL);

  let dateFilter = "";
  if (opts.after && ISO_DATE_RE.test(opts.after)) dateFilter += ` AND s.last_activity_at >= '${opts.after}'`;
  if (opts.before && ISO_DATE_RE.test(opts.before)) dateFilter += ` AND s.last_activity_at <= '${opts.before}'`;
  if (opts.project) dateFilter += ` AND s.project_path LIKE '%${opts.project.replace(/'/g, "''")}%'`;

  const results = db.all(sql.raw(`
    SELECT
      v.id as session_id,
      v.distance,
      s.session_uuid,
      s.title as session_title,
      s.project_path,
      s.last_activity_at
    FROM vec_session_summaries v
    JOIN sessions s ON s.id = CAST(v.id AS INTEGER)
    WHERE v.embedding MATCH '${JSON.stringify(Array.from(new Float32Array(embedding)))}'
      AND k = ${limit}
      ${dateFilter}
    ORDER BY v.distance ASC
  `)) as VecSessionRow[];

  return results.map((r) => ({
    sessionId: parseInt(r.session_id),
    sessionUuid: r.session_uuid,
    sessionTitle: r.session_title,
    projectPath: r.project_path,
    summary: null,
    keywords: null,
    sessionTags: null,
    lastActivityAt: r.last_activity_at,
    score: 1 - r.distance,
    source: "vector-session" as const,
  }));
}

function ftsSearchSessions(
  query: string,
  limit: number,
  opts: SessionSearchOptions,
): SessionSearchResult[] {
  const db = getDb();

  let dateFilter = "";
  if (opts.after && ISO_DATE_RE.test(opts.after)) dateFilter += ` AND s.last_activity_at >= '${opts.after}'`;
  if (opts.before && ISO_DATE_RE.test(opts.before)) dateFilter += ` AND s.last_activity_at <= '${opts.before}'`;
  if (opts.project) dateFilter += ` AND s.project_path LIKE '%${opts.project.replace(/'/g, "''")}%'`;

  try {
    const results = db.all(sql.raw(`
      SELECT
        s.id as session_id,
        rank as fts_rank,
        sf.session_uuid,
        s.title as session_title,
        s.project_path,
        s.last_activity_at,
        sf.summary,
        sf.keywords,
        sf.session_tags
      FROM sessions_fts sf
      JOIN sessions s ON s.session_uuid = sf.session_uuid
      WHERE sessions_fts MATCH '${query.replace(/'/g, "''")}'
        ${dateFilter}
      ORDER BY rank
      LIMIT ${limit}
    `)) as FtsSessionRow[];

    return results.map((r) => ({
      sessionId: r.session_id,
      sessionUuid: r.session_uuid,
      sessionTitle: r.session_title,
      projectPath: r.project_path,
      summary: r.summary,
      keywords: r.keywords,
      sessionTags: r.session_tags,
      lastActivityAt: r.last_activity_at,
      score: -r.fts_rank,
      source: "fts-session" as const,
    }));
  } catch {
    return [];
  }
}

function rrfMergeSession(
  resultSets: SessionSearchResult[][],
  limit: number,
  k = 60,
): SessionSearchResult[] {
  const scoreMap = new Map<number, { result: SessionSearchResult; score: number }>();

  for (const results of resultSets) {
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const rrfScore = 1 / (k + i + 1);
      const existing = scoreMap.get(r.sessionId);
      if (existing) {
        // Merge summary fields from FTS results (which have actual content)
        if (!existing.result.summary && r.summary) {
          existing.result.summary = r.summary;
          existing.result.keywords = r.keywords;
          existing.result.sessionTags = r.sessionTags;
        }
        existing.score += rrfScore;
      } else {
        scoreMap.set(r.sessionId, { result: r, score: rrfScore });
      }
    }
  }

  return [...scoreMap.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => ({ ...entry.result, score: entry.score }));
}

/**
 * Hybrid search over session-level summaries (vector + FTS5 + RRF).
 * Requires log-summarizer to have generated summaries.
 */
export async function searchSessions(opts: SessionSearchOptions): Promise<SessionSearchResult[]> {
  const limit = opts.limit || 10;
  const embedFn: EmbedFn = opts.embedFn || ((text, model) => getEmbeddingWorkerClient().embed(text, model));

  const [vecResults, ftsResults] = await Promise.all([
    vectorSearchSessions(opts.query, limit * 2, opts, embedFn),
    Promise.resolve(ftsSearchSessions(opts.query, limit * 2, opts)),
  ]);

  return rrfMergeSession([vecResults, ftsResults], limit);
}

/**
 * Extract the most relevant snippet from a long text for a given query.
 * Splits into paragraphs, scores each by matching query words, returns the best.
 */
export function extractRelevantSnippet(text: string, query: string, maxLen = 200): string {
  const queryWords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 1);

  // Try double-newline paragraphs first, fallback to sentences
  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter((p) => p.length > 0);
  const segments = paragraphs.length > 1
    ? paragraphs
    : text.split(/[.!?]+\s+/).map((s) => s.trim()).filter((s) => s.length > 0);

  if (segments.length === 0) {
    return text.length > maxLen ? text.slice(0, maxLen) + "..." : text;
  }

  let bestScore = -1;
  let best = segments[0];

  for (const seg of segments) {
    const lower = seg.toLowerCase();
    const score = queryWords.reduce((acc, w) => acc + (lower.includes(w) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      best = seg;
    }
  }

  return best.length > maxLen ? best.slice(0, maxLen) + "..." : best;
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
    SET embedding_indexed_at = NULL, ml_indexed_at = NULL, embedding_model = NULL
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
    SET embedding_indexed_at = NULL, ml_indexed_at = NULL, embedding_model = NULL
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

  const totalWithSummary = db.all(sql`
    SELECT COUNT(DISTINCT s.id) as cnt
    FROM sessions s
    JOIN module_data md ON md.key = 'summary:' || s.session_uuid AND md.module_id = 'log-summarizer'
  `)[0] as { cnt: number };

  const indexedSummaries = db.all(sql`
    SELECT COUNT(*) as cnt FROM sessions WHERE summary_indexed_at IS NOT NULL
  `)[0] as { cnt: number };

  return {
    totalMessages: total.cnt,
    indexedMessages: indexed.cnt,
    pendingMessages: total.cnt - indexed.cnt,
    mlIndexedMessages: mlIndexed.cnt,
    mlPendingMessages: total.cnt - mlIndexed.cnt,
    totalSessionsWithSummary: totalWithSummary.cnt,
    indexedSessionSummaries: indexedSummaries.cnt,
    pendingSessionSummaries: totalWithSummary.cnt - indexedSummaries.cnt,
  };
}
