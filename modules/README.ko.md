# 모듈 시스템

Loomi의 서버 사이드 확장 단위. 각 모듈은 독립된 디렉토리에 위치하며 `manifest.json`을 선언합니다.

## 모듈 티어

### `explorer` — 데이터 탐색기
수집된 세션과 메시지를 읽어 분석·보강·내보내기를 수행합니다.

- DataScrubber를 통한 DB 읽기 전용 (API 키 자동 마스킹)
- 외부 개발자에게 개방
- 주요 훅: `onSessionEnd`, `onLogCaptured`, `onSearch`

현재 Explorer:
- `log-summarizer/` — OpenRouter를 통한 AI 세션 요약 생성
- `episodic-memory/` — 세션 자동 태깅 + 벡터 인덱스 구축
- `meta-tracker/` — 토큰/비용 메타데이터 추적

> **경로 등록은 더 이상 모듈이 담당하지 않습니다.** 각 어댑터의 manifest에 `defaultPaths`를 선언하면
> Loomi가 시작 시 자동으로 등록합니다. 컬렉터 정의 방법은 `adapters/`를 참고하세요.

## Manifest 필드

```json
{
  "id": "my-module",           // 고유 식별자, kebab-case
  "name": "My Module",         // 표시 이름
  "version": "1.0.0",
  "description": "...",
  "author": "Your Name",
  "loomiVersion": "1.0.0",
  "runtime": "server",
  "serverEntry": "index.ts",   // 진입점 파일
  "hooks": ["onModuleInit"],   // 구독할 훅
  "slots": [],                 // UI 슬롯 (외부 모듈은 현재 미사용)
  "permissions": ["db:read"],  // 필요한 권한
  "isPremium": false,
  "settingsSchema": [],        // UI에 표시될 설정 필드
  "tier": "explorer"
}
```

## 사용 가능한 훅

| 훅 | 실행 시점 | 페이로드 |
|----|-----------|----------|
| `onModuleInit` | 서버 시작, 모듈 로드 후 | `HookContext` |
| `onModuleDestroy` | 서버 종료 또는 모듈 비활성화 | — |
| `onLogCaptured` | 새 메시지가 DB에 기록된 후 | `OnLogCapturedPayload` |
| `onSessionEnd` | 세션 종료가 감지된 후 | `OnSessionEndPayload` |
| `onSearch` | 검색 쿼리 실행 후 | `OnSearchPayload` |

## 사용 가능한 권한

| 권한 | 허용 범위 |
|------|-----------|
| `db:read` | 세션, 메시지, 모듈 데이터 읽기 |
| `db:write` | 모듈 범위 데이터 테이블 쓰기 |
| `network` | 외부 HTTP 요청 |
| `filesystem:read` | 로컬 파일 읽기 |
| `process:spawn` | 자식 프로세스 실행 |

## 진입점 구조

```typescript
import type { HookContext } from "../../src/core/modules/types";

export async function init(ctx: HookContext): Promise<void> {
  // 서버 시작 시 실행
}

export async function destroy(): Promise<void> {
  // 서버 종료 시 실행
}

export const hooks = {
  onLogCaptured: async (payload: unknown) => { /* ... */ },
  onSessionEnd:  async (payload: unknown) => { /* ... */ },
};
```
