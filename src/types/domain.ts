export interface WatchedPath {
  id: number;
  path: string;
  toolType: string;
  moduleId: string | null;
  label: string | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  id: number;
  sessionUuid: string;
  toolType: string;
  projectPath: string | null;
  gitBranch: string | null;
  title: string | null;
  cwd: string | null;
  cliVersion: string | null;
  startedAt: string;
  lastActivityAt: string;
  userMessageCount: number;
  assistantMessageCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheCreationTokens: number;
  totalCacheReadTokens: number;
  estimatedCostUsd: number;
  sourceFilePath: string | null;
  primaryModel: string | null;
  provider: string;
  adapterVersion: string | null;
  metadataJson: string | null;
}

export interface Message {
  id: number;
  sessionId: number;
  messageUuid: string;
  parentUuid: string | null;
  role: string;
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
  estimatedCostUsd: number | null;
  timestamp: string;
  sortOrder: number;
  provider: string | null;
  contentBlocksJson: string | null;
}

export interface Module {
  id: number;
  moduleId: string;
  name: string;
  version: string;
  dirPath: string;
  enabled: boolean;
  isPremium: boolean;
  licenseKey: string | null;
  manifestJson: string;
  tier: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SessionSummary {
  id: number;
  sessionId: number;
  summary: string;
  keywords: string | null;
  generatedBy: string;
  createdAt: string;
}

export interface ClaudeChat {
  id: number;
  chatId: string;
  projectPath: string | null;
  claudeSessionId: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClaudeChatMessage {
  id: number;
  chatId: string;
  role: string;
  content: string;
  tokens: number | null;
  cost: number | null;
  timestamp: string;
}
