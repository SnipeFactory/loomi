import type { ILogParser, ParseResult, ParsedSession, ParsedMessage } from "./types";
import type {
  ClaudeLogLine,
  ClaudeAssistantLine,
  ClaudeUserLine,
  ClaudeContentBlock,
} from "@/types/claude-log";

export class ClaudeCliParser implements ILogParser {
  readonly toolType = "claude-cli";

  canParse(filePath: string): boolean {
    return filePath.endsWith(".jsonl");
  }

  parseLines(lines: string[], filePath: string): ParseResult {
    const sessions = new Map<string, ParsedSession>();
    const parsedMessages: ParsedMessage[] = [];
    const assistantGroups = new Map<string, ClaudeAssistantLine[]>();
    let sortOrder = 0;

    for (const line of lines) {
      let obj: ClaudeLogLine;
      try {
        obj = JSON.parse(line);
      } catch {
        continue;
      }

      if (
        obj.type === "file-history-snapshot" ||
        obj.type === "progress"
      ) {
        continue;
      }

      if (obj.type === "user" || obj.type === "assistant" || obj.type === "system") {
        const logLine = obj as ClaudeUserLine | ClaudeAssistantLine;
        if (logLine.sessionId && !sessions.has(logLine.sessionId)) {
          sessions.set(logLine.sessionId, this.buildSession(logLine, filePath));
        }
        this.updateSessionTimestamp(sessions, logLine);
      }

      if (obj.type === "user") {
        parsedMessages.push(this.buildUserMessage(obj as ClaudeUserLine, sortOrder++));
      } else if (obj.type === "assistant") {
        const assistant = obj as ClaudeAssistantLine;
        const apiId = assistant.message?.id;
        if (apiId) {
          if (!assistantGroups.has(apiId)) {
            assistantGroups.set(apiId, []);
          }
          assistantGroups.get(apiId)!.push(assistant);
        }
      } else if (obj.type === "system") {
        // Skip system messages for now (not shown in chat)
      }
    }

    // Merge assistant message groups
    for (const [apiId, group] of assistantGroups) {
      parsedMessages.push(this.mergeAssistantGroup(apiId, group, sortOrder++));
    }

    // Sort by timestamp
    parsedMessages.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    parsedMessages.forEach((m, i) => (m.sortOrder = i));

    // Set session titles from first user message
    for (const msg of parsedMessages) {
      if (msg.role === "user" && msg.textContent) {
        const session = sessions.get(msg.sessionUuid);
        if (session && !session.title) {
          session.title = msg.textContent.slice(0, 120);
        }
      }
    }

    return { sessions, messages: parsedMessages };
  }

  private buildSession(
    line: ClaudeUserLine | ClaudeAssistantLine,
    filePath: string
  ): ParsedSession {
    // Decode project path from directory structure
    const dirName = filePath.split("/").slice(-2, -1)[0] || "";
    const projectPath = dirName.startsWith("-")
      ? dirName.replace(/^-/, "/").replace(/-/g, "/")
      : null;

    return {
      sessionUuid: line.sessionId,
      toolType: "claude-cli",
      projectPath,
      gitBranch: line.gitBranch || null,
      cwd: line.cwd || null,
      cliVersion: line.version || null,
      startedAt: line.timestamp,
      lastActivityAt: line.timestamp,
      primaryModel:
        line.type === "assistant" ? line.message?.model || null : null,
      sourceFilePath: filePath,
      title: null,
    };
  }

  private updateSessionTimestamp(
    sessions: Map<string, ParsedSession>,
    line: ClaudeUserLine | ClaudeAssistantLine
  ) {
    const session = sessions.get(line.sessionId);
    if (session && line.timestamp > session.lastActivityAt) {
      session.lastActivityAt = line.timestamp;
    }
    if (
      session &&
      !session.primaryModel &&
      line.type === "assistant" &&
      line.message?.model
    ) {
      session.primaryModel = line.message.model;
    }
  }

