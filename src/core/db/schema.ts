import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const watchedPaths = sqliteTable("watched_paths", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  path: text("path").notNull().unique(),
  toolType: text("tool_type").notNull().default("claude-cli"),
  moduleId: text("module_id"),
  label: text("label"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

export const syncState = sqliteTable("sync_state", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  filePath: text("file_path").notNull().unique(),
  lastByteOffset: integer("last_byte_offset").notNull().default(0),
  lastLineCount: integer("last_line_count").notNull().default(0),
  lastFileSize: integer("last_file_size").notNull().default(0),
  lastModifiedAt: text("last_modified_at"),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

export const sessions = sqliteTable(
  "sessions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionUuid: text("session_uuid").notNull().unique(),
    toolType: text("tool_type").notNull().default("claude-cli"),
    projectPath: text("project_path"),
    gitBranch: text("git_branch"),
    title: text("title"),
    cwd: text("cwd"),
    cliVersion: text("cli_version"),
    startedAt: text("started_at").notNull(),
    lastActivityAt: text("last_activity_at").notNull(),
    userMessageCount: integer("user_message_count").notNull().default(0),
    assistantMessageCount: integer("assistant_message_count").notNull().default(0),
    totalInputTokens: integer("total_input_tokens").notNull().default(0),
    totalOutputTokens: integer("total_output_tokens").notNull().default(0),
    totalCacheCreationTokens: integer("total_cache_creation_tokens").notNull().default(0),
    totalCacheReadTokens: integer("total_cache_read_tokens").notNull().default(0),
    estimatedCostUsd: real("estimated_cost_usd").notNull().default(0),
    sourceFilePath: text("source_file_path"),
    primaryModel: text("primary_model"),
    provider: text("provider").notNull().default("anthropic"),
    adapterVersion: text("adapter_version"),
    metadataJson: text("metadata_json"),
    sessionTags: text("session_tags"),  // JSON string[] — auto-tagged concepts
    summaryIndexedAt: integer("summary_indexed_at"), // epoch ms when session summary was indexed
  },
  (table) => [
    index("idx_sessions_project").on(table.projectPath),
    index("idx_sessions_tool").on(table.toolType),
    index("idx_sessions_last_activity").on(table.lastActivityAt),
  ]
);

export const messages = sqliteTable(
  "messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: integer("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    messageUuid: text("message_uuid").notNull(),
    parentUuid: text("parent_uuid"),
    role: text("role").notNull(),
    rawType: text("raw_type").notNull(),
    userType: text("user_type"),
    isSidechain: integer("is_sidechain", { mode: "boolean" }).notNull().default(false),
    apiMessageId: text("api_message_id"),
    model: text("model"),
    textContent: text("text_content"),
    thinkingContent: text("thinking_content"),
    toolUseJson: text("tool_use_json"),
    stopReason: text("stop_reason"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    cacheCreationTokens: integer("cache_creation_tokens"),
    cacheReadTokens: integer("cache_read_tokens"),
    estimatedCostUsd: real("estimated_cost_usd"),
    timestamp: text("timestamp").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    provider: text("provider"),
    contentBlocksJson: text("content_blocks_json"),
    embeddingModel: text("embedding_model"), // exact model name used for indexing (e.g. "Xenova/all-MiniLM-L6-v2")
  },
  (table) => [
    index("idx_messages_session").on(table.sessionId),
    index("idx_messages_uuid").on(table.messageUuid),
    index("idx_messages_parent").on(table.parentUuid),
    index("idx_messages_timestamp").on(table.timestamp),
  ]
);

// ── Model Pricing table ───────────────────────────────────────────

export const modelPricing = sqliteTable(
  "model_pricing",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    provider: text("provider").notNull(),
    modelPattern: text("model_pattern").notNull(),
    inputPerMillion: real("input_per_million").notNull(),
    outputPerMillion: real("output_per_million").notNull(),
    cacheWritePerMillion: real("cache_write_per_million"),
    cacheReadPerMillion: real("cache_read_per_million"),
    effectiveFrom: text("effective_from").notNull().default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_model_pricing_provider").on(table.provider),
  ]
);

// ── Adapters table ────────────────────────────────────────────────

export const adapters = sqliteTable("adapters", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  adapterId: text("adapter_id").notNull().unique(),
  name: text("name").notNull(),
  version: text("version").notNull(),
  provider: text("provider").notNull(),
  filePatterns: text("file_patterns").notNull(),
  isBuiltin: integer("is_builtin", { mode: "boolean" }).notNull().default(true),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

// ── Module tables ─────────────────────────────────────────────────

export const modules = sqliteTable("modules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  moduleId: text("module_id").notNull().unique(),
  name: text("name").notNull(),
  version: text("version").notNull(),
  dirPath: text("dir_path").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  isPremium: integer("is_premium", { mode: "boolean" }).notNull().default(false),
  licenseKey: text("license_key"),
  manifestJson: text("manifest_json").notNull(),
  tier: text("tier"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

export const moduleConsent = sqliteTable(
  "module_consent",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    moduleId: text("module_id").notNull(),
    permission: text("permission").notNull(),
    granted: integer("granted", { mode: "boolean" }).notNull().default(false),
    grantedAt: text("granted_at"),
    createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_module_consent_module").on(table.moduleId),
  ]
);

export const moduleSettings = sqliteTable(
  "module_settings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    moduleId: text("module_id").notNull(),
    key: text("key").notNull(),
    value: text("value"),
  },
  (table) => [
    index("idx_module_settings_module").on(table.moduleId),
  ]
);

export const moduleData = sqliteTable(
  "module_data",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    moduleId: text("module_id").notNull(),
    key: text("key").notNull(),
    value: text("value"),
  },
  (table) => [
    index("idx_module_data_module").on(table.moduleId),
  ]
);

export const sessionSummaries = sqliteTable("session_summaries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: integer("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  summary: text("summary").notNull(),
  keywords: text("keywords"),
  generatedBy: text("generated_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const claudeChats = sqliteTable("claude_chats", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  chatId: text("chat_id").notNull().unique(),
  projectPath: text("project_path"),
  claudeSessionId: text("claude_session_id"),
  status: text("status").notNull().default("idle"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

export const claudeChatMessages = sqliteTable(
  "claude_chat_messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    chatId: text("chat_id")
      .notNull()
      .references(() => claudeChats.chatId, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    tokens: integer("tokens"),
    cost: real("cost"),
    timestamp: text("timestamp").notNull().default(sql`(datetime('now'))`),
  },
  (table) => [
    index("idx_claude_chat_messages_chat").on(table.chatId),
  ]
);
