# /module-status — Check Module Runtime Status

Verifies if the Loomi dev server is running and retrieves the status of all modules.

## Execution Steps

### 1. Check Development Server

```bash
curl -s http://localhost:2000/api/modules 2>/dev/null || echo "SERVER_NOT_RUNNING"
```

If the server is not running, instruct the user to run `npm run dev` first.

### 2. List All Modules

```bash
curl -s http://localhost:2000/api/modules | node -e "
  const data = JSON.parse(require('fs').readFileSync(0, 'utf8'));
  console.table(data.map(p => ({
    id: p.moduleId,
    name: p.name,
    enabled: p.enabled,
    version: p.version
  })));
"
```

### 3. Individual Module Details (Including Runtime Status)

For each registered module:

```bash
curl -s http://localhost:2000/api/modules/{moduleId}
```

### 4. Verify Active Modules by Slot

Current rendering status for major slots:

```bash
for slot in main-content sidebar-sessions-panel main-bottom-panel session-header; do
  echo "=== $slot ==="
  curl -s "http://localhost:2000/api/modules?slot=$slot"
done
```

## Output Format

Organize findings into a table:

```
| Module ID         | Name             | Status  | Slots                    |
|-------------------|------------------|---------|--------------------------|
| claude-insight    | Claude Insight   | loaded  | main-content, sidebar... |
| claude-terminal   | Claude Terminal  | loaded  | main-bottom-panel        |
| log-summarizer    | Log Summarizer   | loaded  | session-header           |
```

Include the content of the `error` field for any modules with errors.
