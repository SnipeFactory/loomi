# Modules

Server-side extensions for Loomi. Each module lives in its own directory and declares a `manifest.json`.

## Module Tier

### `explorer` — Data Explorer
Reads collected sessions and messages to perform analysis, enrichment, or export.

- Read-only DB access, routed through `DataScrubber` (API keys auto-masked)
- Open to third-party developers
- Fires on hooks: `onSessionEnd`, `onLogCaptured`, `onSearch`

Current explorers:
- `log-summarizer/` — generates AI summaries via OpenRouter
- `episodic-memory/` — auto-tags sessions + builds vector index
- `meta-tracker/` — tracks token/cost metadata

> **Path registration** is no longer done by modules. Each adapter declares `defaultPaths` in its manifest,
> and Loomi auto-registers them on startup. See `adapters/` for how collectors are defined.

## Manifest Fields

```json
{
  "id": "my-module",           // unique, kebab-case
  "name": "My Module",         // display name
  "version": "1.0.0",
  "description": "...",
  "author": "Your Name",
  "loomiVersion": "1.0.0",
  "runtime": "server",
  "serverEntry": "index.ts",   // entry point file
  "hooks": ["onModuleInit"],   // hooks to subscribe to
  "slots": [],                 // UI slots (not currently used by external modules)
  "permissions": ["db:read"],  // required permissions
  "isPremium": false,
  "settingsSchema": [],        // configurable settings (shown in UI)
  "tier": "explorer"
}
```

## Available Hooks

| Hook | When it fires | Payload |
|------|---------------|---------|
| `onModuleInit` | Server startup, after module loads | `HookContext` |
| `onModuleDestroy` | Server shutdown or module disable | — |
| `onLogCaptured` | After new messages are written to DB | `OnLogCapturedPayload` |
| `onSessionEnd` | When a session is detected as complete | `OnSessionEndPayload` |
| `onSearch` | After a search query executes | `OnSearchPayload` |

## Available Permissions

| Permission | What it grants |
|------------|----------------|
| `db:read` | Read sessions, messages, module data |
| `db:write` | Write to module-scoped data tables |
| `network` | Outbound HTTP requests |
| `filesystem:read` | Read local files |
| `process:spawn` | Spawn child processes |

## Entry Point Structure

```typescript
import type { HookContext } from "../../src/core/modules/types";

export async function init(ctx: HookContext): Promise<void> {
  // runs on startup
}

export async function destroy(): Promise<void> {
  // runs on shutdown
}

export const hooks = {
  onLogCaptured: async (payload: unknown) => { /* ... */ },
  onSessionEnd:  async (payload: unknown) => { /* ... */ },
};
```
