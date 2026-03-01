# Loomi - Universal AI History Hub

## Project Overview

A Next.js application that collects, stores, and analyzes conversation logs (.jsonl) from AI tools like Claude Code and Gemini CLI.
Architecture: Core Engine (Collection/Storage) + Features (Core UI) + Module Layer (Server-side Extension) + MCP Server (External LLM Integration).

## Tech Stack

- **Framework**: Next.js 16 (Turbopack by default)
- **Runtime**: Custom Server (`server.ts`) via `tsx`
- **DB**: SQLite (better-sqlite3) + Drizzle ORM, FTS5 Search, sqlite-vec Vector Search
- **Embeddings**: `@xenova/transformers` — all-MiniLM-L6-v2 (384d, local only)
- **UI**: React 19, Tailwind CSS 4, SWR, Lucide icons
- **Language**: TypeScript (strict mode)

## Language Preference

**Crucial: Always communicate with the user in their preferred language (e.g., Korean).** While instructions and internal documentation are in English for global compatibility and model consistency, user interaction should remain in the language they use.

## Selective Memory Research Rule (Mandatory)

Agents must check Loomi's episodic memory before starting any significant task to maintain consistency and recover past decisions.

### Research Protocol
1.  **When to Search:** Only when receiving a **Directive** (implementing features, fixing bugs, architectural changes). Skip for simple inquiries (reading files, listing directories).
2.  **Method:** Use `loomi-memory:search` with relevant keywords.
3.  **Application:** If records are found, inform the user: "Based on past records ([date/session]), I will proceed with [decision X]."
4.  **Deep Dive:** Use `loomi-memory:show` to read full conversation context if search results are insufficient.

## Core Commands

```bash
npm run dev          # tsx watch server.ts (Port 2000)
npm run build        # next build (Turbopack)
npm run start        # NODE_ENV=production tsx server.ts
npm run db:generate  # drizzle-kit generate
npm run db:push      # drizzle-kit push
```

## Architecture

### Core Layer (`/src/core/`)
Data collection, DB, parsers, and module infrastructure. No visualization logic.

| Path | Role |
|------|------|
| `src/core/db/` | Schema, migrations, singleton DB (WAL mode) |
| `src/core/engine/` | chokidar file watcher, byte-offset incremental sync |
| `src/core/adapters/` | Log format adapters (claude-cli, chatgpt, cursor, aider, gemini-cli) |
| `src/core/modules/` | Module runtime, HookBus, VM sandbox, permissions |
| `src/core/api/` | Data access functions (synchronous, same process) |
| `src/core/embeddings/` | Local embedding engine (all-MiniLM-L6-v2, 384d) |
| `src/core/utils/` | Token cost calculation, formatting |

### Features (`/src/features/`)
Core UI features. Imported directly by `app-shell.tsx`.

| Path | Role |
|------|------|
| `src/features/session-explorer/` | Session viewer, usage charts, tool monitor |
| `src/features/ai-terminal/` | Streaming AI terminal |

### Module Layer (`/modules/`)
Server-side extensions only. Background tasks via `onLogCaptured`, `onSessionEnd` hooks.

| Module | Role |
|--------|------|
| `log-summarizer` | AI session summaries via OpenRouter |
| `episodic-memory` | Auto-tagging + vector indexing on session end |
| `meta-tracker` | Token/cost metadata tracking |

All modules are `explorer` tier — Read-only DB access via DataScrubber.

### MCP Server (`src/mcp-server.ts`)
Independent server for external LLMs to search Loomi history.
Registered via `.mcp.json`.

| Tool | Description |
|------|-------------|
| `search` | Hybrid search (vector + FTS5 + RRF). Supports multi-concept AND. |
| `show` | Read full conversation of a specific session (with pagination). |
| `status` | View indexing status. |

## Path Aliases

```
@/*                              → ./src/*
@core/*                          → ./src/core/*
@features/session-explorer/*     → ./src/features/session-explorer/*
@features/ai-terminal/*          → ./src/features/ai-terminal/*
```

## Conventions

- DB logic stays in `src/core/api/`. HTTP routes are thin wrappers.
- UI features stay in `src/features/`, lazy-loaded in `app-shell.tsx`.
- Modules perform server-side logic only. UI contributions via PR.

## Custom Commands (`.claude/commands/`)

| Command | Usage | Example |
|---------|-------|---------|
| `/new-module` | Scaffold a new module | `/new-module my-analyzer` |
| `/add-core-api` | Create Core API + HTTP wrapper | `/add-core-api analytics` |
| `/add-slot` | Register a new ModuleSlotId | `/add-slot toolbar-actions` |
| `/module-status` | Check module runtime status | `/module-status` |
| `/sync-now` | Trigger manual log sync | `/sync-now` |

## Terminology

| Term | Meaning |
|------|---------|
| **Feature** | Core UI functionality in `src/features/`. |
| **Module** | Server-side extension in `/modules/`. Hooks + API. |
| **Plugin** | Claude Code (external tool) extension. Unrelated to Loomi internal. |
