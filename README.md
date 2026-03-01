# Loomi: : The Missing Long-Term Memory for Your AI Agents.

**Universal AI History Hub** — collect, store, and search your AI conversation history locally.

Loomi watches `.jsonl` conversation logs from Claude Code and other AI tools in real time, stores them in a local SQLite database, and gives you a searchable, visual dashboard — plus an **MCP server** that lets Claude Code search its own past conversations.

```
┌──────────┬──────────────┬──────────────────────────────────┐
│ Paths    │ Sessions     │  [Chat] [Usage] [Tools]          │
│          │              │                                  │
│ /home/.. │ ● Session 1  │  User: review this code          │
│ /work/.. │   Session 2  │  Assistant: Sure, here's the ... │
│          │   Session 3  │  [code-block] [tool-use]         │
│          │              │                                  │
│          │              ├──────────────────────────────────┤
│          │              │  AI Terminal (collapsible)        │
└──────────┴──────────────┴──────────────────────────────────┘
```

## Features

- **Real-time log collection** — watches your AI tool directories with `chokidar`, syncs incrementally (byte-offset based)
- **Multi-provider support** — built-in adapters for Claude Code, ChatGPT exports, Cursor, Aider; external adapter for Gemini CLI; pluggable adapter system for more
- **Hybrid semantic search** — vector search (local `all-MiniLM-L6-v2` embeddings) + FTS5 keyword search merged via Reciprocal Rank Fusion
- **Auto-tagging** — on session end, automatically extracts tools used, programming languages, frameworks, and error types; injects into embeddings for richer search
- **Episodic memory MCP server** — Claude Code can search your past sessions via `search`, `show`, and `status` tools
- **Usage analytics** — token counts, cost estimates, tool call statistics per project and session
- **Module system** — extend with server-side hooks and HTTP API endpoints via a sandboxed module API
- **100% local** — no cloud, no telemetry, no API keys required for core features

## Core Concepts

Loomi has two distinct extension types:

| Concept | Where | Role | Question it answers |
|---------|-------|------|---------------------|
| **Adapter** | `adapters/`, `src/core/adapters/` | Parses a log format + declares where to look (`defaultPaths`) | *"How do I read this file, and where do I find it?"* |
| **Module** | `modules/` (tier: explorer) | Reads collected data; does analysis, summarization, tagging, indexing | *"What do I do with the data?"* |

**Flow:**
```
Loomi startup
  → adapter.defaultPaths auto-registered as watched paths
  → chokidar monitors watched paths
  → new file detected → Adapter parses → DB (sessions + messages stored)
  → Module hooks fire (onSessionEnd, onLogCaptured)
```

Each AI tool needs **one Adapter** (declares format + default path). Modules are optional and tool-agnostic.

## Quick Start

```bash
npm install
npm run dev        # http://localhost:2000
```

On first run, DB migrations and module discovery run automatically.
The embedding model (~80 MB) downloads to `data/models/` on first search.

## MCP Server (Episodic Memory for Claude Code)

`.mcp.json` is already included in the project root. Running Claude Code from the Loomi directory automatically registers the MCP server:

```json
// .mcp.json (already included)
{
  "mcpServers": {
    "loomi-memory": {
      "command": "npx",
      "args": ["tsx", "src/mcp-server.ts"]
    }
  }
}
```

Claude Code will then have three tools:

| Tool | Description |
|------|-------------|
| `search` | Hybrid vector+keyword search over past conversations. Supports multi-concept AND queries. |
| `show` | Read the full message history of a session by UUID. Supports pagination. |
| `status` | Check how many messages are indexed vs. pending. |

### Best Practices: Selective Memory Research

To make your AI agents smarter without wasting tokens on every turn, follow the **Selective Memory Research Protocol**. This is already configured in this project's `CLAUDE.md` and `GEMINI.md`.

**The Rule:** Only search episodic memory when starting a **Directive** (implementation, architecture design, complex bug fix). Skip search for simple inquiries (reading files, listing directories, running tests).

**Example Workflow:**
1.  **User:** "Implement a new login flow using Supabase."
2.  **Agent (Automatic):** `loomi-memory:search({ query: "Supabase login flow" })`
3.  **Agent:** "I found a past session from Feb 20th where you decided to use PKCE flow for Supabase. I'll proceed with that context."

### Usage with Gemini CLI

To use Loomi's memory globally across all your Gemini CLI sessions, run the following command:

```bash
gemini mcp add loomi-memory "bash" "-c" "cd /home/jch/workspace/loomi && npm run mcp-server" --scope user
```

## Stack

