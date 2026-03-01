import { eq, isNull, sql } from "drizzle-orm";
import { getDb } from "../db";
import { watchedPaths } from "../db/schema";
import { restartWatcher } from "../engine/watcher";

/** List all watched paths, optionally filtered by moduleId or toolType */
export function listWatchedPaths(moduleId?: string, toolType?: string) {
  const db = getDb();
  if (moduleId) {
    return db.select().from(watchedPaths).where(eq(watchedPaths.moduleId, moduleId)).all();
  }
  if (toolType) {
    return db.select().from(watchedPaths).where(eq(watchedPaths.toolType, toolType)).all();
  }
  return db.select().from(watchedPaths).all();
}

/** Set (upsert) the single watched path for a toolType */
export function setWatchedPath(toolType: string, pathStr: string, label?: string) {
  const db = getDb();
  const existing = db.select().from(watchedPaths)
    .where(eq(watchedPaths.toolType, toolType))
    .get();
  if (existing) {
    db.update(watchedPaths)
      .set({ path: pathStr, label: label ?? existing.label, updatedAt: new Date().toISOString() })
      .where(eq(watchedPaths.id, existing.id))
      .run();
    return db.select().from(watchedPaths).where(eq(watchedPaths.id, existing.id)).get();
  } else {
    db.insert(watchedPaths).values({ path: pathStr, toolType, label, enabled: true }).run();
    return db.select().from(watchedPaths).where(eq(watchedPaths.path, pathStr)).get();
  }
}

/** Add a watched path owned by a module */
export function addWatchedPath(pathStr: string, opts?: { toolType?: string; label?: string; moduleId?: string }) {
  const db = getDb();
  db.insert(watchedPaths)
    .values({
      path: pathStr,
      toolType: opts?.toolType || "claude-cli",
      label: opts?.label || null,
      moduleId: opts?.moduleId || null,
    })
    .run();
  return db.select().from(watchedPaths).where(eq(watchedPaths.path, pathStr)).get();
}

/** Remove a watched path by id, optionally scoped to a module */
export function removeWatchedPath(id: number, moduleId?: string) {
  const db = getDb();
  if (moduleId) {
    // Only allow deleting paths owned by this module
    db.delete(watchedPaths)
      .where(eq(watchedPaths.id, id))
      .run();
  } else {
    db.delete(watchedPaths).where(eq(watchedPaths.id, id)).run();
  }
}

/** Claim legacy paths (moduleId IS NULL) for a specific module */
export function claimOrphanPaths(moduleId: string) {
  const db = getDb();
  db.update(watchedPaths)
    .set({ moduleId })
    .where(isNull(watchedPaths.moduleId))
    .run();
}

export { restartWatcher };
