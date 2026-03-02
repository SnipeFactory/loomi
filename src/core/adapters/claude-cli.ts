import type { IAdapter, AdapterMetadata, FileDetectionResult } from "./types";
import type { ParseResult } from "../parsers/types";
import { ClaudeCliParser } from "../parsers/claude-cli";

const parser = new ClaudeCliParser();

export class ClaudeCliAdapter implements IAdapter {
  readonly metadata: AdapterMetadata = {
    id: "claude-cli",
    name: "Claude CLI",
    version: "1.0.0",
    provider: "anthropic",
    description: "Claude Code CLI conversation logs (.jsonl)",
    filePatterns: ["**/*.jsonl"],
    defaultPaths: ["~/.claude/projects"],
    capabilities: {
      hasThinking: true,
      hasCacheTokens: true,
      hasToolUse: true,
      hasCodeBlocks: true,
      hasFileChanges: true,
      hasImageContent: false,
    },
    status: "stable",
  };

  detectFile(filePath: string): FileDetectionResult {
    if (!filePath.endsWith(".jsonl")) {
      return { detected: false, confidence: 0 };
    }

    // Higher confidence for .claude paths
    if (filePath.includes(".claude/") || filePath.includes("/.claude")) {
      return { detected: true, confidence: 0.95, reason: "JSONL in .claude directory" };
    }

    return { detected: true, confidence: 0.5, reason: "JSONL file" };
  }

  parseLines(lines: string[], filePath: string): ParseResult {
    const result = parser.parseLines(lines, filePath);

    // Inject provider into parsed sessions
    for (const [, session] of result.sessions) {
      session.provider = "anthropic";
      session.adapterVersion = this.metadata.version;
    }

    // Inject provider into parsed messages
    for (const msg of result.messages) {
      msg.provider = "anthropic";
    }

    return result;
  }
}
