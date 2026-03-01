import fs from "fs";
import path from "path";
import type { IAdapter, AdapterMetadata, FileDetectionResult } from "../../src/core/adapters/types";
import type { ParseResult, ParsedSession, ParsedMessage } from "../../src/core/parsers/types";
import manifest from "./manifest.json";

interface GeminiMessage {
  id: string;
  timestamp: string;
  type: "user" | "gemini" | "assistant" | "model" | "info" | string;
  content: string | Array<{ text?: string }>;
}

interface GeminiSession {
  sessionId: string;
  projectHash?: string;
  startTime: string;
  lastUpdated: string;
  messages: GeminiMessage[];
}

const adapter: IAdapter = {
  metadata: manifest as AdapterMetadata,

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
  },

  parseLines(_lines: string[], _filePath: string): ParseResult {
    // Gemini CLI logs are single JSON files; use parseFile instead
    return { sessions: new Map(), messages: [] };
  },

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

    const session: ParsedSession = {
      sessionUuid,
      toolType: "gemini-cli",
      projectPath: "~/.gemini",
      gitBranch: null,
      cwd: null,
      cliVersion: null,
      startedAt,
      lastActivityAt,
      primaryModel: null,
      sourceFilePath: filePath,
      title,
      provider: "google",
      adapterVersion: manifest.version,
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

      parsedMessages.push({
        sessionUuid,
        messageUuid: msg.id,
        parentUuid: null,
        role,
        rawType: type,
        userType: null,
        isSidechain: false,
        apiMessageId: null,
        model: null,
        textContent: extractText(msg.content),
        thinkingContent: null,
        toolUseJson: null,
        stopReason: null,
        inputTokens: null,
        outputTokens: null,
        cacheCreationTokens: null,
        cacheReadTokens: null,
        timestamp: msg.timestamp || startedAt,
        sortOrder: sortOrder++,
        provider: "google",
      });
    }

    return { sessions: sessionsMap, messages: parsedMessages };
  },
};

export default adapter;