| Area | Technology |
|------|------------|
| Framework | Next.js 16 (Turbopack) |
| Runtime | Custom server (`server.ts`) via `tsx` |
| DB | SQLite (better-sqlite3) + Drizzle ORM + FTS5 + sqlite-vec (384d vectors) |
| Embeddings | `@xenova/transformers` — all-MiniLM-L6-v2 (local, no API) |
| UI | React 19, Tailwind CSS 4, SWR, Lucide |
| Language | TypeScript (strict) |

## Architecture

```
                    ┌─────────────────────────────────┐
                    │          Browser (UI)            │
                    └────────────┬────────────────────┘
                                 │ HTTP (SWR)
                    ┌────────────▼────────────────────┐
                    │     API Routes (thin wrapper)    │
                    │     src/app/api/*                │
                    └────────────┬────────────────────┘
                                 │ direct function calls
  ┌──────────────────────────────▼────────────────────────────────┐
  │                        Core Engine                            │
  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────┐   │
  │  │ DB       │ │ Engine   │ │ Adapters │ │ Module Runtime │   │
  │  │ schema   │ │ watcher  │ │ claude   │ │ hooks, sandbox │   │
  │  │ migrate  │ │ sync     │ │ cursor.. │ │ permissions    │   │
  │  └──────────┘ └──────────┘ └──────────┘ └───────┬────────┘   │
  │  ┌──────────┐ ┌────────────────────────┐        │            │
  │  │ Core API │ │ Embeddings + Memory API│        │            │
  │  │ sessions │ │ all-MiniLM-L6-v2       │        │            │
  │  │ messages │ │ vec_messages (384d)    │        │            │
  │  └──────────┘ └────────────────────────┘        │            │
  └─────────────────────────────────────────────────┼────────────┘
                                         HookBus    │
  ┌─────────────────────────────────────────────────▼────────────┐
  │              Modules (server-side extensions only)           │
  │      log-summarizer   │   episodic-memory   │  meta-tracker  │
  └──────────────────────────────────────────────────────────────┘
                                                    │ stdio/MCP
  ┌─────────────────────────────────────────────────▼────────────┐
  │               MCP Server (src/mcp-server.ts)                 │
  │                  search │ show │ status                       │
  └──────────────────────────────────────────────────────────────┘
```

### Core (`/src/core/`)

Handles data collection and storage only — no analysis logic.

| Module | Path | Role |
|--------|------|------|
| DB | `core/db/` | Schema, migrations, singleton DB (WAL mode) |
| Engine | `core/engine/` | chokidar file watcher, byte-offset incremental sync |
| Adapters | `core/adapters/` | JSONL parser registry (Claude CLI, ChatGPT, Cursor, Aider) |
| Modules | `core/modules/` | Runtime, HookBus, VM sandbox, permission checks |
| API | `core/api/` | Data access functions (synchronous, same process) |
| Embeddings | `core/embeddings/` | Local embedding engine (all-MiniLM-L6-v2, 384d) |
| Memory API | `core/api/memory.ts` | Indexing + hybrid search (vector + FTS5 + RRF) |
| Auto-tagger | `core/api/auto-tagger.ts` | Heuristic concept extraction per session → `session_tags` |

### Features (`/src/features/`)

Core UI features — imported directly by `app-shell.tsx`, not part of the module system.

| Feature | Path | Role |
|---------|------|------|
| Session Explorer | `features/session-explorer/` | Chat viewer, usage charts, tool monitor |
| AI Terminal | `features/ai-terminal/` | Streaming AI terminal |

### Modules (`/modules/`)

Server-side extension units. Hooks + HTTP API only — no UI rendering.

| Module | Role |
|--------|------|
| **log-summarizer** | AI-powered session summaries (OpenRouter) |
| **episodic-memory** | Auto-tags sessions + indexes vectors on `onSessionEnd` |
| **meta-tracker** | Token/cost metadata tracking |

All modules are `explorer` tier — read-only DB access via DataScrubber (auto-masks API keys). Open to third-party developers.

Path registration is handled by **adapters** (`defaultPaths` in manifest), not modules.

## Building a Module

Modules are **server-side only** — hooks and HTTP API endpoints. UI contributions go through PRs.

Minimum structure:

```
modules/my-module/
├── manifest.json
└── index.ts
```

**manifest.json:**
```json
{
  "id": "my-module",
  "name": "My Module",
  "version": "1.0.0",
  "runtime": "server",
  "serverEntry": "index.ts",
  "hooks": ["onModuleInit", "onLogCaptured"],
  "slots": [],
  "permissions": ["db:read"],
  "tier": "explorer"
}
```

**index.ts:**
```typescript
import type { HookContext } from "../../src/core/modules/types";

let ctx: HookContext | null = null;

export async function init(hookCtx: HookContext) {
  ctx = hookCtx;
}

export async function destroy() {
  ctx = null;
}

export const hooks = {
  onLogCaptured: async (payload: unknown) => {
    // runs on every new log entry
  },
};
```

