import { createServer } from "http";
import next from "next";
import { runMigrations } from "@core/db/migrate";
import { startWatcher, stopWatcher } from "@core/engine/watcher";
import { getModuleRuntime } from "@core/modules/runtime";
import { registerBuiltinAdapters, discoverExternalAdapters, autoRegisterAdapterPaths } from "@core/adapters";
import { closeDb } from "@core/db";

// Register signal handlers immediately — before any async init
// so tsx can kill the process at any startup stage
process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => {
  console.log("[Loomi] SIGINT received, exiting...");
  process.exit(0);
});

const dev = process.env.NODE_ENV !== "production";
const hostname = "localhost";
const port = parseInt(process.env.PORT || "2000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
  // 1. Run database migrations
  await runMigrations();

  // 2. Register adapters (built-in + external)
  registerBuiltinAdapters();
  await discoverExternalAdapters();

  // 3. Initialize module runtime
  const moduleRuntime = getModuleRuntime();
  await moduleRuntime.discover();

  // 3.5. Auto-register adapter default paths
  autoRegisterAdapterPaths();

  // 4. Start file watcher
  await startWatcher();

  const server = createServer(async (req, res) => {
    await handle(req, res);
  });

  server.listen(port, () => {
    console.log(`[Loomi] Running on http://${hostname}:${port}`);
  });
}).catch((err) => {
  console.error("[Loomi] Fatal startup error:", err);
  process.exit(1);
});
