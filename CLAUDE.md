# Loomi - Universal AI History Hub

## 프로젝트 개요

Claude Code 등 AI 도구의 대화 로그(.jsonl)를 수집·저장·분석하는 Next.js 앱.
Core Engine(데이터 수집/저장) + Features(Core UI) + Module Layer(서버 사이드 확장) + MCP Server(외부 LLM 연동)로 분리된 아키텍처.

## 기술 스택

- **Framework**: Next.js 16 (Turbopack 기본, webpack 아님)
- **Runtime**: Custom Server (`server.ts`) via `tsx`
- **DB**: SQLite (better-sqlite3) + Drizzle ORM, FTS5 전문검색, sqlite-vec 벡터검색
- **Embeddings**: `@xenova/transformers` — all-MiniLM-L6-v2 (384d, 로컬 전용)
- **UI**: React 19, Tailwind CSS 4, SWR, Lucide icons
- **언어**: TypeScript (strict mode)

## 핵심 명령어

```bash
npm run dev          # tsx watch server.ts (포트 2000)
npm run build        # next build (Turbopack)
npm run start        # NODE_ENV=production tsx server.ts
npm run db:generate  # drizzle-kit generate
npm run db:push      # drizzle-kit push
```

## 아키텍처

### Core Layer (`/src/core/`)
데이터 수집, DB, 파서, 모듈 인프라. 분석/시각화 로직 없음.

| 경로 | 역할 |
|------|------|
| `src/core/db/` | 스키마, 마이그레이션, 싱글톤 DB (WAL 모드) |
| `src/core/engine/` | chokidar 파일 워처, 바이트 오프셋 기반 증분 동기화 |
| `src/core/adapters/` | 로그 포맷 어댑터 레지스트리 (claude-cli, chatgpt, cursor, aider; 외부: gemini-cli) |
| `src/core/modules/` | 모듈 런타임, HookBus, VM 샌드박스, 퍼미션 체크 |
| `src/core/api/` | 데이터 접근 함수 (동기, 같은 프로세스, HTTP 없음) |
| `src/core/embeddings/` | 로컬 임베딩 엔진 (all-MiniLM-L6-v2, 384d) |
| `src/core/utils/` | 토큰 비용 계산, 포맷 유틸 |

### Features (`/src/features/`)
Core UI 기능. 모듈 시스템을 거치지 않고 `app-shell.tsx`에 직접 import됨.

| 경로 | 역할 |
|------|------|
| `src/features/session-explorer/` | 세션 뷰어, 사용량 차트, 도구 모니터 (구 claude-insight) |
| `src/features/ai-terminal/` | AI 터미널 스트리밍 채팅 (구 claude-terminal) |

### Module Layer (`/modules/`)
서버 사이드 확장 전용. `onLogCaptured`, `onSessionEnd` 등 훅으로 백그라운드 작업 수행.
UI 렌더링 불가 — UI 기여는 PR로만 가능.

| 모듈 | 역할 |
|------|------|
| `log-summarizer` | 세션 종료 시 AI 요약 생성 (OpenRouter) |
| `episodic-memory` | 세션 종료 시 자동 태깅 + 벡터 인덱싱 |
| `meta-tracker` | 토큰/비용 메타 추적 |

모든 모듈은 `explorer` 티어 — DB Read-only (DataScrubber 통과). 외부 개발자에게 개방.
경로 등록은 어댑터 `defaultPaths`가 담당 (별도 모듈 불필요).

### MCP Server (`src/mcp-server.ts`)
외부 LLM(Claude Code 등)이 Loomi 기억을 검색할 수 있는 독립 실행 서버.
`.mcp.json` (프로젝트 루트)으로 Claude Code에 자동 등록됨.

| 도구 | 설명 |
|------|------|
| `search` | 하이브리드 검색 (vector + FTS5 + RRF). 복수 개념 AND 검색 지원 |
| `show` | 특정 세션의 전체 대화 읽기 (페이지네이션 지원) |
| `status` | 인덱싱 현황 조회 |

### API Routes (`/src/app/api/`)
Core API 함수의 thin HTTP wrapper. 브라우저 클라이언트용.

### UI Components (`/src/components/`)
- `layout/` - app-shell (직접 import), sidebar-paths
- `modules/` - module-card, module-settings-dialog 등 모듈 관리 UI
- `ui/` - 공통 UI 컴포넌트

## Path Aliases

```
@/*                              → ./src/*
@core/*                          → ./src/core/*
@features/session-explorer/*     → ./src/features/session-explorer/*
@features/ai-terminal/*          → ./src/features/ai-terminal/*
```

`tsconfig.json` paths + `next.config.ts` turbopack.resolveAlias **두 곳 모두** 설정 필요.

