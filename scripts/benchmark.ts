/**
 * Loomi Embedding Benchmark
 *
 * Measures performance across the full embedding cycle:
 *   language detection → model selection → embedding generation → vector insert → search → RRF
 *
 * Usage:
 *   npm run benchmark                     # all 6 suites
 *   npm run benchmark -- --only=lang      # lang / model / embed / index / search / memory
 *   npm run benchmark -- --samples=30     # sample count (default: 20)
 *   npm run benchmark -- --json           # save JSON report to data/benchmark-*.json
 */

import { performance } from "perf_hooks";
import { sql } from "drizzle-orm";
import fs from "fs";
import path from "path";

// ── DB init ────────────────────────────────────────────────────────────────
import { runMigrations } from "../src/core/db/migrate";
import { getDb } from "../src/core/db";

// ── Embedding engine ───────────────────────────────────────────────────────
import {
  generateEmbeddingWithModel,
  generateMessagePairEmbeddingWithModel,
  disposeEmbeddings,
  MODEL_TABLE_REGISTRY,
  DEFAULT_MODEL,
} from "../src/core/embeddings";

// ── Model selector ─────────────────────────────────────────────────────────
import {
  detectLanguage,
  selectModelForText,
} from "../src/core/embeddings/model-selector";

// ── Search ─────────────────────────────────────────────────────────────────
import { searchMemory } from "../src/core/api/memory";
import { getEmbeddingWorkerClient } from "../src/core/embeddings/worker-client";

// ── Constants ──────────────────────────────────────────────────────────────
const ML_MODEL = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";
const EN_MODEL = "Xenova/all-MiniLM-L6-v2";

// ── CLI args ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const onlyArg = args.find((a) => a.startsWith("--only="))?.split("=")[1];
const samplesArg = parseInt(args.find((a) => a.startsWith("--samples="))?.split("=")[1] || "20", 10);
const jsonFlag = args.includes("--json");

const SAMPLES = isNaN(samplesArg) ? 20 : samplesArg;

// ── Suite filter ───────────────────────────────────────────────────────────
type SuiteId = "lang" | "model" | "embed" | "index" | "search" | "memory";
const SUITES: SuiteId[] = ["lang", "model", "embed", "index", "search", "memory"];
const activeSuites = onlyArg
  ? SUITES.filter((s) => s === onlyArg)
  : SUITES;

// ── Helper: measure ────────────────────────────────────────────────────────
async function measure<T>(fn: () => Promise<T>): Promise<{ result: T; ms: number }> {
  const t0 = performance.now();
  const result = await fn();
  return { result, ms: performance.now() - t0 };
}

// ── Helper: memory ─────────────────────────────────────────────────────────
interface MemSnap {
  rss: number;
  heapUsed: number;
  external: number;
}

function memSnap(): MemSnap {
  const m = process.memoryUsage();
  return {
    rss: m.rss / 1024 / 1024,
    heapUsed: m.heapUsed / 1024 / 1024,
    external: m.external / 1024 / 1024,
  };
}

function memDiff(before: MemSnap, after: MemSnap): string {
  const rss = after.rss - before.rss;
  const heap = after.heapUsed - before.heapUsed;
  const sign = (n: number) => (n >= 0 ? "+" : "");
  return `${sign(rss)}${rss.toFixed(0)}MB RSS / ${sign(heap)}${heap.toFixed(0)}MB heap`;
}

// ── Helper: percentiles ────────────────────────────────────────────────────
function percentiles(arr: number[]): { p50: number; p95: number; p99: number } {
  const sorted = [...arr].sort((a, b) => a - b);
  const p = (pct: number) => sorted[Math.floor((pct / 100) * sorted.length)] ?? sorted[sorted.length - 1];
  return { p50: p(50), p95: p(95), p99: p(99) };
}

