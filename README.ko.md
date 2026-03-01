# Loomi: 당신의 AI 에이전트를 위한 잃어버린 장기 기억 장치.

**Universal AI History Hub** — AI 대화 기록을 로컬에서 수집·저장·검색한다.

Loomi는 Claude Code 등 AI 도구의 `.jsonl` 대화 로그를 실시간으로 감시하고, 로컬 SQLite DB에 저장한 뒤, 검색 가능한 대시보드로 보여준다. 덤으로 **MCP 서버**를 통해 Claude Code가 자신의 과거 대화를 스스로 검색할 수 있게 해준다.

```
┌──────────┬──────────────┬──────────────────────────────────┐
│ 경로     │ 세션 목록    │  [채팅] [사용량] [도구]          │
│          │              │                                  │
│ /home/.. │ ● 세션 1     │  User: 이 코드 리뷰해줘          │
│ /work/.. │   세션 2     │  Assistant: 네, 살펴보면 ...     │
│          │   세션 3     │  [code-block] [tool-use]         │
│          │              │                                  │
│          │              ├──────────────────────────────────┤
│          │              │  AI 터미널 (접을 수 있음)         │
└──────────┴──────────────┴──────────────────────────────────┘
```

## 주요 기능

- **실시간 로그 수집** — `chokidar`로 AI 도구 디렉토리를 감시, 바이트 오프셋 기반 증분 동기화
- **멀티 프로바이더 지원** — Claude Code, ChatGPT 내보내기, Cursor, Aider 내장 어댑터; Gemini CLI 외부 어댑터; 추가 어댑터 확장 가능
- **하이브리드 시맨틱 검색** — 로컬 `all-MiniLM-L6-v2` 벡터 검색 + FTS5 키워드 검색을 RRF(Reciprocal Rank Fusion)로 병합
- **자동 태깅** — 세션 종료 시 사용한 도구·언어·프레임워크·에러 타입을 자동 추출, 임베딩에 주입해 검색 정확도 향상
- **에피소딕 메모리 MCP 서버** — `search`, `show`, `status` 도구로 Claude Code가 과거 세션을 직접 검색
- **사용량 분석** — 프로젝트·세션별 토큰 수, 비용 추정, 도구 호출 통계
- **모듈 시스템** — 샌드박스 훅 기반 API로 서버 사이드 확장 가능
- **100% 로컬** — 클라우드 없음, 텔레메트리 없음, 핵심 기능에 API 키 불필요

## 빠른 시작

```bash
npm install
npm run dev        # http://localhost:2000
```

첫 실행 시 DB 마이그레이션과 모듈 디스커버리가 자동으로 진행된다.
임베딩 모델(~80MB)은 첫 검색 시 `data/models/`에 자동 다운로드된다.

## MCP 서버 (Claude Code 에피소딕 메모리)

`.mcp.json`이 프로젝트 루트에 이미 포함되어 있다. Loomi 디렉토리에서 Claude Code를 실행하면 자동으로 MCP 서버가 등록된다:

```json
// .mcp.json (이미 포함됨)
{
  "mcpServers": {
    "loomi-memory": {
      "command": "npx",
      "args": ["tsx", "src/mcp-server.ts"]
    }
  }
}
```

등록 후 Claude Code에서 세 가지 도구를 사용할 수 있다:

| 도구 | 설명 |
|------|------|
| `search` | 벡터+키워드 하이브리드 검색. 복수 개념 AND 검색 지원 |
| `show` | 세션 UUID로 전체 대화 읽기. 페이지네이션 지원 |
| `status` | 인덱싱 현황 조회 |

### 모범 사례: 선택적 메모리 리서치 (Selective Memory Research)

에이전트가 모든 턴에서 토큰을 낭비하지 않으면서도 똑똑하게 기억을 활용하려면 **선택적 메모리 리서치 프로토콜**을 따르는 것이 좋습니다. 이 프로젝트의 `CLAUDE.md`와 `GEMINI.md`에 이미 설정되어 있습니다.

