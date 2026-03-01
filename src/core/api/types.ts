import type { sessions, messages } from "../db/schema";

// ── Query Options ────────────────────────────────────────────────

export interface SessionQueryOptions {
  tool?: string;
  provider?: string;
  projectPath?: string;
  q?: string;
  page?: number;
  limit?: number;
}

export interface SessionListResult {
  sessions: (typeof sessions.$inferSelect)[];
  total: number;
  page: number;
  limit: number;
}

export interface SessionDetailResult {
  session: typeof sessions.$inferSelect;
  messages: (typeof messages.$inferSelect)[];
  totalMessages: number;
  hasMore: boolean;
}

export interface SessionMessagesOptions {
  limit?: number;
  beforeSortOrder?: number;
  afterSortOrder?: number;
}

export interface SearchOptions {
  query: string;
  limit?: number;
}

// ── Aggregation Types (for claude-insight) ──────────────────────

export interface ProjectUsageStats {
  projectPath: string;
  sessionCount: number;
  messageCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  lastActivityAt: string;
}

export interface ToolUsageRecord {
  toolName: string;
  usageCount: number;
  sessionCount: number;
}

export interface DailyUsageStats {
  date: string;
  sessionCount: number;
  messageCount: number;
  totalTokens: number;
  totalCost: number;
}
