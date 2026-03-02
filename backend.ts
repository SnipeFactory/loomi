import { createServer, IncomingMessage, ServerResponse } from "http";
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
  console.log(`\n[Loomi Backend] ${signal} received — shutting down...`);

  const timer = setTimeout(() => {
    console.log("[Loomi Backend] Forced exit after timeout.");
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
const HEAP_LIMIT_MB  = parseInt(process.env.HEAP_LIMIT_MB  || "6144");
const GC_THRESHOLD   = parseFloat(process.env.GC_THRESHOLD || "0.75");
const GC_INTERVAL_MS = parseInt(process.env.GC_INTERVAL_MS || "30000");

setInterval(() => {
  const gc = (globalThis as { gc?: () => void }).gc;
  if (typeof gc !== "function") return;
  const { heapUsed } = process.memoryUsage();
  const usageRatio = heapUsed / (HEAP_LIMIT_MB * 1024 * 1024);
  if (usageRatio >= GC_THRESHOLD) {
    const mb = Math.round(heapUsed / 1024 / 1024);
    console.log(`[Loomi Backend] GC triggered — heap ${mb}MB / ${HEAP_LIMIT_MB}MB (${Math.round(usageRatio * 100)}%)`);
    gc();
  }
}, GC_INTERVAL_MS).unref();

// ── HTTP helpers ──────────────────────────────────────────────────

function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => { body += chunk.toString(); });
    req.on("end", () => {
      try { resolve(JSON.parse(body || "{}")); }
      catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

function jsonResponse(res: ServerResponse, data: unknown, status = 200): void {
  const json = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(json),
  });
  res.end(json);
}

// ── Mini HTTP server (embedding API only) ─────────────────────────
const BACKEND_PORT = parseInt(process.env.BACKEND_PORT || "2001", 10);

const httpServer = createServer(async (req, res) => {
  const url = new URL(req.url!, `http://localhost`);

  // POST /api/embed — single text embedding
  if (req.method === "POST" && url.pathname === "/api/embed") {
    try {
      const body = await readJson(req) as { text: string; model: string };
      const embedding = await getEmbeddingWorkerClient().embed(body.text, body.model);
      return jsonResponse(res, { embedding });
    } catch (err) {
      return jsonResponse(res, { error: String(err) }, 500);
    }
  }

  // POST /api/embed-pair — user+assistant pair embedding (mirrors IPC embed-pair exactly)
  if (req.method === "POST" && url.pathname === "/api/embed-pair") {
    try {
      const body = await readJson(req) as {
        userText: string;
        assistantText: string;
        model: string;
        toolNames?: string[];
        sessionTagString?: string;
      };
      const embedding = await getEmbeddingWorkerClient().embedPair(
        body.userText,
        body.assistantText,
        body.model,
        body.toolNames,
        body.sessionTagString,
      );
      return jsonResponse(res, { embedding });
    } catch (err) {
      return jsonResponse(res, { error: String(err) }, 500);
    }
  }

  // GET /api/worker-health
  if (req.method === "GET" && url.pathname === "/api/worker-health") {
    return jsonResponse(res, getEmbeddingWorkerClient().getWorkerHealth());
  }

  res.writeHead(404).end();
});

// ── Startup ───────────────────────────────────────────────────────
async function main() {
  await runMigrations();

  httpServer.listen(BACKEND_PORT, () => {
    console.log(`[Loomi Backend] Running on http://localhost:${BACKEND_PORT}`);
  });

  (async () => {
    try {
      await getEmbeddingWorkerClient().start();
    } catch (err) {
      console.error("[Loomi Backend] Embedding worker failed to start:", err);
    }

    try {
      registerBuiltinAdapters();
      await discoverExternalAdapters();
    } catch (err) {
      console.error("[Loomi Backend] Adapter registration failed:", err);
    }

    try {
      const moduleRuntime = getModuleRuntime();
      await moduleRuntime.discover();
    } catch (err) {
      console.error("[Loomi Backend] Module discovery failed:", err);
    }

    try {
      autoRegisterAdapterPaths();
    } catch (err) {
      console.error("[Loomi Backend] Adapter path registration failed:", err);
    }

    try {
      await startWatcher();
    } catch (err) {
      console.error("[Loomi Backend] Watcher failed to start:", err);
    }
  })();
}

main().catch((err) => {
  console.error("[Loomi Backend] Fatal startup error:", err);
  process.exit(1);
});