**핵심 원칙:** 새로운 기능 구현, 아키텍처 설계, 복잡한 버그 수정과 같은 **지시(Directive)**를 받았을 때만 메모리를 검색하세요. 단순 파일 읽기나 리스트 확인 시에는 검색을 생략합니다.

**워크플로우 예시:**
1.  **사용자:** "Supabase를 사용해서 새로운 로그인 플로우를 구현해줘."
2.  **에이전트 (자동):** `loomi-memory:search({ query: "Supabase login flow" })` 호출
3.  **에이전트:** "2월 20일 세션 기록에서 Supabase PKCE 플로우를 사용하기로 결정하신 내용을 확인했습니다. 해당 맥락을 바탕으로 구현을 시작하겠습니다."

### Gemini CLI에서 사용

Gemini CLI의 모든 세션에서 Loomi의 메모리를 전역적으로 사용하려면 다음 명령어를 실행하세요:

```bash
gemini mcp add loomi-memory "bash" "-c" "cd /home/jch/workspace/loomi && npm run mcp-server" --scope user
```


## 기술 스택

| 영역 | 기술 |
|------|------|
| 프레임워크 | Next.js 16 (Turbopack) |
| 런타임 | Custom server (`server.ts`) via `tsx` |
| DB | SQLite (better-sqlite3) + Drizzle ORM + FTS5 + sqlite-vec (384d 벡터) |
| 임베딩 | `@xenova/transformers` — all-MiniLM-L6-v2 (로컬, API 불필요) |
| UI | React 19, Tailwind CSS 4, SWR, Lucide |
| 언어 | TypeScript (strict) |

## 아키텍처

```
                    ┌─────────────────────────────────┐
                    │          브라우저 (UI)           │
                    └────────────┬────────────────────┘
                                 │ HTTP (SWR)
                    ┌────────────▼────────────────────┐
                    │   API Routes (thin wrapper)      │
                    │   src/app/api/*                  │
                    └────────────┬────────────────────┘
                                 │ 직접 함수 호출
  ┌──────────────────────────────▼────────────────────────────────┐
  │                        Core Engine                            │
  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────────┐   │
  │  │ DB       │ │ Engine   │ │ Adapters │ │ Module Runtime │   │
  │  │ schema   │ │ watcher  │ │ claude   │ │ hooks, sandbox │   │
  │  │ migrate  │ │ sync     │ │ cursor.. │ │ permissions    │   │
  │  └──────────┘ └──────────┘ └──────────┘ └───────┬────────┘   │
  │  ┌──────────┐ ┌────────────────────────┐        │            │
  │  │ Core API │ │ Embeddings + Memory API│        │            │
  │  │ sessions │ │ all-MiniLM-L6-v2       │        │            │
  │  │ messages │ │ vec_messages (384d)    │        │            │
  │  └──────────┘ └────────────────────────┘        │            │
  └─────────────────────────────────────────────────┼────────────┘
                                         HookBus    │
  ┌─────────────────────────────────────────────────▼────────────┐
  │              모듈 (서버 사이드 확장 전용)                     │
  │      log-summarizer   │   episodic-memory   │  meta-tracker  │
  └──────────────────────────────────────────────────────────────┘
                                                    │ stdio/MCP
  ┌─────────────────────────────────────────────────▼────────────┐
  │               MCP Server (src/mcp-server.ts)                 │
  │                  search │ show │ status                       │
  └──────────────────────────────────────────────────────────────┘
```

### Core (`/src/core/`)

데이터 수집·저장만 담당. 분석/시각화 로직 없음.

| 모듈 | 경로 | 역할 |
|------|------|------|
| DB | `core/db/` | 스키마, 마이그레이션, 싱글톤 DB (WAL 모드) |
| Engine | `core/engine/` | chokidar 파일 워처, 바이트 오프셋 증분 동기화 |
| Adapters | `core/adapters/` | 로그 포맷 어댑터 레지스트리 (Claude CLI, ChatGPT, Cursor, Aider + 외부 어댑터) |
| Modules | `core/modules/` | 런타임, HookBus, VM 샌드박스, 퍼미션 체크 |
| API | `core/api/` | 데이터 접근 함수 (동기, 같은 프로세스) |
| Embeddings | `core/embeddings/` | 로컬 임베딩 엔진 (all-MiniLM-L6-v2, 384d) |
| Memory API | `core/api/memory.ts` | 에피소딕 인덱싱 + 하이브리드 검색 (벡터 + FTS5 + RRF) |
| Auto-tagger | `core/api/auto-tagger.ts` | 세션별 개념 추출 (도구/언어/프레임워크/에러) → `session_tags` |

