# /add-slot — Module UI 슬롯 추가

새 ModuleSlotId를 등록합니다. 인자: `$ARGUMENTS` (슬롯 ID, 예: `toolbar-actions`)

## 필수 수정 파일 (2곳)

### 1. `src/core/modules/types.ts` — ModuleSlotId union에 추가

```typescript
export type ModuleSlotId =
  | "sidebar-bottom"
  | "sidebar-sessions-panel"
  | "session-header"
  | "session-footer"
  | "main-content"
  | "main-bottom-panel"
  | "settings-section"
  | "$ARGUMENTS";  // ← 추가
```

### 2. `src/core/modules/manifest.ts` — VALID_SLOTS 배열에 추가

```typescript
const VALID_SLOTS: ModuleSlotId[] = [
  "sidebar-bottom", "sidebar-sessions-panel", "session-header", "session-footer",
  "main-content", "main-bottom-panel", "settings-section",
  "$ARGUMENTS",  // ← 추가
];
```

## 슬롯 사용법 안내

슬롯을 추가한 후, 아래 방법 중 하나로 렌더링:

### 방법 A: ModuleSlot 컴포넌트 (동적, 다수 모듈)
```tsx
<ModuleSlot slotId="$ARGUMENTS" sessionId={sessionId} />
```

### 방법 B: ModuleOrFallback (특정 모듈 + fallback)
```tsx
<ModuleOrFallback
  componentPath="module-id/component-name"
  fallback={<DefaultComponent />}
/>
```

app-shell.tsx에서 적절한 위치에 배치할 것.

## 체크리스트

- [ ] `types.ts`의 ModuleSlotId union에 추가됨
- [ ] `manifest.ts`의 VALID_SLOTS 배열에 추가됨
- [ ] 슬롯 ID가 kebab-case인지 확인
- [ ] 사용할 모듈의 manifest.json slots 배열에도 추가됨
