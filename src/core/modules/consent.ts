/**
 * Consent Manager — tracks user consent for module permissions.
 * Watcher modules from official sources get auto-consent.
 * Explorer (external) modules require explicit user approval.
 */

import { eq, and, sql } from "drizzle-orm";
import { getDb } from "../db";
import { moduleConsent } from "../db/schema";

export interface ConsentRecord {
  moduleId: string;
  permission: string;
  granted: boolean;
  grantedAt: string | null;
}

export function hasConsent(moduleId: string): boolean {
  const db = getDb();
  const rows = db.select().from(moduleConsent)
    .where(eq(moduleConsent.moduleId, moduleId))
    .all();

  if (rows.length === 0) return false;
  return rows.every((r) => r.granted);
}

export function grantConsent(moduleId: string, permissions: string[]): void {
  const db = getDb();
  const now = new Date().toISOString();

  for (const perm of permissions) {
    const existing = db.select().from(moduleConsent)
      .where(and(
        eq(moduleConsent.moduleId, moduleId),
        eq(moduleConsent.permission, perm),
      ))
      .get();

    if (existing) {
      db.update(moduleConsent)
        .set({ granted: true, grantedAt: now })
        .where(and(
          eq(moduleConsent.moduleId, moduleId),
          eq(moduleConsent.permission, perm),
        ))
        .run();
    } else {
      db.insert(moduleConsent)
        .values({ moduleId, permission: perm, granted: true, grantedAt: now })
        .run();
    }
  }
}

export function revokeConsent(moduleId: string): void {
  const db = getDb();
  db.delete(moduleConsent)
    .where(eq(moduleConsent.moduleId, moduleId))
    .run();
}

export function getPendingConsent(): { moduleId: string; permissions: string[] }[] {
  const db = getDb();
  const rows = db.select().from(moduleConsent)
    .where(eq(moduleConsent.granted, false))
    .all();

  const grouped = new Map<string, string[]>();
  for (const row of rows) {
    const perms = grouped.get(row.moduleId) || [];
    perms.push(row.permission);
    grouped.set(row.moduleId, perms);
  }

  return Array.from(grouped.entries()).map(([moduleId, permissions]) => ({
    moduleId,
    permissions,
  }));
}

export function requestConsent(moduleId: string, permissions: string[]): void {
  const db = getDb();

  for (const perm of permissions) {
    const existing = db.select().from(moduleConsent)
      .where(and(
        eq(moduleConsent.moduleId, moduleId),
        eq(moduleConsent.permission, perm),
      ))
      .get();

    if (!existing) {
      db.insert(moduleConsent)
        .values({ moduleId, permission: perm, granted: false, grantedAt: null })
        .run();
    }
  }
}
