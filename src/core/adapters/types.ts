import type { ParseResult } from "../parsers/types";

export type ProviderId = "anthropic" | "openai" | "google" | "local" | "unknown";

export interface AdapterCapabilities {
  hasThinking: boolean;
  hasCacheTokens: boolean;
  hasToolUse: boolean;
  hasCodeBlocks: boolean;
  hasFileChanges: boolean;
  hasImageContent: boolean;
}

export interface AdapterMetadata {
  id: string;
  name: string;
  version: string;
  provider: ProviderId;
  description: string;
  filePatterns: string[];
  defaultPaths?: string[];
  capabilities: AdapterCapabilities;
}

export interface FileDetectionResult {
  detected: boolean;
  confidence: number;
  reason?: string;
}

export interface DirectoryDetectionResult {
  detected: boolean;
  confidence: number;
  files: string[];
}

export interface IAdapter {
  readonly metadata: AdapterMetadata;
  detectFile(filePath: string): FileDetectionResult;
  detectDirectory?(dirPath: string): DirectoryDetectionResult;
  parseLines(lines: string[], filePath: string): ParseResult;
  parseFile?(filePath: string): Promise<ParseResult>;
}
