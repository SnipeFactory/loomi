# Adapter Template

## Creating a New Adapter

1. Copy this `_template/` directory to a new directory under `adapters/`
2. Edit `manifest.json` with your adapter's metadata
3. Implement the parsing logic in `index.ts`

## Manifest Fields

| Field | Description |
|-------|-------------|
| `id` | Unique adapter identifier (kebab-case) |
| `name` | Human-readable name |
| `version` | Semantic version |
| `provider` | One of: `anthropic`, `openai`, `google`, `local`, `unknown` |
| `description` | Short description |
| `filePatterns` | Glob patterns for files this adapter handles |
| `capabilities` | Feature flags for UI rendering |

## IAdapter Interface

### Required Methods

- `detectFile(filePath)` — Return `{ detected, confidence, reason? }`. Higher confidence wins.
- `parseLines(lines, filePath)` — Parse lines into `ParseResult` (sessions + messages).

### Optional Methods

- `detectDirectory(dirPath)` — Detect if a directory contains parseable files.
- `parseFile(filePath)` — For non-line-based formats (JSON exports, etc.). Use instead of `parseLines`.

## Tips

- Set `confidence` between 0-1. Built-in adapters use 0.5-0.95.
- Use `provider` field on sessions/messages for multi-provider tools.
- Generate unique UUIDs for `sessionUuid` and `messageUuid`.
- Set `sortOrder` on messages for display ordering.
