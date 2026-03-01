# Gemini CLI Adapter

Reads Gemini CLI conversation logs and stores them in the Loomi DB.

`defaultPaths: ["~/.gemini/tmp"]` is declared in `manifest.json` — Loomi auto-registers this path on startup. No separate watcher module needed.

## File Format

Location: `~/.gemini/tmp/<username>/chats/session-<date>-<uuid>.json`

```json
{
  "sessionId": "db75954b-...",
  "startTime": "2026-03-01T07:04:19.954Z",
  "lastUpdated": "2026-03-01T07:04:56.217Z",
  "messages": [
    {
      "id": "uuid",
      "timestamp": "2026-03-01T07:04:19.954Z",
      "type": "user" | "gemini" | "info",
      "content": [{ "text": "..." }]
    }
  ]
}
```

- `type: "info"` system messages are skipped
- `type: "gemini"` is mapped to role `"assistant"`
- `content` is an array of `{ text }` objects

## Flow

```
Loomi startup
  → adapter.defaultPaths → auto-registers ~/.gemini/tmp
  → chokidar watches ~/.gemini/tmp/**
  → new session-*.json detected
  → gemini-cli adapter parses file → DB
```