### Features (`/src/features/`)

Core UI 기능. 모듈 시스템을 거치지 않고 `app-shell.tsx`에서 직접 import.

| 기능 | 경로 | 역할 |
|------|------|------|
| Session Explorer | `features/session-explorer/` | 채팅 뷰어, 사용량 차트, 도구 모니터 |
| AI Terminal | `features/ai-terminal/` | 스트리밍 AI 터미널 |

### 모듈 (`/modules/`)

서버 사이드 확장 단위. 훅 + HTTP API만 제공 — UI 렌더링 없음.

| 모듈 | Tier | 역할 |
|------|------|------|
| **log-summarizer** | explorer | AI 기반 세션 요약 생성 (OpenRouter) |
| **episodic-memory** | explorer | `onSessionEnd` 시 자동 태깅 + 벡터 인덱싱 |
| **meta-tracker** | explorer | 토큰/비용 메타 추적 |

**Tier:** 현재 `explorer`만 존재. 경로 등록은 어댑터 `defaultPaths`가 담당 (별도 모듈 불필요).
- `explorer` — DataScrubber를 통한 DB 읽기 전용 (API 키 자동 마스킹). 서드파티 개발자에게 개방.

## 모듈 만들기

모듈은 **서버 사이드 전용** — 훅과 HTTP API 엔드포인트. UI 기여는 PR로.

최소 구조:

```
modules/my-module/
├── manifest.json
└── index.ts
```

**manifest.json:**
```json
{
  "id": "my-module",
  "name": "My Module",
  "version": "1.0.0",
  "runtime": "server",
  "serverEntry": "index.ts",
  "hooks": ["onModuleInit", "onLogCaptured"],
  "slots": [],
  "permissions": ["db:read"],
  "tier": "explorer"
}
```

**index.ts:**
```typescript
import type { HookContext } from "../../src/core/modules/types";

let ctx: HookContext | null = null;

export async function init(hookCtx: HookContext) {
  ctx = hookCtx;
}

export async function destroy() {
  ctx = null;
}

export const hooks = {
  onLogCaptured: async (payload: unknown) => {
    // 새 로그 항목마다 실행됨
  },
};
```

**사용 가능한 훅:** `onModuleInit`, `onModuleDestroy`, `onLogCaptured`, `onSessionEnd`, `onSearch`

**사용 가능한 권한:** `db:read`, `db:write`, `network`, `filesystem:read`, `process:spawn`

## API 엔드포인트

| Method | 경로 | 설명 |
|--------|------|------|
| GET | `/api/sessions` | 세션 목록 (필터, 페이지네이션) |
| GET | `/api/sessions/[id]` | 세션 상세 + 메시지 (`?before=`, `?after=`, `?limit=` 커서 페이지네이션) |
| POST | `/api/search` | FTS5 전문 검색 |
| GET | `/api/memory?q=...` | 하이브리드 시맨틱 검색 |
| GET | `/api/memory?action=status` | 인덱싱 현황 |
| POST | `/api/memory` | 인덱싱 트리거 |
| GET | `/api/stats/projects` | 프로젝트별 사용량 통계 |
| GET | `/api/stats/tools` | 도구 호출 횟수 |
| GET | `/api/watched-paths` | 감시 중인 디렉토리 목록 (`?toolType=` 필터) |
| POST | `/api/watched-paths` | 감시 디렉토리 추가 |
| PUT | `/api/watched-paths` | toolType별 경로 업데이트 (upsert) |
| POST | `/api/sync` | 수동 동기화 트리거 |
| GET | `/api/modules` | 모듈 목록 |
| PATCH | `/api/modules/[id]` | 모듈 활성화 / 비활성화 |
| GET/PUT | `/api/modules/[id]/settings` | 모듈 설정 |
| GET/POST/DELETE | `/api/modules/[id]/consent` | 모듈 데이터 접근 동의 |
| GET | `/api/adapters` | 등록된 로그 어댑터 목록 |

