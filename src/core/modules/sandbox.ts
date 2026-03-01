import vm from "node:vm";
import type { ModuleManifest, ModuleLogger, ModulePermission } from "./types";

const PROCESS_SPAWN_WHITELIST = ["claude", "git", "node", "npm", "npx"];

interface SandboxOptions {
  manifest: ModuleManifest;
  logger: ModuleLogger;
}

export function createSandbox(options: SandboxOptions): vm.Context {
  const { manifest, logger } = options;
  const permissions = new Set<ModulePermission>(manifest.permissions || []);

  const sandbox: Record<string, unknown> = {
    console: {
      log: logger.info,
      info: logger.info,
      warn: logger.warn,
      error: logger.error,
    },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Promise,
    JSON,
    Date,
    Math,
    Buffer,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    crypto: { randomUUID: () => globalThis.crypto.randomUUID() },
  };

  // Conditionally grant network access
  if (permissions.has("network")) {
    sandbox.fetch = globalThis.fetch;
  }

  // Conditionally grant process:spawn
  if (permissions.has("process:spawn")) {
    sandbox.spawn = createRestrictedSpawn();
  }

  const ctx = vm.createContext(sandbox, {
    codeGeneration: { strings: false, wasm: false },
  });

  return ctx;
}

export function runInSandbox(ctx: vm.Context, code: string, filename: string): unknown {
  const script = new vm.Script(code, { filename });
  return script.runInContext(ctx, { timeout: 5000 });
}

function createRestrictedSpawn() {
  const { spawn } = require("child_process") as typeof import("child_process");

  return function restrictedSpawn(cmd: string, args: string[] = [], opts: Record<string, unknown> = {}) {
    const baseName = cmd.split("/").pop() || cmd;
    if (!PROCESS_SPAWN_WHITELIST.includes(baseName)) {
      throw new Error(`Spawn not allowed for: ${cmd}. Allowed: ${PROCESS_SPAWN_WHITELIST.join(", ")}`);
    }
    return spawn(cmd, args, { ...opts, stdio: ["pipe", "pipe", "pipe"] });
  };
}
