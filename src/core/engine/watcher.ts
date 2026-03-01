import { watch, type FSWatcher } from "chokidar";
import { eq, lt } from "drizzle-orm";
import { getDb } from "../db";
import { watchedPaths, sessions } from "../db/schema";
import { syncFile, syncAllWatchedPaths } from "./sync-engine";
import { adapterRegistry } from "../adapters/registry";
import { getHookBus } from "../modules/hook-bus";

let watcher: FSWatcher | null = null;
let sessionEndTimer: ReturnType<typeof setInterval> | null = null;
let pollSyncTimer: ReturnType<typeof setInterval> | null = null;

// Track sessions that had onSessionEnd emitted: sessionId → lastActivityAt at time of emit
// If lastActivityAt changes (session continued), re-emit on next check
const endedSessions = new Map<number, string>();

// Sessions inactive for longer than this are considered ended
const SESSION_INACTIVITY_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const SESSION_CHECK_INTERVAL_MS = 60 * 1000; // check every 60 seconds
// Periodic full-scan fallback: catches files chokidar may miss (e.g. WSL2 inotify gaps)
const POLL_SYNC_INTERVAL_MS = 30 * 1000; // every 30 seconds

export async function startWatcher() {
  const db = getDb();
  const paths = db
    .select()
    .from(watchedPaths)
    .where(eq(watchedPaths.enabled, true))
    .all();

  if (paths.length === 0) {
    console.log("[Loomi] No watched paths configured");
    return;
  }

  // Build globs from adapter file patterns
  const filePatterns = adapterRegistry.getAllFilePatterns();
  // Fallback if no adapters registered yet
  if (filePatterns.length === 0) {
    filePatterns.push("**/*.jsonl");
  }

  const globs: string[] = [];
  for (const p of paths) {
    for (const pattern of filePatterns) {
      globs.push(`${p.path}/${pattern}`);
    }
  }

  console.log("[Loomi] Watching:", globs);

  watcher = watch(globs, {
    persistent: true,
    ignoreInitial: false,
    awaitWriteFinish: {
      stabilityThreshold: 500,
      pollInterval: 100,
    },
    ignored: /(^|[/\\])subagents([/\\]|$)/,
  });

  watcher.on("add", (filePath) => {
    syncFile(filePath).catch((err) =>
      console.error(`[Loomi] Sync error (add) ${filePath}:`, err)
    );
  });

  watcher.on("change", (filePath) => {
    syncFile(filePath).catch((err) =>
      console.error(`[Loomi] Sync error (change) ${filePath}:`, err)
    );
  });

  watcher.on("error", (error) => {
    console.error("[Loomi] Watcher error:", error);
  });

  // Start session-end detector + periodic poll sync
  startSessionEndDetector();
  startPollSync();
}

export async function restartWatcher() {
  if (watcher) {
    await watcher.close();
    watcher = null;
  }
  stopSessionEndDetector();
  stopPollSync();
  await startWatcher();
}

export async function stopWatcher() {
  if (watcher) {
    await watcher.close();
    watcher = null;
  }
  stopSessionEndDetector();
  stopPollSync();
}

export function isWatching(): boolean {
  return watcher !== null;
}

// ── Periodic Poll Sync (fallback for missed inotify events) ──────

function startPollSync() {
  if (pollSyncTimer) return;
  pollSyncTimer = setInterval(() => {
    syncAllWatchedPaths().catch((err) =>
      console.error("[Loomi] Poll sync error:", err)
    );
  }, POLL_SYNC_INTERVAL_MS);
}

function stopPollSync() {
  if (pollSyncTimer) {
    clearInterval(pollSyncTimer);
    pollSyncTimer = null;
  }
}

// ── Session End Detection ─────────────────────────────────────────

function startSessionEndDetector() {
  if (sessionEndTimer) return;
  sessionEndTimer = setInterval(() => {
    checkForEndedSessions().catch((err) =>
      console.error("[Loomi] Session end check error:", err)
    );
  }, SESSION_CHECK_INTERVAL_MS);
}

function stopSessionEndDetector() {
  if (sessionEndTimer) {
    clearInterval(sessionEndTimer);
    sessionEndTimer = null;
  }
}

async function checkForEndedSessions() {
  const db = getDb();
  const cutoff = new Date(Date.now() - SESSION_INACTIVITY_THRESHOLD_MS).toISOString();

  // Find sessions that have been inactive past the threshold
  const stale = db
    .select({
      id: sessions.id,
      sessionUuid: sessions.sessionUuid,
      userMessageCount: sessions.userMessageCount,
      lastActivityAt: sessions.lastActivityAt,
    })
    .from(sessions)
    .where(lt(sessions.lastActivityAt, cutoff))
    .all();

  const hookBus = getHookBus();

  for (const s of stale) {
    // Skip sessions with no real conversation
    if ((s.userMessageCount || 0) < 1) {
      endedSessions.set(s.id, s.lastActivityAt ?? "");
      continue;
    }

    const prevActivityAt = endedSessions.get(s.id);
    // Already processed and lastActivityAt hasn't changed → skip
    if (prevActivityAt !== undefined && prevActivityAt === s.lastActivityAt) continue;

    // New session OR session was continued (lastActivityAt changed) → emit
    endedSessions.set(s.id, s.lastActivityAt ?? "");
    await hookBus.emit("onSessionEnd", {
      sessionId: s.id,
      sessionUuid: s.sessionUuid,
    });
  }
}