## 명령어

```bash
npm run dev          # 개발 서버 (tsx watch, 포트 2000)
npm run build        # 프로덕션 빌드 (Turbopack)
npm run start        # 프로덕션 서버
npm run db:generate  # Drizzle 마이그레이션 생성
npm run db:push      # DB에 스키마 반영
```

## 프로젝트 구조

```
loomi/
├── .mcp.json                   # Claude Code MCP 서버 등록 (loomi-memory)
├── .claude/commands/           # Claude Code 커스텀 커맨드
│   ├── new-module.md           #   /new-module — 모듈 스캐폴딩
│   ├── add-core-api.md         #   /add-core-api — Core API + HTTP 라우트 추가
│   ├── add-slot.md             #   /add-slot — UI 슬롯 등록
│   ├── module-status.md        #   /module-status — 런타임 상태 확인
│   └── sync-now.md             #   /sync-now — 수동 동기화 트리거
├── adapters/                   # 외부 로그 포맷 어댑터
│   └── gemini-cli/             #   Gemini CLI 세션 로그 (~/.gemini/tmp)
├── modules/                    # 서버 사이드 확장 모듈 (explorer 전용)
│   ├── episodic-memory/        #   자동 태깅 + 벡터 인덱싱
│   ├── log-summarizer/         #   AI 세션 요약
│   └── meta-tracker/           #   토큰/비용 추적
├── packages/loomi-sdk/         # 서드파티 모듈 개발자용 SDK
├── src/
│   ├── core/                   # Core 엔진 (UI 로직 없음)
│   │   ├── db/                 #   스키마, 마이그레이션, 가상 테이블
│   │   ├── engine/             #   파일 워처, 동기화
│   │   ├── adapters/           #   로그 포맷 어댑터
│   │   ├── modules/            #   모듈 런타임
│   │   ├── embeddings/         #   로컬 임베딩 엔진
│   │   └── api/                #   데이터 접근 함수
│   │       ├── memory.ts       #     에피소딕 인덱싱 + 하이브리드 검색
│   │       └── auto-tagger.ts  #     세션 개념 추출 → session_tags
│   ├── features/               # Core UI (모듈 시스템 미사용)
│   │   ├── session-explorer/   #   채팅 뷰어, 사용량 대시보드, 도구 모니터
│   │   └── ai-terminal/        #   스트리밍 AI 터미널
│   ├── mcp-server.ts           # MCP 서버 진입점 (stdio)
│   ├── app/api/                # Next.js API 라우트 (thin wrapper)
│   ├── components/             # 공유 React UI 컴포넌트
│   └── types/                  # 도메인 타입
├── server.ts                   # 커스텀 서버 (마이그레이션 → 모듈 → 워처)
├── CLAUDE.md                   # Claude Code용 프로젝트 지침
└── docs/                       # 설계 문서
```

## 주의사항

- Next.js 16은 **Turbopack 기본** — `next.config.ts`에 webpack 설정 금지
- `better-sqlite3`는 `serverExternalPackages`에 등록 필수
- DB 파일: `data/loomi.db` (WAL 모드). gitignore 처리됨
- Path alias는 `tsconfig.json`과 `next.config.ts` **두 곳 모두** 설정: `@features/*` → `src/features/*`
- Core API 함수는 동기(sync) — better-sqlite3가 동기 드라이버
- 임베딩 모델은 첫 사용 시 `data/models/`에 다운로드 (~80MB, 최초 1회)
- `vec_messages`, `messages_fts`는 `migrate.ts`에서 직접 생성하는 가상 테이블 — Drizzle 스키마에 없음
- `messages.embedding_indexed_at`, `sessions.session_tags`는 `migrate.ts`에서 `ALTER TABLE`로 추가
- 메시지 삭제 시 `messages_delete_vec` 트리거로 `vec_messages`도 자동 정리

## 라이선스

오픈소스
