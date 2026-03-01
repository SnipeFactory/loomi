import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";
import fs from "fs";

const DB_PATH = path.resolve(process.cwd(), "data", "loomi.db");

function createDb() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqliteVec.load(sqlite);

  return drizzle(sqlite, { schema });
}

declare global {
  // eslint-disable-next-line no-var
  var __loomi_db__: ReturnType<typeof createDb> | undefined;
}

export function getDb() {
  if (!globalThis.__loomi_db__) {
    globalThis.__loomi_db__ = createDb();
  }
  return globalThis.__loomi_db__;
}

export type AppDatabase = ReturnType<typeof getDb>;
