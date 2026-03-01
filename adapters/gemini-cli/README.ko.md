# Gemini CLI Adapter

Gemini CLI 대화 로그를 읽어 Loomi DB에 저장합니다.

`manifest.json`에 `defaultPaths: ["~/.gemini/tmp"]`가 선언되어 있어 Loomi 시작 시 자동으로 경로를 등록합니다. 별도의 Watcher 모듈이 필요 없습니다.

## 파일 형식

위치: `~/.gemini/tmp/<username>/chats/session-<date>-<uuid>.json`

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

- `type: "info"` 시스템 메시지는 수집하지 않음
- `type: "gemini"`는 role `"assistant"`로 매핑
- `content`는 `{ text }` 객체 배열

## 전체 흐름

```
Loomi 시작
  → adapter.defaultPaths → ~/.gemini/tmp 자동 등록
  → chokidar가 ~/.gemini/tmp/** 감시
  → 새 session-*.json 감지
  → gemini-cli 어댑터가 파일 파싱 → DB 저장
```
