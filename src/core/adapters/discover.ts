import fs from "fs";
import os from "os";
import path from "path";
import { eq } from "drizzle-orm";
import { adapterRegistry } from "./registry";
import { getDb } from "../db";
import { watchedPaths } from "../db/schema";

export { registerBuiltinAdapters } from "./register";

/**
 * Auto-register each adapter's defaultPaths into watched_paths (if not already present).
 * Replaces the old watcher-module approach.
 */
export function autoRegisterAdapterPaths(): void {
  const db = getDb();

  for (const adapter of adapterRegistry.getAllAdapters()) {
    const defaults = adapter.metadata.defaultPaths;
    if (!defaults || defaults.length === 0) continue;

    for (const rawPath of defaults) {
      const expanded = rawPath.startsWith("~")
        ? path.join(os.homedir(), rawPath.slice(1))
        : rawPath;

      if (!fs.existsSync(expanded)) continue;

      const existing = db.select().from(watchedPaths)
        .where(eq(watchedPaths.toolType, adapter.metadata.id))
        .get();

      if (!existing) {
        db.insert(watchedPaths).values({
          path: expanded,
          toolType: adapter.metadata.id,
          label: adapter.metadata.name,
          enabled: true,
        }).run();
        console.log(`[Loomi] Auto-registered path for ${adapter.metadata.id}: ${expanded}`);
        break; // one path per adapter
      } else {
        break; // already has a path for this adapter
      }
    }
  }
}

/** Discover external adapters from the /adapters/ directory */
export async function discoverExternalAdapters(): Promise<void> {
  const adaptersDir = path.resolve(process.cwd(), "adapters");

  if (!fs.existsSync(adaptersDir)) {
    return;
  }

  const entries = fs.readdirSync(adaptersDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith("_")) continue;

    const manifestPath = path.join(adaptersDir, entry.name, "manifest.json");
    const indexPath = path.join(adaptersDir, entry.name, "index.ts");

    if (!fs.existsSync(manifestPath) || !fs.existsSync(indexPath)) continue;

    try {
      // Next.js Webpack/Turbo의 정적 분석을 피하기 위해 eval('require') 사용
      // .ts 파일의 경우 런타임 환경(tsx 등)에서 지원되어야 함
      const mod = eval('require')(indexPath);
      const adapter = mod.default || mod;
      
      if (adapter && typeof adapter === "object" && adapter.metadata) {
        adapterRegistry.register(adapter);
        console.log(`[Loomi] External adapter loaded: ${entry.name}`);
      }
    } catch (err) {
      // .ts 파일을 직접 require 할 수 없는 환경(Next.js 기본 서버 등)일 경우 에러 발생 가능
      // 이 경우 에러 로그를 남기고 넘어감
      console.warn(`[Loomi] Could not load external adapter ${entry.name} via require. This is expected in some environments.`);
    }
  }
}
