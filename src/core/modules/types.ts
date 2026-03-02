// ── Module Tier ────────────────────────────────────────────────────

export type ModuleTier = "explorer";

// ── Module Core Types ──────────────────────────────────────────────

export type HookEventName =
  | "onLogCaptured"
  | "onSessionEnd"
  | "onSearch"
  | "onModuleInit"
  | "onModuleDestroy";

export type ModuleSlotId =
  | "sidebar-bottom"
  | "sidebar-sessions-panel"
  | "session-header"
  | "session-footer"
  | "main-content"
  | "main-bottom-panel"
  | "settings-section";

export type ModulePermission =
  | "db:read"
  | "db:write"
  | "network"
  | "filesystem:read"
  | "process:spawn";

export type ModuleRuntime = "server" | "client" | "both";

export interface ModuleSettingsField {
  key: string;
  type: "string" | "number" | "boolean" | "select" | "multiselect" | "json";
  label: string;
  description?: string;
  default?: unknown;
  options?: { label: string; value: string }[];
  /** Hide this field unless another field matches the given values. */
  showIf?: { field: string; values: string[] };
}

export interface ModuleManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  loomiVersion: string;
  runtime: ModuleRuntime;
  serverEntry: string;
  hooks: HookEventName[];
  slots: ModuleSlotId[];
  permissions: ModulePermission[];
  isPremium: boolean;
  licenseKey?: string;
  settingsSchema: ModuleSettingsField[];
  sourceFilter?: {
    providers?: string[];
    toolTypes?: string[];
  };
  tier?: ModuleTier;
}

export type ModuleStatus = "loaded" | "error" | "disabled" | "unloaded" | "pending_consent";

export interface ModuleInstance {
  manifest: ModuleManifest;
  status: ModuleStatus;
  error?: string;
  dirPath: string;
  serverModule?: ModuleServerModule;
}

export interface ModuleServerModule {
  init?: (ctx: HookContext) => void | Promise<void>;
  destroy?: () => void | Promise<void>;
  hooks?: Partial<Record<HookEventName, (payload: unknown) => unknown | Promise<unknown>>>;
}

// ── Hook Context & Payloads ───────────────────────────────────────

export interface ModuleLogger {
  info: (msg: string, ...args: unknown[]) => void;
  warn: (msg: string, ...args: unknown[]) => void;
  error: (msg: string, ...args: unknown[]) => void;
}

export interface HookContext {
  moduleId: string;
  db: ModuleDbInterface;
  logger: ModuleLogger;
  settings: Record<string, unknown>;
}

export interface ModuleDbInterface {
  query: (sql: string, params?: unknown[]) => unknown[];
  getSession: (sessionUuid: string) => unknown | undefined;
  getSessions: (opts?: { limit?: number; projectPath?: string }) => unknown[];
  getMessages: (sessionId: number) => unknown[];
  searchMessages: (query: string, limit?: number) => unknown[];
  setModuleData: (key: string, value: unknown) => void;
  getModuleData: (key: string) => unknown | undefined;
}

export interface OnLogCapturedPayload {
  filePath: string;
  sessions: Map<string, unknown>;
  newMessageCount: number;
  provider?: string;
}

export interface OnSessionEndPayload {
  sessionId: number;
  sessionUuid: string;
}

export interface OnSearchPayload {
  query: string;
  results: unknown[];
}

// ── Claude Bridge Types ───────────────────────────────────────────

export interface ClaudeBridgeMessage {
  id: string;
  chatId: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  tokens?: number;
  cost?: number;
}

export interface ClaudeBridgeSession {
  chatId: string;
  projectPath?: string;
  claudeSessionId?: string;
  status: "active" | "idle" | "error";
  createdAt: string;
  messages: ClaudeBridgeMessage[];
}

// ── Hook Handler Registration ─────────────────────────────────────

export interface HookHandler {
  moduleId: string;
  priority: number;
  handler: (payload: unknown) => unknown | Promise<unknown>;
}
