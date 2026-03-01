import { eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { sessions, messages, moduleData, moduleSettings } from "../db/schema";
import type { ModuleDbInterface, ModulePermission } from "./types";

export class ModuleDbProxy implements ModuleDbInterface {
  private moduleId: string;
  private permissions: Set<ModulePermission>;

  constructor(moduleId: string, permissions: ModulePermission[]) {
    this.moduleId = moduleId;
    this.permissions = new Set(permissions);
  }

  query(sqlStr: string, params: unknown[] = []): unknown[] {
    if (!this.permissions.has("db:read")) {
      throw new Error("Module lacks db:read permission");
    }

    // Only allow SELECT statements
    const normalized = sqlStr.trim().toUpperCase();
    if (!normalized.startsWith("SELECT")) {
      throw new Error("Only SELECT queries are allowed with db:read");
    }

    const db = getDb();
    return db.all(sql.raw(sqlStr));
  }

  getSession(sessionUuid: string): unknown | undefined {
    this.requireRead();
    const db = getDb();
    return db.select().from(sessions).where(eq(sessions.sessionUuid, sessionUuid)).get();
  }

  getSessions(opts?: { limit?: number; projectPath?: string }): unknown[] {
    this.requireRead();
    const db = getDb();
    const limit = opts?.limit || 50;

    if (opts?.projectPath) {
      return db.select().from(sessions)
        .where(eq(sessions.projectPath, opts.projectPath))
        .limit(limit)
        .all();
    }

    return db.select().from(sessions).limit(limit).all();
  }

  getMessages(sessionId: number): unknown[] {
    this.requireRead();
    const db = getDb();
    return db.select().from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(messages.sortOrder)
      .all();
  }

  searchMessages(query: string, limit: number = 20): unknown[] {
    this.requireRead();
    const db = getDb();
    return db.all(sql`
      SELECT m.*, s.session_uuid, s.title as session_title, s.project_path
      FROM messages_fts fts
      JOIN messages m ON m.id = fts.rowid
      JOIN sessions s ON s.id = m.session_id
      WHERE messages_fts MATCH ${query}
      ORDER BY rank
      LIMIT ${limit}
    `);
  }

  setModuleData(key: string, value: unknown): void {
    if (!this.permissions.has("db:write")) {
      throw new Error("Module lacks db:write permission");
    }

    const db = getDb();
    const jsonValue = JSON.stringify(value);

    const existing = db.select().from(moduleData)
      .where(sql`${moduleData.moduleId} = ${this.moduleId} AND ${moduleData.key} = ${key}`)
      .get();

    if (existing) {
      db.update(moduleData)
        .set({ value: jsonValue })
        .where(sql`${moduleData.moduleId} = ${this.moduleId} AND ${moduleData.key} = ${key}`)
        .run();
    } else {
      db.insert(moduleData)
        .values({ moduleId: this.moduleId, key, value: jsonValue })
        .run();
    }
  }

  getModuleData(key: string): unknown | undefined {
    this.requireRead();
    const db = getDb();
    const row = db.select().from(moduleData)
      .where(sql`${moduleData.moduleId} = ${this.moduleId} AND ${moduleData.key} = ${key}`)
      .get();
    if (!row) return undefined;
    try {
      return JSON.parse(row.value || "null");
    } catch {
      return row.value;
    }
  }

  getSettings(): Record<string, unknown> {
    const db = getDb();
    const rows = db.select().from(moduleSettings)
      .where(eq(moduleSettings.moduleId, this.moduleId))
      .all();
    const result: Record<string, unknown> = {};
    for (const row of rows) {
      try {
        result[row.key] = JSON.parse(row.value || "null");
      } catch {
        result[row.key] = row.value;
      }
    }
    return result;
  }

  private requireRead(): void {
    if (!this.permissions.has("db:read")) {
      throw new Error("Module lacks db:read permission");
    }
  }
}