## 주요 파일

| 파일 | 역할 |
|------|------|
| `server.ts` | 커스텀 서버 진입점 (마이그레이션 → 모듈 디스커버 → 워처 시작) |
| `src/mcp-server.ts` | MCP 서버 진입점 (stdio, `.mcp.json`으로 Claude Code에 등록) |
| `src/core/db/schema.ts` | 모든 테이블 정의 (Drizzle) |
| `src/core/db/migrate.ts` | 마이그레이션 + 가상 테이블 생성 (vec_messages, messages_fts, 트리거) |
| `src/core/modules/types.ts` | ModuleSlotId, ModuleManifest, HookEventName 등 타입 |
| `src/core/modules/runtime.ts` | 모듈 생명주기 관리 (싱글톤) |
| `src/core/api/memory.ts` | 에피소딕 메모리 인덱싱 + 하이브리드 검색 |
| `src/core/api/auto-tagger.ts` | 세션 개념 추출 (도구/언어/프레임워크/에러) → session_tags 저장 |
| `src/core/embeddings/index.ts` | 로컬 임베딩 생성 (all-MiniLM-L6-v2) |
| `src/components/layout/app-shell.tsx` | React.lazy 직접 import로 Features 렌더링 |
| `drizzle.config.ts` | schema 경로: `./src/core/db/schema.ts` |

## DB 스키마 주요 사항

- `sessions.session_tags` — auto-tagger가 추출한 개념 태그 (JSON 배열 문자열)
- `messages.embedding_indexed_at` — 벡터 인덱싱 완료 시각 (ALTER TABLE로 추가됨, Drizzle 스키마 외)
- `vec_messages` — sqlite-vec 가상 테이블 (id TEXT, embedding FLOAT[384]). Drizzle 스키마에 없고 migrate.ts에서 직접 생성
- `messages_fts` — FTS5 가상 테이블. migrate.ts에서 직접 생성 + trigger로 자동 동기화
- messages 삭제 시 vec_messages 자동 정리 (messages_delete_vec 트리거)

## 에피소딕 메모리 흐름

```
세션 종료 (onSessionEnd)
  → tagSession()          # auto-tagger: 개념 추출 → session_tags 저장
  → indexSession()        # 미인덱스 메시지 페어 순회
      → getSessionConcepts()   # 저장된 태그 조회
      → indexMessagePair()     # 임베딩 생성 (user + assistant + tools + session tags)
          → vec_messages 저장
```

## 컨벤션

- DB 쿼리 로직은 `src/core/api/`에, HTTP route는 thin wrapper로 유지
- Core Feature UI는 `src/features/`에, `app-shell.tsx`에서 React.lazy로 직접 import
- 모듈은 서버 사이드 로직만 — UI 기여는 PR로
- re-export stub(`src/lib/`)이 일부 잔존 — 호환성용, 점진적 제거 예정
- `packages/loomi-sdk/` - 외부 모듈용 SDK

## 커스텀 커맨드 (`.claude/commands/`)

| 커맨드 | 용도 | 예시 |
|--------|------|------|
| `/new-module` | 모듈 스캐폴딩 | `/new-module my-analyzer` |
| `/add-core-api` | Core API 함수 + HTTP wrapper 생성 | `/add-core-api analytics` |
| `/add-slot` | ModuleSlotId 등록 (types.ts + manifest.ts) | `/add-slot toolbar-actions` |
| `/module-status` | 모듈 런타임 상태 조회 | `/module-status` |
| `/sync-now` | 수동 로그 동기화 트리거 | `/sync-now` |

## 용어 정의

| 용어 | 의미 |
|------|------|
| **Feature** | Core UI 기능. `src/features/`에 위치. 모듈 시스템 미사용 |
| **모듈 (Module)** | 서버 사이드 확장 단위. `/modules/`에 위치. 훅 + HTTP API |
| **플러그인 (Plugin)** | Claude Code(외부 도구)의 확장 기능. Loomi와 무관 |

- "플러그인"은 Claude Code 플러그인을 지칭할 때만 사용
- 코드에서: `Module*` 타입, `/api/modules` 엔드포인트

## 주의사항

- Next.js 16은 Turbopack 기본. `next.config.ts`에 webpack 설정 쓰면 빌드 실패
- `better-sqlite3`는 `serverExternalPackages`에 등록 필수
- DB 파일: `data/loomi.db` (WAL 모드)
- 임베딩 모델: `data/models/` (첫 실행 시 ~80MB 자동 다운로드)
- Path alias는 `tsconfig.json`과 `next.config.ts` **두 곳 모두** 설정
- Core API 함수는 동기(sync) — better-sqlite3가 동기 드라이버이므로
