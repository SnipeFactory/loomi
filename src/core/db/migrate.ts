import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = path.resolve(process.cwd(), "data", "loomi.db");

export async function runMigrations() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  // Load sqlite-vec extension for vector search
  sqliteVec.load(sqlite);

  const db = drizzle(sqlite);

  migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });

  // Create FTS5 virtual table for full-text search
  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
      text_content,
      thinking_content,
      content='messages',
      content_rowid='id',
      tokenize='unicode61 remove_diacritics 2'
    );
  `);

  // Create triggers to keep FTS in sync
  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS messages_fts_insert AFTER INSERT ON messages BEGIN
      INSERT INTO messages_fts(rowid, text_content, thinking_content)
      VALUES (new.id, new.text_content, new.thinking_content);
    END;
  `);

  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS messages_fts_delete AFTER DELETE ON messages BEGIN
      INSERT INTO messages_fts(messages_fts, rowid, text_content, thinking_content)
      VALUES ('delete', old.id, old.text_content, old.thinking_content);
    END;
  `);

  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS messages_fts_update AFTER UPDATE ON messages BEGIN
      INSERT INTO messages_fts(messages_fts, rowid, text_content, thinking_content)
      VALUES ('delete', old.id, old.text_content, old.thinking_content);
      INSERT INTO messages_fts(rowid, text_content, thinking_content)
      VALUES (new.id, new.text_content, new.thinking_content);
    END;
  `);

  // ── Universal Hub: Schema evolution (idempotent) ───────────────
  const alterColumns = [
    "ALTER TABLE sessions ADD COLUMN provider TEXT NOT NULL DEFAULT 'anthropic'",
    "ALTER TABLE sessions ADD COLUMN adapter_version TEXT",
    "ALTER TABLE sessions ADD COLUMN metadata_json TEXT",
    "ALTER TABLE messages ADD COLUMN provider TEXT",
    "ALTER TABLE messages ADD COLUMN content_blocks_json TEXT",
    "ALTER TABLE watched_paths ADD COLUMN module_id TEXT",
    "ALTER TABLE modules ADD COLUMN tier TEXT",
    "ALTER TABLE sessions ADD COLUMN summary_indexed_at INTEGER",
  ];
  for (const ddl of alterColumns) {
    try { sqlite.exec(ddl); } catch { /* column already exists */ }
  }

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS model_pricing (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      model_pattern TEXT NOT NULL,
      input_per_million REAL NOT NULL,
      output_per_million REAL NOT NULL,
      cache_write_per_million REAL,
      cache_read_per_million REAL,
      effective_from TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_model_pricing_provider ON model_pricing(provider);
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS adapters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      adapter_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      provider TEXT NOT NULL,
      file_patterns TEXT NOT NULL,
      is_builtin INTEGER NOT NULL DEFAULT 1,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Seed default pricing (only if empty)
  seedDefaultPricing(sqlite);

  // ── Module tables ──────────────────────────────────────────────
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS modules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      module_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      dir_path TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      is_premium INTEGER NOT NULL DEFAULT 0,
      license_key TEXT,
      manifest_json TEXT NOT NULL,
      tier TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS module_consent (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      module_id TEXT NOT NULL,
      permission TEXT NOT NULL,
      granted INTEGER NOT NULL DEFAULT 0,
      granted_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_module_consent_module ON module_consent(module_id);
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS module_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      module_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_module_settings_module ON module_settings(module_id);
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS module_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      module_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_module_data_module ON module_data(module_id);
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS session_summaries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      summary TEXT NOT NULL,
      keywords TEXT,
      generated_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // ── Drop unused AI terminal tables (if they exist from older versions) ──
  try { sqlite.exec("DROP TABLE IF EXISTS claude_chat_messages"); } catch {}
  try { sqlite.exec("DROP TABLE IF EXISTS claude_chats"); } catch {}

  // ── Rename plugin → module ──────────────────────────────────
  const pluginToModuleRenames = [
    // Table renames
    "ALTER TABLE plugins RENAME TO modules",
    "ALTER TABLE plugin_consent RENAME TO module_consent",
    "ALTER TABLE plugin_settings RENAME TO module_settings",
    "ALTER TABLE plugin_data RENAME TO module_data",
    // Column renames (SQLite 3.25+)
    "ALTER TABLE modules RENAME COLUMN plugin_id TO module_id",
    "ALTER TABLE module_consent RENAME COLUMN plugin_id TO module_id",
    "ALTER TABLE module_settings RENAME COLUMN plugin_id TO module_id",
    "ALTER TABLE module_data RENAME COLUMN plugin_id TO module_id",
    "ALTER TABLE watched_paths RENAME COLUMN plugin_id TO module_id",
  ];
  for (const ddl of pluginToModuleRenames) {
    try { sqlite.exec(ddl); } catch { /* already renamed or table doesn't exist yet */ }
  }

  // Rebuild indexes with new names (drop old, create new — idempotent)
  try { sqlite.exec("DROP INDEX IF EXISTS idx_plugin_consent_plugin"); } catch {}
  try { sqlite.exec("DROP INDEX IF EXISTS idx_plugin_settings_plugin"); } catch {}
  try { sqlite.exec("DROP INDEX IF EXISTS idx_plugin_data_plugin"); } catch {}
  try { sqlite.exec("CREATE INDEX IF NOT EXISTS idx_module_consent_module ON module_consent(module_id)"); } catch {}
  try { sqlite.exec("CREATE INDEX IF NOT EXISTS idx_module_settings_module ON module_settings(module_id)"); } catch {}
  try { sqlite.exec("CREATE INDEX IF NOT EXISTS idx_module_data_module ON module_data(module_id)"); } catch {}

  // ── Episodic Memory: vector search tables ─────────────────────
  // EN model: all-MiniLM-L6-v2 (384d, English-optimized)
  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS vec_messages USING vec0(
      id TEXT PRIMARY KEY,
      embedding FLOAT[384]
    );
  `);

  // ML model: paraphrase-multilingual-MiniLM-L12-v2 (384d, Korean/English/50+ langs)
  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS vec_messages_ml USING vec0(
      id TEXT PRIMARY KEY,
      embedding FLOAT[384]
    );
  `);

  // Track which messages have been embedded (EN and ML separately)
  try { sqlite.exec("ALTER TABLE messages ADD COLUMN embedding_indexed_at INTEGER"); } catch { /* already exists */ }
  try { sqlite.exec("ALTER TABLE messages ADD COLUMN ml_indexed_at INTEGER"); } catch { /* already exists */ }

  // Track exact model name used for indexing (enables re-index on model change)
  try { sqlite.exec("ALTER TABLE messages ADD COLUMN embedding_model TEXT"); } catch { /* already exists */ }

  // Auto-cleanup both vec tables when source message is deleted
  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS messages_delete_vec AFTER DELETE ON messages BEGIN
      DELETE FROM vec_messages WHERE id = CAST(old.id AS TEXT);
    END;
  `);
  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS messages_delete_vec_ml AFTER DELETE ON messages BEGIN
      DELETE FROM vec_messages_ml WHERE id = CAST(old.id AS TEXT);
    END;
  `);

  // Auto-tagging: store extracted concepts per session
  try { sqlite.exec("ALTER TABLE sessions ADD COLUMN session_tags TEXT"); } catch { /* already exists */ }

  // ── Session-level Memory: vector + FTS for session summaries ──
  // Single ML-model table (paraphrase-multilingual, 384d) — language-agnostic
  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS vec_session_summaries USING vec0(
      id TEXT PRIMARY KEY,
      embedding FLOAT[384]
    );
  `);

  // Standalone FTS5 for session summaries (from log-summarizer)
  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS sessions_fts USING fts5(
      session_uuid UNINDEXED,
      summary,
      keywords,
      session_tags,
      tokenize='unicode61 remove_diacritics 2'
    );
  `);

  // Auto-cleanup vec_session_summaries when session is deleted
  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS sessions_delete_vec_summary AFTER DELETE ON sessions BEGIN
      DELETE FROM vec_session_summaries WHERE id = CAST(old.id AS TEXT);
    END;
  `);

  // ── Remove watcher modules (path registration now handled by adapter defaultPaths) ──
  const watcherIds = [
    "claude-code-collector", "claude-code-watcher",
    "gemini-cli-collector",  "gemini-cli-watcher",
  ];
  for (const id of watcherIds) {
    try {
      sqlite.exec(`DELETE FROM modules WHERE module_id='${id}'`);
      sqlite.exec(`UPDATE watched_paths SET module_id=NULL WHERE module_id='${id}'`);
    } catch { /* table may not exist */ }
  }

  sqlite.close();

  console.log("[Loomi] Database migrations complete");
}

function seedDefaultPricing(sqlite: InstanceType<typeof Database>) {
  const count = sqlite.prepare("SELECT COUNT(*) as cnt FROM model_pricing").get() as { cnt: number };
  if (count.cnt > 0) return;

  const insert = sqlite.prepare(
    "INSERT INTO model_pricing (provider, model_pattern, input_per_million, output_per_million, cache_write_per_million, cache_read_per_million) VALUES (?, ?, ?, ?, ?, ?)"
  );

  const pricing = [
    // Anthropic
    ["anthropic", "claude-opus-4*",             15,   75,   18.75, 1.5],
    ["anthropic", "claude-sonnet-4-6*",         3,    15,   3.75,  0.3],
    ["anthropic", "claude-sonnet-4-5*",         3,    15,   3.75,  0.3],
    ["anthropic", "claude-haiku-4-5*",          0.8,  4,    1.0,   0.08],
    ["anthropic", "claude-3-5-sonnet*",         3,    15,   3.75,  0.3],
    ["anthropic", "claude-3-5-haiku*",          0.8,  4,    1.0,   0.08],
    // OpenAI
    ["openai",    "gpt-4o",                     2.5,  10,   null,  null],
    ["openai",    "gpt-4o-mini",                0.15, 0.6,  null,  null],
    ["openai",    "gpt-4-turbo*",               10,   30,   null,  null],
    ["openai",    "o1*",                        15,   60,   null,  null],
    ["openai",    "o3*",                        10,   40,   null,  null],
    // Google
    ["google",    "gemini-2.0-flash*",          0.1,  0.4,  null,  null],
    ["google",    "gemini-2.0-pro*",            1.25, 10,   null,  null],
    ["google",    "gemini-1.5-pro*",            1.25, 5,    null,  null],
    ["google",    "gemini-1.5-flash*",          0.075,0.3,  null,  null],
  ];

  const tx = sqlite.transaction(() => {
    for (const row of pricing) {
      insert.run(...row);
    }
  });
  tx();
}
