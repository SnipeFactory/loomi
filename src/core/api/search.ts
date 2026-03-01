import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { getHookBus } from "../modules/hook-bus";
import type { SearchOptions } from "./types";

export function searchMessages(opts: SearchOptions) {
  const db = getDb();
  return db.all(sql`
    SELECT m.*, s.session_uuid, s.title as session_title, s.project_path
    FROM messages_fts fts
    JOIN messages m ON m.id = fts.rowid
    JOIN sessions s ON s.id = m.session_id
    WHERE messages_fts MATCH ${opts.query}
    ORDER BY rank
    LIMIT ${opts.limit || 20}
  `);
}

export async function searchMessagesWithModules(opts: SearchOptions) {
  const results = searchMessages(opts);
  const hookBus = getHookBus();
  return hookBus.pipeline("onSearch", { query: opts.query, results }, results);
}
