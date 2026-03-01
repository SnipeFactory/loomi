# /new-module — Loomi Module Scaffolding

Creates a new module structure. Argument: `$ARGUMENTS` (Module ID, e.g., `my-analyzer`)

## Required Files

### 1. `modules/$ARGUMENTS/manifest.json`

```json
{
  "id": "$ARGUMENTS",
  "name": "(Ask the user)",
  "version": "1.0.0",
  "description": "(Ask the user)",
  "author": "Loomi",
  "loomiVersion": "1.0.0",
  "runtime": "(server | client | both - Ask the user)",
  "serverEntry": "index.ts",
  "hooks": [],
  "slots": [],
  "permissions": ["db:read"],
  "isPremium": false,
  "settingsSchema": []
}
```

Valid hooks: `onModuleInit`, `onModuleDestroy`, `onLogCaptured`, `onSessionEnd`, `onSearch`, `onViewRender`
Valid slots: `sidebar-bottom`, `sidebar-sessions-panel`, `session-header`, `session-footer`, `main-content`, `main-bottom-panel`, `settings-section`
Valid permissions: `db:read`, `db:write`, `network`, `filesystem:read`, `process:spawn`

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
  // Implement based on manifest.json hooks
};
```

### 3. If UI Components Exist (runtime is "client" or "both")

- Create `modules/$ARGUMENTS/components/` directory
- Create required `.tsx` component files
- Create `modules/$ARGUMENTS/hooks/` directory (if needed)

## Required Modifications

### 4. `tsconfig.json` — Add to paths

```json
"@modules/$ARGUMENTS/*": ["./modules/$ARGUMENTS/*"]
```

### 5. `next.config.ts` — Add to turbopack.resolveAlias

```typescript
"@modules/$ARGUMENTS": path.resolve(__dirname, "modules/$ARGUMENTS"),
```

### 6. For UI Modules: `src/components/modules/module-component-registry.ts`

```typescript
"$ARGUMENTS/component-name": lazy(
  () => import("@modules/$ARGUMENTS/components/component-name")
),
```

## Checklist

- [ ] Verify manifest.json hooks/slots/permissions are valid.
- [ ] Ensure index.ts hooks match manifest.json.
- [ ] Path alias added to tsconfig.json.
- [ ] Turbopack alias added to next.config.ts.
- [ ] UI components registered in module-component-registry.ts (if applicable).
- [ ] Confirm `npm run build` succeeds.
