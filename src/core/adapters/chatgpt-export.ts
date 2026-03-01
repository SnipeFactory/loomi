import fs from "fs";
import path from "path";
import type { IAdapter, AdapterMetadata, FileDetectionResult } from "./types";
import type { ParseResult, ParsedSession, ParsedMessage } from "../parsers/types";

interface ChatGPTConversation {
  title: string;
  create_time: number;
  update_time: number;
  mapping: Record<string, ChatGPTNode>;
  id?: string;
}

interface ChatGPTNode {
  id: string;
  parent?: string;
  children: string[];
  message?: {
    id: string;
    author: { role: string; name?: string };
    content: { content_type: string; parts?: (string | Record<string, unknown>)[] };
    create_time?: number;
    metadata?: Record<string, unknown>;
  };
}

function generateUuid(): string {
  // Simple UUID generation without external dependency
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export class ChatGPTExportAdapter implements IAdapter {
  readonly metadata: AdapterMetadata = {
    id: "chatgpt-export",
    name: "ChatGPT Export",
    version: "1.0.0",
    provider: "openai",
    description: "ChatGPT data export (conversations.json)",
    filePatterns: ["**/conversations.json"],
    capabilities: {
      hasThinking: false,
      hasCacheTokens: false,
      hasToolUse: true,
      hasCodeBlocks: true,
      hasFileChanges: false,
      hasImageContent: true,
    },
  };

  detectFile(filePath: string): FileDetectionResult {
    const basename = path.basename(filePath);
    if (basename === "conversations.json") {
      return { detected: true, confidence: 0.85, reason: "ChatGPT export conversations.json" };
    }
    return { detected: false, confidence: 0 };
  }

  parseLines(_lines: string[], _filePath: string): ParseResult {
    // ChatGPT export is not line-based; use parseFile instead
    return { sessions: new Map(), messages: [] };
  }

  async parseFile(filePath: string): Promise<ParseResult> {
    const raw = fs.readFileSync(filePath, "utf-8");
    let conversations: ChatGPTConversation[];
    try {
      conversations = JSON.parse(raw);
    } catch {
      return { sessions: new Map(), messages: [] };
    }

    if (!Array.isArray(conversations)) {
      return { sessions: new Map(), messages: [] };
    }

    const sessionsMap = new Map<string, ParsedSession>();
    const allMessages: ParsedMessage[] = [];

    for (const conv of conversations) {
      const sessionUuid = conv.id || generateUuid();
      const startedAt = conv.create_time
        ? new Date(conv.create_time * 1000).toISOString()
        : new Date().toISOString();
      const lastActivityAt = conv.update_time
        ? new Date(conv.update_time * 1000).toISOString()
        : startedAt;

      sessionsMap.set(sessionUuid, {
        sessionUuid,
        toolType: "chatgpt-export",
        projectPath: null,
        gitBranch: null,
        cwd: null,
        cliVersion: null,
        startedAt,
        lastActivityAt,
        primaryModel: null,
        sourceFilePath: filePath,
        title: conv.title || null,
        provider: "openai",
        adapterVersion: this.metadata.version,
      });

      // Walk the mapping tree to extract messages
      const messages = this.walkTree(conv.mapping, sessionUuid, filePath);
      allMessages.push(...messages);
    }

    return { sessions: sessionsMap, messages: allMessages };
  }

  private walkTree(
    mapping: Record<string, ChatGPTNode>,
    sessionUuid: string,
    _filePath: string
  ): ParsedMessage[] {
    const messages: ParsedMessage[] = [];
    let sortOrder = 0;

    // Find root node (no parent or parent is null)
    const nodes = Object.values(mapping);
    const visited = new Set<string>();

    // BFS from root
    const roots = nodes.filter((n) => !n.parent || !mapping[n.parent]);
    const queue = [...roots];

    while (queue.length > 0) {
      const node = queue.shift()!;
      if (visited.has(node.id)) continue;
      visited.add(node.id);

      if (node.message) {
        const msg = node.message;
        const authorRole = msg.author.role;

        if (authorRole === "user" || authorRole === "assistant") {
          const textParts: string[] = [];
          if (msg.content.parts) {
            for (const part of msg.content.parts) {
              if (typeof part === "string") {
                textParts.push(part);
              }
            }
          }

          const timestamp = msg.create_time
            ? new Date(msg.create_time * 1000).toISOString()
            : new Date().toISOString();

          // Infer model from metadata
          const model = (msg.metadata as Record<string, unknown>)?.model_slug as string | undefined;

          messages.push({
            sessionUuid,
            messageUuid: msg.id || generateUuid(),
            parentUuid: node.parent || null,
            role: authorRole as "user" | "assistant",
            rawType: authorRole,
            userType: null,
            isSidechain: false,
            apiMessageId: null,
            model: model || null,
            textContent: textParts.join("\n") || null,
            thinkingContent: null,
            toolUseJson: null,
            stopReason: null,
            inputTokens: null,
            outputTokens: null,
            cacheCreationTokens: null,
            cacheReadTokens: null,
            timestamp,
            sortOrder: sortOrder++,
            provider: "openai",
          });
        }
      }

      // Add children to queue
      for (const childId of node.children) {
        if (mapping[childId]) {
          queue.push(mapping[childId]);
        }
      }
    }

    return messages;
  }
}
