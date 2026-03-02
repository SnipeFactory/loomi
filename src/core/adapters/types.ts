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
  /** Upload-only adapter: no file watching, accepts ZIP via POST /api/upload/<id> */
  supportsUpload?: boolean;
  /** Adapter status: stable, experimental, or coming-soon (hidden by default) */
  status?: "stable" | "experimental" | "coming-soon";
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
