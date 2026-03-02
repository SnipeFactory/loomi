import fs from "fs";
import path from "path";
import type { IAdapter, AdapterMetadata, FileDetectionResult } from "./types";
import type { ParseResult, ParsedSession, ParsedMessage } from "../parsers/types";
import type { ProviderId } from "./types";

function inferProvider(model: string | null): ProviderId {
  if (!model) return "unknown";
  const lower = model.toLowerCase();
  if (lower.includes("claude") || lower.includes("anthropic")) return "anthropic";
  if (lower.includes("gpt") || lower.includes("o1") || lower.includes("o3")) return "openai";
  if (lower.includes("gemini")) return "google";
  if (lower.includes("llama") || lower.includes("mistral") || lower.includes("deepseek")) return "local";
  return "unknown";
}

function generateUuid(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export class AiderAdapter implements IAdapter {
  readonly metadata: AdapterMetadata = {
    id: "aider",
    name: "Aider",
    version: "1.0.0",
    provider: "unknown",  // Aider is multi-provider
    description: "Aider AI pair programming chat history (.aider.chat.history.md)",
    filePatterns: ["**/.aider.chat.history.md"],
    capabilities: {
      hasThinking: false,
      hasCacheTokens: false,
      hasToolUse: false,
      hasCodeBlocks: true,
      hasFileChanges: true,
      hasImageContent: false,
    },
    status: "coming-soon",
  };

  detectFile(filePath: string): FileDetectionResult {
    const basename = path.basename(filePath);
    if (basename === ".aider.chat.history.md") {
      return { detected: true, confidence: 0.9, reason: "Aider chat history file" };
    }
    return { detected: false, confidence: 0 };
  }

  parseLines(lines: string[], filePath: string): ParseResult {
    const fullText = lines.join("\n");
    return this.parseMarkdown(fullText, filePath);
  }

  async parseFile(filePath: string): Promise<ParseResult> {
    const content = fs.readFileSync(filePath, "utf-8");
    return this.parseMarkdown(content, filePath);
  }

  private parseMarkdown(content: string, filePath: string): ParseResult {
    const sessionsMap = new Map<string, ParsedSession>();
    const allMessages: ParsedMessage[] = [];

    // Derive project path from file location
    const projectPath = path.dirname(filePath);

    // Aider uses #### headers to separate messages
    // Pattern: #### /command or #### <timestamp> user message
    const blocks = content.split(/^####\s+/m).filter(Boolean);

    let currentSessionUuid: string | null = null;
    let sortOrder = 0;
    let currentModel: string | null = null;

    for (const block of blocks) {
      const firstNewline = block.indexOf("\n");
      const header = firstNewline > 0 ? block.slice(0, firstNewline).trim() : block.trim();
      const body = firstNewline > 0 ? block.slice(firstNewline + 1).trim() : "";

      // Detect model from aider's /model command or metadata
      if (header.startsWith("/model ")) {
        currentModel = header.replace("/model ", "").trim();
        continue;
      }

      // Check for timestamp-like patterns or user/assistant markers
      const isUser = !header.startsWith(">") && !header.startsWith("```");
      const role: "user" | "assistant" = isUser ? "user" : "assistant";

      // Create a session per day/file (aider appends to same file)
      if (!currentSessionUuid) {
        currentSessionUuid = generateUuid();
        const now = new Date().toISOString();
        const provider = inferProvider(currentModel);

        sessionsMap.set(currentSessionUuid, {
          sessionUuid: currentSessionUuid,
          toolType: "aider",
          projectPath,
          gitBranch: null,
          cwd: projectPath,
          cliVersion: null,
          startedAt: now,
          lastActivityAt: now,
          primaryModel: currentModel,
          sourceFilePath: filePath,
          title: null,
          provider,
          adapterVersion: this.metadata.version,
        });
      }

      const textContent = body || header;
      const provider = inferProvider(currentModel);

      allMessages.push({
        sessionUuid: currentSessionUuid,
        messageUuid: generateUuid(),
        parentUuid: null,
        role,
        rawType: role,
        userType: null,
        isSidechain: false,
        apiMessageId: null,
        model: currentModel,
        textContent: textContent || null,
        thinkingContent: null,
        toolUseJson: null,
        stopReason: null,
        inputTokens: null,
        outputTokens: null,
        cacheCreationTokens: null,
        cacheReadTokens: null,
        timestamp: new Date().toISOString(),
        sortOrder: sortOrder++,
        provider,
      });

      // Set title from first user message
      if (role === "user" && currentSessionUuid) {
        const session = sessionsMap.get(currentSessionUuid);
        if (session && !session.title) {
          session.title = textContent.slice(0, 120);
        }
      }
    }

    return { sessions: sessionsMap, messages: allMessages };
  }
}
