import type { IAdapter, AdapterMetadata, FileDetectionResult } from "../types";
import type { ParseResult, ParsedSession, ParsedMessage } from "../../parsers/types";

// ── Claude.ai Export JSON schema ─────────────────────────────────

interface ClaudeAiContentBlock {
  type: "text" | "tool_use" | "tool_result" | "thinking";
  text?: string;
  thinking?: string;
  id?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: unknown;
  is_error?: boolean;
}

interface ClaudeAiMessage {
  uuid: string;
  text: string;
  sender: "human" | "assistant";
  created_at: string;
  content: ClaudeAiContentBlock[];
  attachments: unknown[];
}

interface ClaudeAiConversation {
  uuid: string;
  name: string;
  summary: string;
  created_at: string;
  updated_at: string;
  account: { uuid: string };
  chat_messages: ClaudeAiMessage[];
}

// ── Adapter ──────────────────────────────────────────────────────

export class ClaudeAiExportAdapter implements IAdapter {
  readonly metadata: AdapterMetadata = {
    id: "claude-ai-export",
    name: "Claude.ai Export",
    version: "1.0.0",
    provider: "anthropic",
    description: "Claude.ai data export ZIP (conversations.json) — upload only",
    filePatterns: [], // no file watching; upload API passes path directly
    defaultPaths: [],
    supportsUpload: true,
    capabilities: {
      hasThinking: true,
      hasCacheTokens: false,
      hasToolUse: true,
      hasCodeBlocks: true,
      hasFileChanges: false,
      hasImageContent: false,
    },
  };

  detectFile(_filePath: string): FileDetectionResult {
    // Upload-only adapter; no file-system watching
    return { detected: false, confidence: 0 };
  }

  parseLines(_lines: string[], _filePath: string): ParseResult {
    return { sessions: new Map(), messages: [] };
  }

  /**
   * Parse a conversations.json file extracted from a Claude.ai export ZIP.
   */
  parseConversations(conversations: ClaudeAiConversation[]): ParseResult {
    const sessionsMap = new Map<string, ParsedSession>();
    const allMessages: ParsedMessage[] = [];

    for (const conv of conversations) {
      const sessionUuid = conv.uuid;

      sessionsMap.set(sessionUuid, {
        sessionUuid,
        toolType: "claude-ai-export",
        projectPath: null,
        gitBranch: null,
        cwd: null,
        cliVersion: null,
        startedAt: conv.created_at,
        lastActivityAt: conv.updated_at,
        primaryModel: null,
        sourceFilePath: "claude-ai-export",
        title: conv.name || null,
        provider: "anthropic",
        adapterVersion: this.metadata.version,
      });

      let sortOrder = 0;
      for (const msg of conv.chat_messages) {
        const role: "user" | "assistant" = msg.sender === "human" ? "user" : "assistant";

        // Accumulate text blocks
        const textParts: string[] = [];
        let thinkingContent: string | null = null;
        const toolUseBlocks: ClaudeAiContentBlock[] = [];

        for (const block of msg.content) {
          if (block.type === "text" && block.text) {
            textParts.push(block.text);
          } else if (block.type === "thinking" && block.thinking) {
            thinkingContent = block.thinking;
          } else if (block.type === "tool_use") {
            toolUseBlocks.push(block);
          }
        }

        // Fallback to top-level text field if content blocks yielded nothing
        const textContent = textParts.join("\n") || msg.text || null;

        allMessages.push({
          sessionUuid,
          messageUuid: msg.uuid,
          parentUuid: null,
          role,
          rawType: msg.sender,
          userType: null,
          isSidechain: false,
          apiMessageId: null,
          model: null,
          textContent,
          thinkingContent,
          toolUseJson: toolUseBlocks.length > 0 ? JSON.stringify(toolUseBlocks) : null,
          stopReason: null,
          inputTokens: null,
          outputTokens: null,
          cacheCreationTokens: null,
          cacheReadTokens: null,
          timestamp: msg.created_at,
          sortOrder: sortOrder++,
          provider: "anthropic",
        });
      }
    }

    return { sessions: sessionsMap, messages: allMessages };
  }
}

export const claudeAiExportAdapter = new ClaudeAiExportAdapter();
