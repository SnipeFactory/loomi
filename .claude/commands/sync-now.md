# /sync-now — Trigger Manual Log Sync

Immediately synchronizes .jsonl log files from all watched paths.

## Execution Steps

### 1. Check Development Server

```bash
curl -s http://localhost:2000/api/watched-paths 2>/dev/null || echo "SERVER_NOT_RUNNING"
```

If the server is not running, instruct the user to run `npm run dev` first.

### 2. Verify Watched Paths

```bash
curl -s http://localhost:2000/api/watched-paths
```

If no paths are watched, guide the user to add one:
```bash
curl -X POST http://localhost:2000/api/watched-paths \
  -H 'Content-Type: application/json' \
  -d '{"dirPath": "/home/user/.claude/projects"}'
```

### 3. Execute Sync

```bash
curl -X POST http://localhost:2000/api/sync
```

### 4. Verify Results

Check the session count after sync:

```bash
curl -s http://localhost:2000/api/sessions | node -e "
  const data = JSON.parse(require('fs').readFileSync(0, 'utf8'));
  const sessions = data.sessions || data;
  console.log('Total sessions:', Array.isArray(sessions) ? sessions.length : data.total || 0);
  if (Array.isArray(sessions) && sessions.length > 0) {
    const latest = sessions[0];
    console.log('Latest:', latest.title || latest.sessionUuid, '(' + (latest.lastActivityAt || 'unknown') + ')');
  }
"
```

## Output Format

```
Watched Paths: 2
  - /home/user/.claude/projects (last sync: 2026-02-28T...)
  - /home/user/.config/claude/... (last sync: ...)

Sync Complete
  Total Sessions: 142
  Latest Session: "Loomi Refactoring" (2026-02-28 15:30)
```

If `$ARGUMENTS` is provided, sync only that specific path. Otherwise, sync all.
