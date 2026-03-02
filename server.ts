import { createServer } from "http";
import next from "next";
import { runMigrations } from "@core/db/migrate";
import { startWatcher, stopWatcher } from "@core/engine/watcher";
import { getModuleRuntime } from "@core/modules/runtime";
import { registerBuiltinAdapters, discoverExternalAdapters, autoRegisterAdapterPaths } from "@core/adapters";
import { closeDb } from "@core/db";
import { getEmbeddingWorkerClient } from "@core/embeddings/worker-client";

// ── Graceful shutdown ─────────────────────────────────────────────
let isShuttingDown = false;

function shutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n[Loomi] ${signal} received — shutting down...`);

  // Hard-kill after 3s so tsx watch can always exit cleanly
  const timer = setTimeout(() => {
    console.log("[Loomi] Forced exit after timeout.");
    process.exit(0);
  }, 3000);
  timer.unref();

  try { stopWatcher(); } catch {}
  try { getEmbeddingWorkerClient().dispose(); } catch {}
  try { closeDb(); } catch {}
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));

// ── Memory GC monitor ─────────────────────────────────────────────
// Requires --expose-gc in NODE_OPTIONS (set in package.json dev scripts)
const HEAP_LIMIT_MB  = parseInt(process.env.HEAP_LIMIT_MB  || "6144");
const GC_THRESHOLD   = parseFloat(process.env.GC_THRESHOLD || "0.75"); // trigger at 75%
const GC_INTERVAL_MS = parseInt(process.env.GC_INTERVAL_MS || "30000");

setInterval(() => {
  const gc = (globalThis as { gc?: () => void }).gc;
  if (typeof gc !== "function") return;
  const { heapUsed } = process.memoryUsage();
  const usageRatio = heapUsed / (HEAP_LIMIT_MB * 1024 * 1024);
  if (usageRatio >= GC_THRESHOLD) {
    const mb = Math.round(heapUsed / 1024 / 1024);
    console.log(`[Loomi] GC triggered — heap ${mb}MB / ${HEAP_LIMIT_MB}MB (${Math.round(usageRatio * 100)}%)`);
    gc();
  }
}, GC_INTERVAL_MS).unref();

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = parseInt(process.env.PORT || "2000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  // 1. Run DB migrations (must complete before serving)
  await runMigrations();

  // 2. Start HTTP server immediately — browser can connect while background tasks init
  const server = createServer(async (req, res) => {
    await handle(req, res);
  });

  server.listen(port, () => {
    console.log(`[Loomi] Running on http://${hostname}:${port}`);
  });

  // 3. Background init — non-blocking, failures are logged but don't crash the server
  (async () => {
    try {
      await getEmbeddingWorkerClient().start();
    } catch (err) {
      console.error("[Loomi] Embedding worker failed to start:", err);
    }

    try {
      registerBuiltinAdapters();
      await discoverExternalAdapters();
    } catch (err) {
      console.error("[Loomi] Adapter registration failed:", err);
    }

    try {
      const moduleRuntime = getModuleRuntime();
      await moduleRuntime.discover();
    } catch (err) {
      console.error("[Loomi] Module discovery failed:", err);
    }

    try {
      autoRegisterAdapterPaths();
    } catch (err) {
      console.error("[Loomi] Adapter path registration failed:", err);
    }

    try {
      await startWatcher();
    } catch (err) {
      console.error("[Loomi] Watcher failed to start:", err);
    }
  })();
}).catch((err) => {
  console.error("[Loomi] Fatal startup error:", err);
  process.exit(1);
});
