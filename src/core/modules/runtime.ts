import fs from "fs";
import path from "path";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { modules, moduleSettings } from "../db/schema";
import { loadManifest } from "./manifest";
import { ModuleDbProxy } from "./db-proxy";
import { ExplorerDbProxy } from "./explorer-db-proxy";
import { getHookBus } from "./hook-bus";
import { hasConsent, grantConsent, requestConsent } from "./consent";
import type {
  ModuleManifest,
  ModuleInstance,
  ModuleServerModule,
  ModuleLogger,
  HookContext,
  HookEventName,
  ModuleDbInterface,
} from "./types";

const MODULES_DIR = path.resolve(process.cwd(), "modules");

export class ModuleRuntime {
  private instances: Map<string, ModuleInstance> = new Map();
  private hookBus = getHookBus();

  /** Scan /modules directory and load all discovered modules */
  async discover(): Promise<void> {
    if (!fs.existsSync(MODULES_DIR)) {
      fs.mkdirSync(MODULES_DIR, { recursive: true });
      console.log("[Module] Created modules directory");
      return;
    }

    const entries = fs.readdirSync(MODULES_DIR, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const dirPath = path.join(MODULES_DIR, entry.name);
      try {
        const manifest = loadManifest(dirPath);
        await this.registerModule(manifest, dirPath);
      } catch (err) {
        console.error(`[Module] Failed to load module from ${entry.name}:`, err);
      }
    }

    console.log(`[Module] Loaded ${this.instances.size} modules`);
  }

  /** Register a module: persist to DB and optionally load it */
  async registerModule(manifest: ModuleManifest, dirPath: string): Promise<void> {
    const db = getDb();
    const tier = manifest.tier || null;

    // Upsert in DB
    const existing = db.select().from(modules)
      .where(eq(modules.moduleId, manifest.id))
      .get();

    if (existing) {
      db.update(modules).set({
        name: manifest.name,
        version: manifest.version,
        dirPath,
        manifestJson: JSON.stringify(manifest),
        isPremium: manifest.isPremium || false,
        tier,
        updatedAt: new Date().toISOString(),
      }).where(eq(modules.moduleId, manifest.id)).run();
    } else {
      db.insert(modules).values({
        moduleId: manifest.id,
        name: manifest.name,
        version: manifest.version,
        dirPath,
        manifestJson: JSON.stringify(manifest),
        isPremium: manifest.isPremium || false,
        tier,
      }).run();
    }

    // Official modules (author: "Loomi") get auto-consent
    if (manifest.author === "Loomi" && manifest.permissions?.length > 0) {
      grantConsent(manifest.id, manifest.permissions);
    } else if (manifest.tier === "explorer" && manifest.permissions?.length > 0) {
      // External explorer modules need consent
      if (!hasConsent(manifest.id)) {
        requestConsent(manifest.id, manifest.permissions);
      }
    }

    // Check if enabled
    const record = db.select().from(modules)
      .where(eq(modules.moduleId, manifest.id))
      .get()!;

    if (record.enabled) {
      // External explorer modules without consent go to pending_consent
      if (manifest.tier === "explorer" && manifest.author !== "Loomi" && !hasConsent(manifest.id)) {
        this.instances.set(manifest.id, {
          manifest,
          status: "pending_consent",
          dirPath,
        });
        return;
      }
      await this.loadModule(manifest, dirPath);
    } else {
      this.instances.set(manifest.id, {
        manifest,
        status: "disabled",
        dirPath,
      });
    }
  }

