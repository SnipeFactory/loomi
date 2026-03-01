// ── Core Data Access API ─────────────────────────────────────────
export * from "./api/sessions";
export * from "./api/messages";
export * from "./api/search";
export * from "./api/watched-paths";
export * from "./api/sync";
export type * from "./api/types";

// ── Core Infrastructure ─────────────────────────────────────────
export { getDb, type AppDatabase } from "./db";
export { runMigrations } from "./db/migrate";
export { startWatcher, restartWatcher, isWatching } from "./engine/watcher";
export { syncFile, syncAllWatchedPaths } from "./engine/sync-engine";
export { readNewLines } from "./engine/incremental";
export { parserRegistry } from "./parsers/registry";
export { calculateCost } from "./utils/cost";
export { formatCost } from "./utils/format-cost";

// ── Schema exports ──────────────────────────────────────────────
export * from "./db/schema";

// ── Parser types ────────────────────────────────────────────────
export type { ParsedSession, ParsedMessage, ParseResult, ILogParser } from "./parsers/types";

// ── Module Infrastructure ───────────────────────────────────────
export { getModuleRuntime, ModuleRuntime } from "./modules/runtime";
export { getHookBus, HookBus } from "./modules/hook-bus";
export { ModuleDbProxy } from "./modules/db-proxy";
export { loadManifest, validateManifest } from "./modules/manifest";
export { createSandbox, runInSandbox } from "./modules/sandbox";
export { hasPermission, permissionDescriptions } from "./modules/permissions";
export type * from "./modules/types";