**Available hooks:** `onModuleInit`, `onModuleDestroy`, `onLogCaptured`, `onSessionEnd`, `onSearch`

**Available permissions:** `db:read`, `db:write`, `network`, `filesystem:read`, `process:spawn`

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/sessions` | Session list (filter, pagination) |
| GET | `/api/sessions/[id]` | Session detail + messages (cursor pagination: `?before=`, `?after=`, `?limit=`) |
| POST | `/api/search` | FTS5 full-text search |
| GET | `/api/memory?q=...` | Hybrid semantic search |
| GET | `/api/memory?action=status` | Indexing status |
| POST | `/api/memory` | Trigger indexing |
| GET | `/api/stats/projects` | Per-project usage stats |
| GET | `/api/stats/tools` | Tool call counts |
| GET | `/api/watched-paths` | Watched directories (filter: `?toolType=`) |
| POST | `/api/watched-paths` | Add watched directory |
| PUT | `/api/watched-paths` | Update path for a toolType (upsert) |
| POST | `/api/sync` | Manual sync trigger |
| GET | `/api/modules` | Module list |
| PATCH | `/api/modules/[id]` | Enable / disable module |
| GET/PUT | `/api/modules/[id]/settings` | Module settings |
| GET/POST/DELETE | `/api/modules/[id]/consent` | Module data access consent |
| GET | `/api/adapters` | Registered log adapters |

## Commands

```bash
npm run dev          # dev server (tsx watch, port 2000)
npm run build        # production build (Turbopack)
npm run start        # production server
npm run db:generate  # generate Drizzle migration
npm run db:push      # push schema to DB
```

## Project Structure

```
loomi/
├── .mcp.json                   # Claude Code MCP server registration (loomi-memory)
├── .claude/commands/           # Claude Code custom commands
│   ├── new-module.md           #   /new-module — scaffold a new module
│   ├── add-core-api.md         #   /add-core-api — add Core API + HTTP route
│   ├── add-slot.md             #   /add-slot — register a new UI slot
│   ├── module-status.md        #   /module-status — runtime status check
│   └── sync-now.md             #   /sync-now — manual sync trigger
├── adapters/                   # External log format adapters
│   └── gemini-cli/             #   Gemini CLI session logs (~/.gemini/tmp)
├── modules/                    # Server-side extension modules (explorer tier)
│   ├── episodic-memory/        #   auto-tag + vector index on session end
│   ├── log-summarizer/         #   AI session summaries
│   └── meta-tracker/           #   token/cost tracking
├── packages/loomi-sdk/         # SDK for third-party module developers
├── src/
│   ├── core/                   # Core engine (no UI logic)
│   │   ├── db/                 #   schema, migrations, virtual tables
│   │   ├── engine/             #   file watcher, sync
│   │   ├── adapters/           #   log format adapters
│   │   ├── modules/            #   module runtime
│   │   ├── embeddings/         #   local embedding engine (all-MiniLM-L6-v2)
│   │   └── api/                #   data access functions
│   │       ├── memory.ts       #     episodic indexing + hybrid search
│   │       └── auto-tagger.ts  #     session concept extraction → session_tags
│   ├── features/               # Core UI features (not part of module system)
│   │   ├── session-explorer/   #   chat viewer, usage dashboard, tool monitor
│   │   └── ai-terminal/        #   streaming AI terminal
│   ├── mcp-server.ts           # MCP server entry point (stdio)
│   ├── app/api/                # Next.js API routes (thin wrappers)
│   ├── components/             # Shared React UI components
│   └── types/                  # Domain types
├── server.ts                   # Custom server (migrations → modules → watcher)
├── CLAUDE.md                   # Project instructions for Claude Code
└── docs/                       # Design documents
```

## Notes

- Next.js 16 uses **Turbopack by default** — do not add webpack config to `next.config.ts`.
- `better-sqlite3` must be listed in `serverExternalPackages`.
- DB file: `data/loomi.db` (WAL mode). Gitignored.
- Path aliases in **both** `tsconfig.json` and `next.config.ts`: `@features/*` → `src/features/*`.
- Core API functions are synchronous — better-sqlite3 is a sync driver.
- Embedding model downloads to `data/models/` on first use (~80 MB, one-time).
- `vec_messages` and `messages_fts` are virtual tables created in `migrate.ts` — not in Drizzle schema.
- `messages.embedding_indexed_at` and `sessions.session_tags` are added via `ALTER TABLE` in `migrate.ts`.
- Deleting a message auto-removes its vector from `vec_messages` via `messages_delete_vec` trigger.

## License

Open Source
