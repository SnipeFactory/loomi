#!/usr/bin/env tsx
/**
 * Loomi Episodic Memory MCP Server.
 * Ported from episodic-memory src/mcp-server.ts.
 *
 * Runs as a standalone process with stdio transport.
 * Usage: tsx src/mcp-server.ts
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { searchMemory, getIndexingStatus } from "./core/api/memory";
import { getDb } from "./core/db";
import { sql } from "drizzle-orm";
import { runMigrations } from "./core/db/migrate";

const server = new McpServer({
  name: "loomi-episodic-memory",
  version: "1.0.0",
});

// ── Tool: search ─────────────────────────────────────────────────

server.tool(
  "search",
  "Search past conversations to recover decisions, solutions, and avoid reinventing work. " +
  "Supports semantic (vector), keyword (text), or hybrid (both) search modes. " +
  "Pass an array of 2-5 queries to find conversations matching ALL concepts.",
  {
    query: z.union([
      z.string().describe("Search query"),
      z.array(z.string()).min(2).max(5).describe("Multiple concepts for AND matching"),
    ]),
    mode: z.enum(["vector", "text", "both"]).default("both").describe("Search mode"),
    limit: z.number().min(1).max(50).default(10).describe("Max results"),
    after: z.string().optional().describe("Only results after this date (YYYY-MM-DD)"),
    before: z.string().optional().describe("Only results before this date (YYYY-MM-DD)"),
    response_format: z.enum(["markdown", "json"]).default("markdown").describe("Output format"),
  },
  async (args) => {
    try {
      const results = await searchMemory({
        query: args.query,
        mode: args.mode,
        limit: args.limit,
        after: args.after,
        before: args.before,
      });

      if (results.length === 0) {
        return {
          content: [{ type: "text" as const, text: "No matching conversations found." }],
        };
      }

      if (args.response_format === "json") {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(results, null, 2) }],
        };
      }

      // Markdown format
      const lines: string[] = [];
      lines.push(`## Search Results (${results.length} matches)\n`);

      for (const r of results) {
        lines.push(`### ${r.sessionTitle || "Untitled Session"}`);
        lines.push(`- **Project:** ${r.projectPath || "unknown"}`);
        lines.push(`- **Date:** ${r.timestamp}`);
        lines.push(`- **Session:** ${r.sessionUuid}`);
        lines.push(`- **Score:** ${r.score.toFixed(4)} (${r.source})`);
        if (r.userText) {
          lines.push(`\n**User:** ${r.userText.slice(0, 200)}${r.userText.length > 200 ? "..." : ""}`);
        }
        if (r.assistantText) {
          lines.push(`\n**Assistant:** ${r.assistantText.slice(0, 300)}${r.assistantText.length > 300 ? "..." : ""}`);
        }
        lines.push("\n---\n");
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `Search error: ${err}` }],
        isError: true,
      };
    }
  }
);

// ── Tool: show ───────────────────────────────────────────────────

server.tool(
  "show",
  "Read the full conversation of a session. Essential for understanding the complete rationale, " +
  "evolution, and gotchas behind past decisions. Use startLine/endLine for pagination.",
  {
    sessionUuid: z.string().describe("Session UUID to read"),
    startLine: z.number().optional().describe("Start from this message index (0-based)"),
    endLine: z.number().optional().describe("End at this message index (exclusive)"),
  },
  async (args) => {
    try {
      const db = getDb();

      const msgs = db.all(sql`
        SELECT m.role, m.text_content, m.thinking_content, m.tool_use_json, m.timestamp, m.model
        FROM messages m
        JOIN sessions s ON s.id = m.session_id
        WHERE s.session_uuid = ${args.sessionUuid}
        ORDER BY m.sort_order ASC
      `) as { role: string; text_content: string | null; thinking_content: string | null; tool_use_json: string | null; timestamp: string; model: string | null }[];

      if (msgs.length === 0) {
        return {
          content: [{ type: "text" as const, text: `No messages found for session ${args.sessionUuid}` }],
        };
      }

      const start = args.startLine ?? 0;
      const end = args.endLine ?? msgs.length;
      const slice = msgs.slice(start, end);

      const lines: string[] = [];
      lines.push(`## Session: ${args.sessionUuid}`);
      lines.push(`Messages ${start + 1}-${Math.min(end, msgs.length)} of ${msgs.length}\n`);

      for (const msg of slice) {
        const role = msg.role === "user" ? "**User**" : `**Assistant** (${msg.model || "unknown"})`;
        lines.push(`### ${role} — ${msg.timestamp}`);
        if (msg.text_content) {
          lines.push(msg.text_content);
        }
        if (msg.tool_use_json) {
          try {
            const tools = JSON.parse(msg.tool_use_json) as { name: string }[];
            lines.push(`\n*Tools used: ${tools.map((t) => t.name).join(", ")}*`);
          } catch { /* ignore */ }
        }
        lines.push("\n---\n");
      }

      return {
        content: [{ type: "text" as const, text: lines.join("\n") }],
      };
    } catch (err) {
      return {
        content: [{ type: "text" as const, text: `Show error: ${err}` }],
        isError: true,
      };
    }
  }
);

// ── Tool: status ─────────────────────────────────────────────────

server.tool(
  "status",
  "Get the indexing status of episodic memory.",
  {},
  async () => {
    const status = getIndexingStatus();
    return {
      content: [{
        type: "text" as const,
        text: `Episodic Memory Status:\n- Total user messages: ${status.totalMessages}\n- Indexed: ${status.indexedMessages}\n- Pending: ${status.pendingMessages}`,
      }],
    };
  }
);

// ── Start ────────────────────────────────────────────────────────

async function main() {
  await runMigrations();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[Loomi MCP] Server started on stdio");
}

main().catch((err) => {
  console.error("[Loomi MCP] Fatal error:", err);
  process.exit(1);
});
