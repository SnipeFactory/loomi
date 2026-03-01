export interface ParsedSession {
  sessionUuid: string;
  toolType: string;
  projectPath: string | null;
  gitBranch: string | null;
  cwd: string | null;
  cliVersion: string | null;
  startedAt: string;
  lastActivityAt: string;
  primaryModel: string | null;
  sourceFilePath: string;
  title: string | null;
  provider?: string;
  adapterVersion?: string;
  metadataJson?: string;
}

export interface ParsedMessage {
  sessionUuid: string;
  messageUuid: string;
  parentUuid: string | null;
  role: "user" | "assistant" | "system";
  rawType: string;
  userType: string | null;
  isSidechain: boolean;
  apiMessageId: string | null;
  model: string | null;
  textContent: string | null;
  thinkingContent: string | null;
  toolUseJson: string | null;
  stopReason: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheCreationTokens: number | null;
  cacheReadTokens: number | null;
  timestamp: string;
  sortOrder: number;
  provider?: string;
  contentBlocksJson?: string;
}

export interface ParseResult {
  sessions: Map<string, ParsedSession>;
  messages: ParsedMessage[];
}

export interface ILogParser {
  readonly toolType: string;
  canParse(filePath: string): boolean;
  parseLines(lines: string[], filePath: string): ParseResult;
}
