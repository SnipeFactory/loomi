# /sync-now — 수동 로그 동기화 트리거

감시 중인 경로의 .jsonl 로그 파일을 즉시 동기화합니다.

## 실행 절차

### 1. 개발 서버 확인

```bash
curl -s http://localhost:2000/api/watched-paths 2>/dev/null || echo "SERVER_NOT_RUNNING"
```

서버가 실행 중이 아니면 `npm run dev`를 먼저 실행하라고 안내.

### 2. 현재 감시 경로 확인

```bash
curl -s http://localhost:2000/api/watched-paths
```

감시 경로가 없으면 사용자에게 경로 추가를 안내:
```bash
curl -X POST http://localhost:2000/api/watched-paths \
  -H 'Content-Type: application/json' \
  -d '{"dirPath": "/home/user/.claude/projects"}'
```

### 3. 동기화 실행

```bash
curl -X POST http://localhost:2000/api/sync
```

### 4. 결과 확인

동기화 후 세션 수 확인:

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

## 출력 형식

```
감시 경로: 2개
  - /home/user/.claude/projects (last sync: 2026-02-28T...)
  - /home/user/.config/claude/... (last sync: ...)

동기화 완료
  총 세션: 142개
  최근 세션: "Loomi 리팩토링" (2026-02-28 15:30)
```

인자 `$ARGUMENTS`가 있으면 해당 경로만 동기화, 없으면 전체 동기화.
