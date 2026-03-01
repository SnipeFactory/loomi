# /new-module — Loomi 모듈 스캐폴딩

새 모듈을 생성합니다. 인자: `$ARGUMENTS` (모듈 ID, 예: `my-analyzer`)

## 필수 생성 파일

### 1. `modules/$ARGUMENTS/manifest.json`

```json
{
  "id": "$ARGUMENTS",
  "name": "(사용자에게 물어볼 것)",
  "version": "1.0.0",
  "description": "(사용자에게 물어볼 것)",
  "author": "Loomi",
  "loomiVersion": "1.0.0",
  "runtime": "(server | client | both - 사용자에게 물어볼 것)",
  "serverEntry": "index.ts",
  "hooks": [],
  "slots": [],
  "permissions": ["db:read"],
  "isPremium": false,
  "settingsSchema": []
}
```

유효한 hooks: `onModuleInit`, `onModuleDestroy`, `onLogCaptured`, `onSessionEnd`, `onSearch`, `onViewRender`
유효한 slots: `sidebar-bottom`, `sidebar-sessions-panel`, `session-header`, `session-footer`, `main-content`, `main-bottom-panel`, `settings-section`
유효한 permissions: `db:read`, `db:write`, `network`, `filesystem:read`, `process:spawn`

### 2. `modules/$ARGUMENTS/index.ts`

```typescript
import type { HookContext } from "../../src/core/modules/types";

let ctx: HookContext | null = null;

export async function init(hookCtx: HookContext) {
  ctx = hookCtx;
  ctx.logger.info("$ARGUMENTS initialized");
}

export async function destroy() {
  ctx = null;
}

export const hooks = {
  // manifest.json의 hooks에 맞춰 구현
};
```

### 3. UI 컴포넌트가 있는 경우 (runtime이 "client" 또는 "both")

- `modules/$ARGUMENTS/components/` 디렉토리 생성
- 필요한 컴포넌트 `.tsx` 파일 생성
- `modules/$ARGUMENTS/hooks/` 디렉토리 생성 (필요 시)

## 필수 수정 파일

### 4. `tsconfig.json` — paths에 추가

```json
"@modules/$ARGUMENTS/*": ["./modules/$ARGUMENTS/*"]
```

### 5. `next.config.ts` — turbopack.resolveAlias에 추가

```typescript
"@modules/$ARGUMENTS": path.resolve(__dirname, "modules/$ARGUMENTS"),
```

### 6. UI 컴포넌트가 있는 경우: `src/components/modules/module-component-registry.ts`

```typescript
"$ARGUMENTS/component-name": lazy(
  () => import("@modules/$ARGUMENTS/components/component-name")
),
```

## 체크리스트

- [ ] manifest.json의 hooks/slots/permissions가 유효한 값인지 확인
- [ ] index.ts의 hooks 객체가 manifest.json의 hooks 배열과 일치하는지 확인
- [ ] tsconfig.json path alias 추가됨
- [ ] next.config.ts turbopack alias 추가됨
- [ ] UI 모듈이면 module-component-registry.ts에 등록됨
- [ ] `npm run build` 성공 확인