// ── Helper: format latency (magnitude-aware) ───────────────────────────────
function fmt(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(2)}μs`;
  if (ms < 1000) return `${ms.toFixed(2)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

// ── Helper: row output ─────────────────────────────────────────────────────
function row(label: string, value: string): void {
  console.log(`  ${label.padEnd(34)}${value}`);
}

// ── Helper: sample messages from DB ───────────────────────────────────────
function sampleMessages(
  n: number,
  db: ReturnType<typeof getDb>
): Array<{ id: number; text_content: string }> {
  return db.all(sql.raw(`
    SELECT id, text_content
    FROM messages
    WHERE role = 'user'
      AND embedding_model IS NOT NULL
      AND text_content IS NOT NULL
      AND length(text_content) >= 20
    ORDER BY RANDOM()
    LIMIT ${n}
  `)) as Array<{ id: number; text_content: string }>;
}

// ── Helper: section divider ────────────────────────────────────────────────
function divider() {
  console.log("━".repeat(44));
}

// ── Report accumulator ─────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const report: Record<string, any> = { timestamp: new Date().toISOString() };

// ══════════════════════════════════════════════════════════════════════════════
// Suite 1: Language Detection
// ══════════════════════════════════════════════════════════════════════════════
async function runLangSuite() {
  const ITERS = 1000;
  console.log("\n[1/6] Language Detection");

  // Warmup — force ESM dynamic import cache
  await detectLanguage("warmup text before measurement");

  const cases = [
    {
      label: "Korean (script fast path)",
      text: "안녕하세요, 이 기능을 어떻게 구현해야 할까요?",
      expected: "kor",
    },
    {
      label: "English technical (francAll)",
      text: "Implement TTL-based auto-unload in Node.js using setTimeout",
      expected: "eng",
    },
    {
      label: "English natural (francAll)",
      text: "What is the best embedding model for English text search?",
      expected: "eng",
      note: "이전: sco 오분류",
    },
  ];

  const results: Record<string, { avg: number; detected: string }> = {};

  for (const c of cases) {
    const times: number[] = [];
    let detected = "";
    for (let i = 0; i < ITERS; i++) {
      const t0 = performance.now();
      detected = await detectLanguage(c.text);
      times.push(performance.now() - t0);
    }
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const note = c.note ? `  ✓ (${c.note})` : "";
    const match = detected === c.expected ? "" : ` ⚠ expected ${c.expected}`;
    row(`${c.label}`, `avg: ${fmt(avg)}  ×${ITERS}  → ${detected}${match}${note}`);
    results[c.label] = { avg, detected };
  }

  const suiteStart = performance.now();
  report["lang"] = results;
  console.log(`  ${"─".repeat(42)}`);
}

// ══════════════════════════════════════════════════════════════════════════════
// Suite 2: Model Loading
// ══════════════════════════════════════════════════════════════════════════════
async function runModelSuite() {
  console.log("\n[2/6] Model Loading");

  const ttlMs = parseInt(process.env.EMBEDDING_TTL_MS || "600000", 10);
  const ttlLabel = ttlMs >= 60000 ? `${ttlMs / 60000}min (${ttlMs}ms)` : `${ttlMs}ms`;

  // ML cold load
  await disposeEmbeddings();
  let before = memSnap();
  const { ms: mlCold } = await measure(() => generateEmbeddingWithModel("test", ML_MODEL));
  let after = memSnap();
  row("ML cold load", `${fmt(mlCold)}  (${memDiff(before, after)})`);

  // ML warm
  const { ms: mlWarm } = await measure(() => generateEmbeddingWithModel("test", ML_MODEL));
  row("ML warm", fmt(mlWarm));

  // EN cold load (ML already loaded)
  before = memSnap();
  const { ms: enCold } = await measure(() => generateEmbeddingWithModel("test", EN_MODEL));
  after = memSnap();
  row("EN cold load", `${fmt(enCold)}  (${memDiff(before, after)})`);

  // EN warm
  const { ms: enWarm } = await measure(() => generateEmbeddingWithModel("test", EN_MODEL));
  row("EN warm", fmt(enWarm));

  row("TTL config", ttlLabel);

  report["model"] = { mlColdMs: mlCold, mlWarmMs: mlWarm, enColdMs: enCold, enWarmMs: enWarm, ttlMs };
  console.log(`  ${"─".repeat(42)}`);
}

// ══════════════════════════════════════════════════════════════════════════════
// Suite 3: Embedding Generation
// ══════════════════════════════════════════════════════════════════════════════
async function runEmbedSuite(db: ReturnType<typeof getDb>) {
  console.log("\n[3/6] Embedding Generation");

  const samples = sampleMessages(SAMPLES, db);
  if (samples.length === 0) {
    console.log("  ⚠ No indexed messages found — skipping embed suite");
    return;
  }
  const texts = samples.map((s) => s.text_content);

  for (const [modelLabel, modelName] of [["ML", ML_MODEL], ["EN", EN_MODEL]] as const) {
    const times: number[] = [];
    for (const text of texts) {
      const { ms } = await measure(() => generateEmbeddingWithModel(text, modelName));
      times.push(ms);
    }
    const { p50, p95, p99 } = percentiles(times);
    const throughput = (texts.length / (times.reduce((a, b) => a + b, 0) / 1000)).toFixed(1);
    row(
      `${modelLabel} model  (n=${texts.length})`,
      `p50: ${fmt(p50)}  p95: ${fmt(p95)}  p99: ${fmt(p99)}  ${throughput} msg/s`
    );
    report[`embed_${modelLabel.toLowerCase()}`] = { p50, p95, p99, throughput: parseFloat(throughput), n: texts.length };
  }
  console.log(`  ${"─".repeat(42)}`);
}

// ══════════════════════════════════════════════════════════════════════════════
// Suite 4: Indexing Cycle (per-phase breakdown)
// ══════════════════════════════════════════════════════════════════════════════
async function runIndexSuite(db: ReturnType<typeof getDb>) {
  console.log("\n[4/6] Indexing Cycle (per-phase)");

  const samples = sampleMessages(SAMPLES, db);
  if (samples.length === 0) {
    console.log("  ⚠ No indexed messages found — skipping index suite");
    return;
  }

  // Save snapshots for restoration
  interface Snap {
    id: number;
    embedding_model: string | null;
    embedding_indexed_at: number | null;
    ml_indexed_at: number | null;
  }
  const ids = samples.map((s) => s.id);
  const snapshots = db.all(sql.raw(`
    SELECT id, embedding_model, embedding_indexed_at, ml_indexed_at
    FROM messages WHERE id IN (${ids.join(",")})
  `)) as Snap[];

  // Reset for re-indexing
  db.run(sql.raw(`
    UPDATE messages SET embedding_model=NULL, embedding_indexed_at=NULL, ml_indexed_at=NULL
    WHERE id IN (${ids.join(",")})
  `));
  db.run(sql.raw(`DELETE FROM vec_messages WHERE id IN (${ids.join(",").split(",").map((id) => `'${id}'`).join(",")})`));
  db.run(sql.raw(`DELETE FROM vec_messages_ml WHERE id IN (${ids.join(",").split(",").map((id) => `'${id}'`).join(",")})`));

  const langTimes: number[] = [];
  const embedTimes: number[] = [];
  const vecTimes: number[] = [];
  const dbTimes: number[] = [];

  for (const sample of samples) {
    const text = sample.text_content;
    const id = sample.id;

    // Phase 1: language detect + model select
    const t1 = performance.now();
    const model = await selectModelForText(text);
    langTimes.push(performance.now() - t1);

    // Phase 2: embedding
    const t2 = performance.now();
    const emb = await generateMessagePairEmbeddingWithModel(text, "", model);
    embedTimes.push(performance.now() - t2);

    // Phase 3: vec insert
    const vecTable = MODEL_TABLE_REGISTRY[model];
    const embJson = JSON.stringify(Array.from(new Float32Array(emb)));
    const t3 = performance.now();
    db.run(sql.raw(`INSERT OR REPLACE INTO ${vecTable} (id, embedding) VALUES ('${id}', '${embJson}')`));
    vecTimes.push(performance.now() - t3);

    // Phase 4: messages table update
    const t4 = performance.now();
    db.run(sql.raw(`
      UPDATE messages SET
        embedding_model = '${model}',
        embedding_indexed_at = ${Date.now()},
        ml_indexed_at = ${Date.now()}
      WHERE id = ${id}
    `));
    dbTimes.push(performance.now() - t4);
  }

  // Restore original state
  for (const snap of snapshots) {
    const modelVal = snap.embedding_model ? `'${snap.embedding_model}'` : "NULL";
    const eiVal = snap.embedding_indexed_at ?? "NULL";
    const miVal = snap.ml_indexed_at ?? "NULL";
    db.run(sql.raw(`
      UPDATE messages SET
        embedding_model = ${modelVal},
        embedding_indexed_at = ${eiVal},
        ml_indexed_at = ${miVal}
      WHERE id = ${snap.id}
    `));
  }

  const avgLang = langTimes.reduce((a, b) => a + b, 0) / langTimes.length;
  const avgEmbed = embedTimes.reduce((a, b) => a + b, 0) / embedTimes.length;
  const avgVec = vecTimes.reduce((a, b) => a + b, 0) / vecTimes.length;
  const avgDb = dbTimes.reduce((a, b) => a + b, 0) / dbTimes.length;
  const avgTotal = avgLang + avgEmbed + avgVec + avgDb;

  row("Phase 1: lang detect + model select", `avg ${fmt(avgLang)}`);
  row("Phase 2: embedding generation", `avg ${fmt(avgEmbed)}`);
  row("Phase 3: vec table insert", `avg ${fmt(avgVec)}`);
  row("Phase 4: messages table update", `avg ${fmt(avgDb)}`);
  row("Total per message", `avg ${fmt(avgTotal)}`);

  report["index"] = {
    langMs: avgLang,
    embedMs: avgEmbed,
    vecMs: avgVec,
    dbMs: avgDb,
    totalMs: avgTotal,
    n: samples.length,
  };
  console.log(`  ${"─".repeat(42)}`);
}

// ══════════════════════════════════════════════════════════════════════════════
// Suite 5: Search
// ══════════════════════════════════════════════════════════════════════════════
async function runSearchSuite() {
  console.log("\n[5/6] Search");

  // Warmup — load both models
  await generateEmbeddingWithModel("warmup", ML_MODEL);
  await generateEmbeddingWithModel("warmup", EN_MODEL);

  const queries = [
    "임베딩 모델 설정 방법",
    "언어 감지 로직 구현",
    "DB 마이그레이션 전략",
    "How to implement TTL-based model unloading",
    "Vector search performance optimization",
    "Configure embedding model for multilingual support",
    "embeddings TTL 언어 detection language",
    "module settings configuration 설정",
    "search hybrid vector FTS 검색",
  ];

  type SearchMode = "vector" | "text" | "both";
  const modes: SearchMode[] = ["vector", "text", "both"];
  const modeResults: Record<SearchMode, number[]> = { vector: [], text: [], both: [] };

  for (const query of queries) {
    for (const mode of modes) {
      const { ms } = await measure(() =>
        searchMemory({ query, mode, limit: 5 })
      );
      modeResults[mode].push(ms);
    }
  }

  for (const mode of modes) {
    const times = modeResults[mode];
    const { p50, p95, p99 } = percentiles(times);
    row(`mode=${mode}  (${queries.length} queries)`, `p50: ${fmt(p50)}  p95: ${fmt(p95)}  p99: ${fmt(p99)}`);
  }

  // RRF overhead estimate (single-query basis)
  const avgVector = modeResults.vector.reduce((a, b) => a + b, 0) / modeResults.vector.length;
  const avgFts = modeResults.text.reduce((a, b) => a + b, 0) / modeResults.text.length;
  const avgBoth = modeResults.both.reduce((a, b) => a + b, 0) / modeResults.both.length;
  const rrfOverhead = avgBoth - (avgVector + avgFts);
  row("RRF overhead (both - vector - fts)", fmt(Math.abs(rrfOverhead)));

  report["search"] = {
    modes: Object.fromEntries(
      modes.map((m) => [m, percentiles(modeResults[m])])
    ),
    rrfOverheadMs: rrfOverhead,
  };
  console.log(`  ${"─".repeat(42)}`);
}

// ══════════════════════════════════════════════════════════════════════════════
// Suite 6: Memory Profile
// ══════════════════════════════════════════════════════════════════════════════
async function runMemorySuite(db: ReturnType<typeof getDb>) {
  console.log("\n[6/6] Memory Profile");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gcAvailable = typeof (global as any).gc === "function";

  async function gcHint() {
    if (gcAvailable) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (global as any).gc();
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  // 1. Baseline
  await disposeEmbeddings();
  await gcHint();
  const baseline = memSnap();
  row("1. Baseline (after dispose + GC)", `RSS ${baseline.rss.toFixed(0)}MB  heap ${baseline.heapUsed.toFixed(0)}MB`);

  // 2. ML model load
  await generateEmbeddingWithModel("test", ML_MODEL);
  const afterMl = memSnap();
  row("2. ML model loaded", `RSS ${afterMl.rss.toFixed(0)}MB  (${memDiff(baseline, afterMl)})`);

  // 3. EN model additional load
  await generateEmbeddingWithModel("test", EN_MODEL);
  const afterBoth = memSnap();
  row("3. Both models loaded", `RSS ${afterBoth.rss.toFixed(0)}MB  (${memDiff(afterMl, afterBoth)})`);

  // 4. Peak during indexing (5 messages)
  const samples = sampleMessages(5, db);
  let peakRss = afterBoth.rss;
  for (const s of samples) {
    await generateMessagePairEmbeddingWithModel(s.text_content, "", ML_MODEL);
    const snap = memSnap();
    if (snap.rss > peakRss) peakRss = snap.rss;
  }
  row("4. Peak RSS during indexing (5 msgs)", `${peakRss.toFixed(0)}MB`);

  // 5. After disposeEmbeddings
  await disposeEmbeddings();
  const afterDispose = memSnap();
  row("5. After disposeEmbeddings()", `RSS ${afterDispose.rss.toFixed(0)}MB  (${memDiff(afterBoth, afterDispose)})`);

  // 6. After GC hint
  await gcHint();
  const afterGc = memSnap();
  if (gcAvailable) {
    row("6. After GC hint", `RSS ${afterGc.rss.toFixed(0)}MB  (${memDiff(afterDispose, afterGc)})`);
  } else {
    row("6. After GC hint", "N/A (run with --expose-gc)");
  }

  // 7. TTL config
  const ttlMs = parseInt(process.env.EMBEDDING_TTL_MS || "600000", 10);
  const ttlLabel = ttlMs >= 60000 ? `${ttlMs / 60000}min (${ttlMs}ms)` : `${ttlMs}ms`;
  row("7. TTL config", ttlLabel);

  report["memory"] = {
    baselineRss: baseline.rss,
    afterMlRss: afterMl.rss,
    afterBothRss: afterBoth.rss,
    peakRss,
    afterDisposeRss: afterDispose.rss,
    afterGcRss: gcAvailable ? afterGc.rss : null,
    gcAvailable,
    ttlMs,
  };
  console.log(`  ${"─".repeat(42)}`);
}

// ══════════════════════════════════════════════════════════════════════════════
// Main
// ══════════════════════════════════════════════════════════════════════════════
async function main() {
  divider();
  const now = new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  console.log(`  Loomi Benchmark  ${now}`);

  await runMigrations();
  const db = getDb();

  // Start embedding worker (required for searchMemory in suite 5)
  await getEmbeddingWorkerClient().start();

  const msgCount = (db.all(sql`SELECT COUNT(*) as cnt FROM messages`)[0] as { cnt: number }).cnt;
  const sessionCount = (db.all(sql`SELECT COUNT(*) as cnt FROM sessions`)[0] as { cnt: number }).cnt;
  console.log(`  DB: ${msgCount} messages, ${sessionCount} sessions`);
  console.log(`  Samples: ${SAMPLES}  Suites: ${activeSuites.join(", ")}`);
  divider();

  report["db"] = { messages: msgCount, sessions: sessionCount };

  const suiteStart = performance.now();

  if (activeSuites.includes("lang"))   await runLangSuite();
  if (activeSuites.includes("model"))  await runModelSuite();
  if (activeSuites.includes("embed"))  await runEmbedSuite(db);
  if (activeSuites.includes("index"))  await runIndexSuite(db);
  if (activeSuites.includes("search")) await runSearchSuite();
  if (activeSuites.includes("memory")) await runMemorySuite(db);

  const totalMs = performance.now() - suiteStart;
  console.log(`\n  Total elapsed: ${fmt(totalMs)}`);
  divider();

  if (jsonFlag) {
    const outDir = path.resolve(process.cwd(), "data");
    fs.mkdirSync(outDir, { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const outPath = path.join(outDir, `benchmark-${ts}.json`);
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(`  Report saved → ${outPath}`);
  }

  getEmbeddingWorkerClient().dispose();
  await disposeEmbeddings();
  process.exit(0);
}

main().catch((err) => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
