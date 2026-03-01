# /add-slot — Add Module UI Slot

Registers a new ModuleSlotId. Argument: `$ARGUMENTS` (Slot ID, e.g., `toolbar-actions`)

## Required Modifications (2 Files)

### 1. `src/core/modules/types.ts` — Add to ModuleSlotId union

```typescript
export type ModuleSlotId =
  | "sidebar-bottom"
  | "sidebar-sessions-panel"
  | "session-header"
  | "session-footer"
  | "main-content"
  | "main-bottom-panel"
  | "settings-section"
  | "$ARGUMENTS";  // ← Add here
```

### 2. `src/core/modules/manifest.ts` — Add to VALID_SLOTS array

```typescript
const VALID_SLOTS: ModuleSlotId[] = [
  "sidebar-bottom", "sidebar-sessions-panel", "session-header", "session-footer",
  "main-content", "main-bottom-panel", "settings-section",
  "$ARGUMENTS",  // ← Add here
];
```

## Slot Usage Guide

After adding the slot, render it using one of the following methods:

### Method A: ModuleSlot Component (Dynamic, multiple modules)
```tsx
<ModuleSlot slotId="$ARGUMENTS" sessionId={sessionId} />
```

### Method B: ModuleOrFallback (Specific module + fallback)
```tsx
<ModuleOrFallback
  componentPath="module-id/component-name"
  fallback={<DefaultComponent />}
/>
```

Place at the appropriate location in `app-shell.tsx`.

## Checklist

- [ ] Added to ModuleSlotId union in `types.ts`.
- [ ] Added to VALID_SLOTS array in `manifest.ts`.
- [ ] Verified slot ID is in kebab-case.
- [ ] Added to the `slots` array in the manifest.json of modules that will use it.
