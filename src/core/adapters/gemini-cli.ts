import fs from "fs";
import path from "path";
import type { IAdapter, AdapterMetadata, FileDetectionResult } from "./types";
import type { ParseResult, ParsedSession, ParsedMessage } from "../parsers/types";

interface GeminiMessage {
  id: string;
  timestamp: string;
  type: "user" | "gemini" | "assistant" | "model" | "info" | string;
  content: string | Array<{ text?: string }>;
  thoughts?: Array<{ subject: string; description: string }>;
  tokens?: {
    input: number;
    output: number;
    cached?: number;
    thoughts?: number;
    tool?: number;
    total: number;
  };
  model?: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    args: any;
    result?: any;
  }>;
}

interface GeminiSession {
  sessionId: string;
  projectHash?: string;
  startTime: string;
  lastUpdated: string;
  messages: GeminiMessage[];
}

export class GeminiCliAdapter implements IAdapter {
  readonly metadata: AdapterMetadata = {
    id: "gemini-cli",
    name: "Gemini CLI",
    version: "1.0.0",
    provider: "google",
    description: "Collects Gemini CLI conversation logs (~/.gemini/tmp/*/chats/session-*.json).",
    filePatterns: ["**/chats/session-*.json"],
    defaultPaths: ["~/.gemini/tmp"],
    capabilities: {
      hasThinking: true,
      hasCacheTokens: true,
      hasToolUse: true,
      hasCodeBlocks: true,
      hasFileChanges: false,
      hasImageContent: false,
    },
    status: "stable",
  };

  detectFile(filePath: string): FileDetectionResult {
    const normalized = filePath.replace(/\\/g, "/");
    const basename = path.basename(filePath);

    const isGeminiPath = normalized.includes(".gemini");
    const isSessionFile = basename.startsWith("session-") && basename.endsWith(".json");

    if (isGeminiPath && isSessionFile) {
      return { detected: true, confidence: 0.9, reason: "Gemini CLI session file in .gemini directory" };
    }

    if (isSessionFile && normalized.includes("/chats/")) {
      return { detected: true, confidence: 0.7, reason: "Session file in chats directory" };
    }

    return { detected: false, confidence: 0 };
  }

  parseLines(_lines: string[], _filePath: string): ParseResult {
    // Gemini CLI logs are single JSON files; use parseFile instead
    return { sessions: new Map(), messages: [] };
  }

  async parseFile(filePath: string): Promise<ParseResult> {
    let raw: string;
    try {
      raw = fs.readFileSync(filePath, "utf-8");
    } catch {
      return { sessions: new Map(), messages: [] };
    }

    let data: GeminiSession;
    try {
      data = JSON.parse(raw);
    } catch {
      return { sessions: new Map(), messages: [] };
    }

    if (!data.sessionId || !Array.isArray(data.messages)) {
      return { sessions: new Map(), messages: [] };
    }

    const sessionUuid = data.sessionId;
    const startedAt = data.startTime || new Date().toISOString();
    const lastActivityAt = data.lastUpdated || startedAt;

    const extractText = (content: GeminiMessage["content"]): string | null => {
      if (!content) return null;
      if (typeof content === "string") return content || null;
      if (Array.isArray(content)) return content.map((c) => c.text ?? "").join("") || null;
      return null;
    };

    const firstUserMsg = data.messages.find((m) => m.type === "user");
    const title = firstUserMsg ? (extractText(firstUserMsg.content)?.slice(0, 80) ?? null) : null;

    // Detect primary model from assistant messages
    const firstAssistantWithModel = data.messages.find(m => m.model);
    const primaryModel = firstAssistantWithModel?.model || null;

    const session: ParsedSession = {
      sessionUuid,
      toolType: "gemini-cli",
      projectPath: "~/.gemini",
      gitBranch: null,
      cwd: null,
      cliVersion: null,
      startedAt,
      lastActivityAt,
      primaryModel,
      sourceFilePath: filePath,
      title,
      provider: "google",
      adapterVersion: this.metadata.version,
    };

    const sessionsMap = new Map<string, ParsedSession>();
    sessionsMap.set(sessionUuid, session);

    const parsedMessages: ParsedMessage[] = [];
    let sortOrder = 0;

    for (const msg of data.messages) {
      const type = msg.type;

      // Skip system/info messages
      if (type !== "user" && type !== "gemini" && type !== "assistant" && type !== "model") {
        continue;
      }

      const role: "user" | "assistant" = type === "user" ? "user" : "assistant";

      // Extract thinking content (thoughts)
      let thinkingContent: string | null = null;
      if (msg.thoughts && Array.isArray(msg.thoughts)) {
        thinkingContent = msg.thoughts
          .map(t => `[${t.subject}] ${t.description}`)
          .join("\n\n");
      }

      // Extract tool use
      let toolUseJson: string | null = null;
      if (msg.toolCalls && Array.isArray(msg.toolCalls)) {
        const tools = msg.toolCalls.map(tc => ({
          id: tc.id,
          name: tc.name,
          input: tc.args,
          output: tc.result
        }));
        toolUseJson = JSON.stringify(tools);
      }

      parsedMessages.push({
        sessionUuid,
        messageUuid: msg.id,
        parentUuid: null,
        role,
        rawType: type,
        userType: null,
        isSidechain: false,
        apiMessageId: null,
        model: msg.model || null,
        textContent: extractText(msg.content),
        thinkingContent,
        toolUseJson,
        stopReason: null,
        inputTokens: msg.tokens?.input ?? null,
        outputTokens: (msg.tokens?.output ?? 0) + (msg.tokens?.thoughts ?? 0),
        cacheCreationTokens: null,
        cacheReadTokens: msg.tokens?.cached ?? null,
        timestamp: msg.timestamp || startedAt,
        sortOrder: sortOrder++,
        provider: "google",
      });
    }

    return { sessions: sessionsMap, messages: parsedMessages };
  }
}
