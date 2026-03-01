import fs from "fs";
import path from "path";
import type { IAdapter, AdapterMetadata, FileDetectionResult, DirectoryDetectionResult } from "./types";
import type { ParseResult, ParsedSession, ParsedMessage } from "../parsers/types";
import type { ProviderId } from "./types";

interface CursorLogEntry {
  type?: string;
  sessionId?: string;
  model?: string;
  role?: string;
  content?: string;
  timestamp?: string;
  tokens?: { input?: number; output?: number };
  toolCalls?: { name: string; input: unknown }[];
}

function inferProvider(model: string | null): ProviderId {
  if (!model) return "unknown";
  const lower = model.toLowerCase();
  if (lower.includes("claude") || lower.includes("anthropic")) return "anthropic";
  if (lower.includes("gpt") || lower.includes("o1") || lower.includes("o3")) return "openai";
  if (lower.includes("gemini")) return "google";
  if (lower.includes("llama") || lower.includes("mistral") || lower.includes("codellama")) return "local";
  return "unknown";
}

function generateUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export class CursorAdapter implements IAdapter {
  readonly metadata: AdapterMetadata = {
    id: "cursor",
    name: "Cursor",
    version: "1.0.0",
    provider: "unknown",  // Cursor is multi-provider
    description: "Cursor IDE AI conversation logs",
    filePatterns: ["**/.cursor/logs/*.json", "**/.cursor/logs/**/*.json"],
    capabilities: {
      hasThinking: true,
      hasCacheTokens: false,
      hasToolUse: true,
      hasCodeBlocks: true,
      hasFileChanges: true,
      hasImageContent: false,
    },
  };

  detectFile(filePath: string): FileDetectionResult {
    if (filePath.includes(".cursor/") && filePath.endsWith(".json")) {
      return { detected: true, confidence: 0.8, reason: "JSON in .cursor directory" };
    }
    return { detected: false, confidence: 0 };
  }

  detectDirectory(dirPath: string): DirectoryDetectionResult {
    const cursorDir = path.join(dirPath, ".cursor", "logs");
    if (fs.existsSync(cursorDir)) {
      try {
        const files = fs.readdirSync(cursorDir)
          .filter((f) => f.endsWith(".json"))
          .map((f) => path.join(cursorDir, f));
        return { detected: files.length > 0, confidence: 0.85, files };
      } catch {
        // ignore
      }
    }
    return { detected: false, confidence: 0, files: [] };
  }

  parseLines(lines: string[], filePath: string): ParseResult {
    const sessionsMap = new Map<string, ParsedSession>();
    const allMessages: ParsedMessage[] = [];
    let sortOrder = 0;

    for (const line of lines) {
      let entry: CursorLogEntry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }

      if (!entry.sessionId || !entry.role) continue;

      const sessionUuid = entry.sessionId;
      const timestamp = entry.timestamp || new Date().toISOString();
      const model = entry.model || null;
      const provider = inferProvider(model);

      if (!sessionsMap.has(sessionUuid)) {
        // Derive project path from file location
        const cursorIdx = filePath.indexOf(".cursor/");
        const projectPath = cursorIdx > 0 ? filePath.slice(0, cursorIdx - 1) : null;

        sessionsMap.set(sessionUuid, {
          sessionUuid,
          toolType: "cursor",
          projectPath,
          gitBranch: null,
          cwd: projectPath,
          cliVersion: null,
          startedAt: timestamp,
          lastActivityAt: timestamp,
          primaryModel: model,
          sourceFilePath: filePath,
          title: null,
          provider,
          adapterVersion: this.metadata.version,
        });
      }

      // Update last activity
      const session = sessionsMap.get(sessionUuid)!;
      if (timestamp > session.lastActivityAt) {
        session.lastActivityAt = timestamp;
      }

      const role = entry.role === "user" ? "user" : entry.role === "assistant" ? "assistant" : "system";
      if (role === "system") continue;

      const toolUseJson = entry.toolCalls && entry.toolCalls.length > 0
        ? JSON.stringify(entry.toolCalls)
        : null;

      allMessages.push({
        sessionUuid,
        messageUuid: generateUuid(),
        parentUuid: null,
        role: role as "user" | "assistant",
        rawType: entry.type || role,
        userType: null,
        isSidechain: false,
        apiMessageId: null,
        model,
        textContent: entry.content || null,
        thinkingContent: null,
        toolUseJson,
        stopReason: null,
        inputTokens: entry.tokens?.input || null,
        outputTokens: entry.tokens?.output || null,
        cacheCreationTokens: null,
        cacheReadTokens: null,
        timestamp,
        sortOrder: sortOrder++,
        provider,
      });

      // Set title from first user message
      if (role === "user" && entry.content && !session.title) {
        session.title = entry.content.slice(0, 120);
      }
    }

    return { sessions: sessionsMap, messages: allMessages };
  }
}
