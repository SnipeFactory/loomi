import type { HookEventName, HookHandler } from "./types";

export class HookBus {
  private handlers: Map<HookEventName, HookHandler[]> = new Map();

  register(event: HookEventName, handler: HookHandler): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    const list = this.handlers.get(event)!;
    list.push(handler);
    // Sort by priority (lower = first)
    list.sort((a, b) => a.priority - b.priority);
  }

  unregister(event: HookEventName, moduleId: string): void {
    const list = this.handlers.get(event);
    if (!list) return;
    this.handlers.set(
      event,
      list.filter((h) => h.moduleId !== moduleId)
    );
  }

  unregisterAll(moduleId: string): void {
    for (const [event] of this.handlers) {
      this.unregister(event, moduleId);
    }
  }

  /** Fire-and-forget: runs all handlers, logs errors but doesn't break the chain */
  async emit(event: HookEventName, payload: unknown, timeoutMs = 60_000): Promise<void> {
    const list = this.handlers.get(event);
    if (!list || list.length === 0) return;

    for (const { moduleId, handler } of list) {
      try {
        const timeout = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Hook timed out after ${timeoutMs}ms`)), timeoutMs).unref()
        );
        await Promise.race([handler(payload), timeout]);
      } catch (err) {
        console.error(`[Module:${moduleId}] Error in hook ${event}:`, err);
      }
    }
  }

  /** Pipeline: each handler transforms the payload sequentially */
  async pipeline<T>(event: HookEventName, payload: unknown, initial: T): Promise<T> {
    const list = this.handlers.get(event);
    if (!list || list.length === 0) return initial;

    let result = initial;
    for (const { moduleId, handler } of list) {
      try {
        const transformed = await handler({ ...payload as object, current: result });
        if (transformed !== undefined && transformed !== null) {
          result = transformed as T;
        }
      } catch (err) {
        console.error(`[Module:${moduleId}] Error in pipeline ${event}:`, err);
      }
    }
    return result;
  }
}

// Singleton (use globalThis to survive Turbopack module re-evaluation)
declare global {
  // eslint-disable-next-line no-var
  var __loomi_hook_bus__: HookBus | undefined;
}

export function getHookBus(): HookBus {
  if (!globalThis.__loomi_hook_bus__) {
    globalThis.__loomi_hook_bus__ = new HookBus();
  }
  return globalThis.__loomi_hook_bus__;
}
