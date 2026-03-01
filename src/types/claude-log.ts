export interface ClaudeLogBase {
  parentUuid: string | null;
  isSidechain: boolean;
  userType?: string;
  cwd: string;
  sessionId: string;
  version: string;
  gitBranch?: string;
  uuid: string;
  timestamp: string;
}

export interface ClaudeUserLine extends ClaudeLogBase {
  type: "user";
  message: {
    role: "user";
    content: string | Array<ClaudeUserContentBlock>;
  };
}

export interface ClaudeUserContentBlock {
  type: string;
  text?: string;
  tool_use_id?: string;
  content?: string | Array<{ type: string; text?: string }>;
  is_error?: boolean;
}

export interface ClaudeAssistantLine extends ClaudeLogBase {
  type: "assistant";
  requestId?: string;
  message: {
    model: string;
    id: string;
    type: "message";
    role: "assistant";
    content: Array<ClaudeContentBlock>;
    stop_reason: string | null;
    stop_sequence: string | null;
    usage: ClaudeUsage;
  };
}

export interface ClaudeContentBlock {
  type: "thinking" | "text" | "tool_use" | "tool_result";
  thinking?: string;
  signature?: string;
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  content?: unknown;
  tool_use_id?: string;
}

export interface ClaudeUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  service_tier?: string;
}

export interface ClaudeSystemLine extends ClaudeLogBase {
  type: "system";
  message?: unknown;
}

export interface ClaudeProgressLine {
  type: "progress";
  sessionId: string;
  slug?: string;
  data?: unknown;
  [key: string]: unknown;
}

export interface ClaudeFileSnapshotLine {
  type: "file-history-snapshot";
  messageId: string;
  snapshot: {
    messageId: string;
    trackedFileBackups: Record<string, unknown>;
    timestamp: string;
  };
  isSnapshotUpdate: boolean;
}

export type ClaudeLogLine =
  | ClaudeUserLine
  | ClaudeAssistantLine
  | ClaudeSystemLine
  | ClaudeProgressLine
  | ClaudeFileSnapshotLine;