  private buildUserMessage(line: ClaudeUserLine, sortOrder: number): ParsedMessage {
    let textContent = "";
    let contentBlocksJson: string | undefined;
    const content = line.message?.content;

    if (typeof content === "string") {
      textContent = content;
    } else if (Array.isArray(content)) {
      // Extract text blocks
      const textParts = content
        .filter((b) => b.type === "text" && b.text)
        .map((b) => b.text!);

      // Extract tool_result blocks — preserve tool outputs for search/embeddings
      const toolResultParts: string[] = [];
      for (const block of content) {
        if (block.type === "tool_result" && block.content) {
          const resultText = typeof block.content === "string"
            ? block.content
            : Array.isArray(block.content)
              ? block.content.filter((c) => c.type === "text" && c.text).map((c) => c.text!).join("\n")
              : "";
          if (resultText) {
            // Truncate large tool results (file reads, etc.) to keep DB manageable
            const truncated = resultText.length > 500
              ? resultText.slice(0, 500) + "…[truncated]"
              : resultText;
            const prefix = block.is_error ? "[tool_error]" : "[tool_result]";
            toolResultParts.push(`${prefix} ${truncated}`);
          }
        }
      }

      textContent = [...textParts, ...toolResultParts].join("\n");

      // Store raw content blocks for full fidelity access (embeddings, show)
      contentBlocksJson = JSON.stringify(content);
    }

    return {
      sessionUuid: line.sessionId,
      messageUuid: line.uuid,
      parentUuid: line.parentUuid || null,
      role: "user",
      rawType: "user",
      userType: line.userType || null,
      isSidechain: line.isSidechain || false,
      apiMessageId: null,
      model: null,
      textContent: textContent || null,
      thinkingContent: null,
      toolUseJson: null,
      stopReason: null,
      inputTokens: null,
      outputTokens: null,
      cacheCreationTokens: null,
      cacheReadTokens: null,
      timestamp: line.timestamp,
      sortOrder,
      contentBlocksJson,
    };
  }

  private mergeAssistantGroup(
    apiMessageId: string,
    group: ClaudeAssistantLine[],
    sortOrder: number
  ): ParsedMessage {
    const allBlocks: ClaudeContentBlock[] = [];
    let finalUsage = { input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
    let model: string | null = null;
    let stopReason: string | null = null;
    let sessionUuid = "";
    let uuid = "";
    let parentUuid: string | null = null;
    let isSidechain = false;
    let timestamp = "";

    for (const line of group) {
      sessionUuid = line.sessionId;
      uuid = line.uuid;
      parentUuid = line.parentUuid || parentUuid;
      isSidechain = line.isSidechain || isSidechain;
      model = line.message?.model || model;

      if (line.timestamp > timestamp || !timestamp) {
        timestamp = line.timestamp;
      }

      if (line.message?.content) {
        allBlocks.push(...line.message.content);
      }

      if (line.message?.stop_reason) {
        stopReason = line.message.stop_reason;
      }

      if (line.message?.usage) {
        const u = line.message.usage;
        // Take the maximum values (final line has cumulative usage)
        finalUsage.input_tokens = Math.max(finalUsage.input_tokens, u.input_tokens || 0);
        finalUsage.output_tokens = Math.max(finalUsage.output_tokens, u.output_tokens || 0);
        finalUsage.cache_creation_input_tokens = Math.max(
          finalUsage.cache_creation_input_tokens,
          u.cache_creation_input_tokens || 0
        );
        finalUsage.cache_read_input_tokens = Math.max(
          finalUsage.cache_read_input_tokens,
          u.cache_read_input_tokens || 0
        );
      }
    }

    // Extract content by type
    const textParts = allBlocks
      .filter((b) => b.type === "text" && b.text)
      .map((b) => b.text!);
    const thinkingParts = allBlocks
      .filter((b) => b.type === "thinking" && b.thinking)
      .map((b) => b.thinking!);
    const toolUseParts = allBlocks
      .filter((b) => b.type === "tool_use")
      .map((b) => ({ name: b.name, id: b.id, input: b.input }));

    return {
      sessionUuid,
      messageUuid: uuid,
      parentUuid,
      role: "assistant",
      rawType: "assistant",
      userType: null,
      isSidechain,
      apiMessageId: apiMessageId,
      model,
      textContent: textParts.join("\n") || null,
      thinkingContent: thinkingParts.join("\n---\n") || null,
      toolUseJson: toolUseParts.length > 0 ? JSON.stringify(toolUseParts) : null,
      stopReason,
      inputTokens: finalUsage.input_tokens || null,
      outputTokens: finalUsage.output_tokens || null,
      cacheCreationTokens: finalUsage.cache_creation_input_tokens || null,
      cacheReadTokens: finalUsage.cache_read_input_tokens || null,
      timestamp,
      sortOrder,
      contentBlocksJson: allBlocks.length > 0 ? JSON.stringify(allBlocks) : undefined,
    };
  }
}