  /** Load and initialize a module's server module */
  async loadModule(manifest: ModuleManifest, dirPath: string): Promise<void> {
    const logger = this.createLogger(manifest.id);

    try {
      // Resolve entry point with tier-based fallback
      let entryPath = path.join(dirPath, manifest.serverEntry);
      if (!fs.existsSync(entryPath)) {
        if (manifest.tier === "explorer") {
          const fallback = path.join(dirPath, "explorer.tsx");
          if (fs.existsSync(fallback)) entryPath = fallback;
        }
      }
      if (!fs.existsSync(entryPath)) {
        throw new Error(`Server entry not found: ${entryPath}`);
      }

      // Dynamic require — use createRequire to bypass Turbopack static analysis
      const { createRequire } = await import("module");
      const dynamicRequire = createRequire(import.meta.url || __filename);
      const serverModule: ModuleServerModule = dynamicRequire(entryPath);

      // Create tier-appropriate DB proxy
      let dbProxy: ModuleDbInterface;
      if (manifest.tier === "explorer") {
        dbProxy = new ExplorerDbProxy(manifest.id, manifest.permissions || []);
      } else {
        dbProxy = new ModuleDbProxy(manifest.id, manifest.permissions || []);
      }

      const settings = (dbProxy as ModuleDbProxy).getSettings();
      const ctx: HookContext = {
        moduleId: manifest.id,
        db: dbProxy,
        logger,
        settings,
      };

      // Register hooks
      if (serverModule.hooks) {
        for (const hookName of (manifest.hooks || [])) {
          const handler = serverModule.hooks[hookName];
          if (handler) {
            this.hookBus.register(hookName, {
              moduleId: manifest.id,
              priority: 100,
              handler,
            });
          }
        }
      }

      // Call init
      if (serverModule.init) {
        await serverModule.init(ctx);
      }

      this.instances.set(manifest.id, {
        manifest,
        status: "loaded",
        dirPath,
        serverModule,
      });

      logger.info(`Module loaded successfully`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error(`Failed to load: ${errMsg}`);
      this.instances.set(manifest.id, {
        manifest,
        status: "error",
        error: errMsg,
        dirPath,
      });
    }
  }

  /** Unload a module: unhook + call destroy */
  async unloadModule(id: string): Promise<void> {
    const instance = this.instances.get(id);
    if (!instance) return;

    this.hookBus.unregisterAll(id);

    if (instance.serverModule?.destroy) {
      try {
        await instance.serverModule.destroy();
      } catch (err) {
        console.error(`[Module:${id}] Error during destroy:`, err);
      }
    }

    instance.status = "unloaded";
    instance.serverModule = undefined;
  }

  /** Enable a disabled module */
  async enableModule(id: string): Promise<void> {
    const db = getDb();
    db.update(modules).set({ enabled: true, updatedAt: new Date().toISOString() })
      .where(eq(modules.moduleId, id)).run();

    const instance = this.instances.get(id);
    if (instance && instance.status === "disabled") {
      await this.loadModule(instance.manifest, instance.dirPath);
    }
  }

  /** Disable a loaded module */
  async disableModule(id: string): Promise<void> {
    const db = getDb();
    db.update(modules).set({ enabled: false, updatedAt: new Date().toISOString() })
      .where(eq(modules.moduleId, id)).run();

    await this.unloadModule(id);
    const instance = this.instances.get(id);
    if (instance) {
      instance.status = "disabled";
    }
  }

  /** Get all module instances */
  getAllModules(): ModuleInstance[] {
    return Array.from(this.instances.values());
  }

  /** Get a specific module instance */
  getModule(id: string): ModuleInstance | undefined {
    return this.instances.get(id);
  }

  /** Get a loaded module's raw server module (for accessing custom exports like getBridge) */
  getModuleExports<T = ModuleServerModule>(id: string): T | null {
    const instance = this.instances.get(id);
    if (!instance || instance.status !== "loaded" || !instance.serverModule) {
      return null;
    }
    return instance.serverModule as unknown as T;
  }

  /** Approve consent for a pending module and load it */
  async approveModuleConsent(moduleId: string): Promise<void> {
    const instance = this.instances.get(moduleId);
    if (!instance) return;

    grantConsent(moduleId, instance.manifest.permissions || []);

    if (instance.status === "pending_consent") {
      await this.loadModule(instance.manifest, instance.dirPath);
    }
  }

  private createLogger(moduleId: string): ModuleLogger {
    return {
      info: (msg: string, ...args: unknown[]) => console.log(`[Module:${moduleId}]`, msg, ...args),
      warn: (msg: string, ...args: unknown[]) => console.warn(`[Module:${moduleId}]`, msg, ...args),
      error: (msg: string, ...args: unknown[]) => console.error(`[Module:${moduleId}]`, msg, ...args),
    };
  }
}

// Singleton (use globalThis to survive Turbopack module re-evaluation)
const RUNTIME_KEY = "__loomi_module_runtime__" as const;

declare global {
  // eslint-disable-next-line no-var
  var __loomi_module_runtime__: ModuleRuntime | undefined;
}

export function getModuleRuntime(): ModuleRuntime {
  if (!globalThis[RUNTIME_KEY]) {
    globalThis[RUNTIME_KEY] = new ModuleRuntime();
  }
  return globalThis[RUNTIME_KEY];
}
