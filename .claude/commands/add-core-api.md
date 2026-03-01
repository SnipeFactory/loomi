# /add-core-api — Core Data Access API 추가

새 Core API 함수와 HTTP wrapper를 생성합니다. 인자: `$ARGUMENTS` (기능명, 예: `analytics`)

## 아키텍처 규칙

- Core API (`src/core/api/`)는 **동기 TypeScript 함수** — 같은 프로세스에서 호출, HTTP 오버헤드 없음
- HTTP Route (`src/app/api/`)는 **thin wrapper** — Core API 함수를 호출하고 NextResponse.json으로 감쌀 뿐
- DB 쿼리 로직은 반드시 Core API에만 존재

## 생성/수정 파일

### 1. `src/core/api/$ARGUMENTS.ts` — Core API 함수

기존 패턴 참고 (`src/core/api/sessions.ts`):

```typescript
import { getDb } from "../db";
import { 테이블명 } from "../db/schema";
// 필요한 drizzle-orm import

export function 함수명(opts?: 옵션타입): 반환타입 {
  const db = getDb();
  // Drizzle ORM 쿼리 (동기)
  return 결과;
}
```

### 2. `src/core/api/types.ts` — 타입 추가 (필요 시)

요청 옵션과 응답 타입을 여기에 정의:

```typescript
export interface 옵션타입 {
  limit?: number;
  page?: number;
  // ...
}
```

### 3. `src/app/api/$ARGUMENTS/route.ts` — HTTP Thin Wrapper

```typescript
import { NextResponse } from "next/server";
import { 함수명 } from "@core/api/$ARGUMENTS";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  // searchParams에서 파라미터 추출
  const result = 함수명({ /* opts */ });
  return NextResponse.json(result);
}
```

### 4. `src/core/db/schema.ts` — 새 테이블 (필요 시에만)

새 데이터 저장이 필요한 경우에만 테이블 추가. 기존 테이블로 충분한지 먼저 확인.

## 체크리스트

- [ ] Core API 함수가 동기(sync)인지 확인 (better-sqlite3는 동기)
- [ ] 타입이 `src/core/api/types.ts`에 정의됨
- [ ] HTTP route가 Core API 함수를 호출만 하는 thin wrapper인지 확인
- [ ] route에 인라인 DB 쿼리가 없는지 확인
- [ ] `npm run build` 성공 확인
