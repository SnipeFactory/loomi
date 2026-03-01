# /module-status — 모듈 런타임 상태 확인

Loomi 개발 서버가 실행 중인지 확인하고, 모듈 상태를 조회합니다.

## 실행 절차

### 1. 개발 서버 확인

```bash
curl -s http://localhost:2000/api/modules 2>/dev/null || echo "SERVER_NOT_RUNNING"
```

서버가 실행 중이 아니면 사용자에게 `npm run dev`를 먼저 실행하라고 안내.

### 2. 전체 모듈 목록 조회

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

### 3. 개별 모듈 상세 (runtime status 포함)

등록된 각 모듈에 대해:

```bash
curl -s http://localhost:2000/api/modules/{moduleId}
```

### 4. 슬롯별 활성 모듈 확인

주요 슬롯들의 현재 렌더링 상태:

```bash
for slot in main-content sidebar-sessions-panel main-bottom-panel session-header; do
  echo "=== $slot ==="
  curl -s "http://localhost:2000/api/modules?slot=$slot"
done
```

## 출력 형식

결과를 아래와 같은 표로 정리해서 보여줄 것:

```
| Module ID         | Name             | Status  | Slots                    |
|-------------------|------------------|---------|--------------------------|
| claude-insight    | Claude Insight   | loaded  | main-content, sidebar... |
| claude-terminal   | Claude Terminal  | loaded  | main-bottom-panel        |
| log-summarizer    | Log Summarizer   | loaded  | session-header           |
```

에러가 있는 모듈은 error 필드 내용을 함께 표시.
