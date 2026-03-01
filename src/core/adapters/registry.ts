import type { IAdapter, FileDetectionResult } from "./types";

class AdapterRegistry {
  private adapters: Map<string, IAdapter> = new Map();

  register(adapter: IAdapter): void {
    this.adapters.set(adapter.metadata.id, adapter);
    console.log(`[Loomi] Adapter registered: ${adapter.metadata.id} (${adapter.metadata.provider})`);
  }

  unregister(id: string): void {
    this.adapters.delete(id);
  }

  getAdapterForFile(filePath: string): IAdapter | null {
    let bestAdapter: IAdapter | null = null;
    let bestConfidence = 0;

    for (const adapter of this.adapters.values()) {
      const result = adapter.detectFile(filePath);
      if (result.detected && result.confidence > bestConfidence) {
        bestAdapter = adapter;
        bestConfidence = result.confidence;
      }
    }

    return bestAdapter;
  }

  getAdaptersForDirectory(dirPath: string): { adapter: IAdapter; files: string[] }[] {
    const results: { adapter: IAdapter; files: string[] }[] = [];

    for (const adapter of this.adapters.values()) {
      if (adapter.detectDirectory) {
        const result = adapter.detectDirectory(dirPath);
        if (result.detected) {
          results.push({ adapter, files: result.files });
        }
      }
    }

    return results.sort((a, b) => b.files.length - a.files.length);
  }

  getAllAdapters(): IAdapter[] {
    return Array.from(this.adapters.values());
  }

  getAdapter(id: string): IAdapter | undefined {
    return this.adapters.get(id);
  }

  /** Collect all file patterns from registered adapters for watcher globs */
  getAllFilePatterns(): string[] {
    const patterns = new Set<string>();
    for (const adapter of this.adapters.values()) {
      for (const pattern of adapter.metadata.filePatterns) {
        patterns.add(pattern);
      }
    }
    return Array.from(patterns);
  }
}

// Singleton (use globalThis to survive Turbopack module re-evaluation)
const REGISTRY_KEY = "__loomi_adapter_registry__" as const;

declare global {
  // eslint-disable-next-line no-var
  var __loomi_adapter_registry__: AdapterRegistry | undefined;
}

function getAdapterRegistry(): AdapterRegistry {
  if (!globalThis[REGISTRY_KEY]) {
    globalThis[REGISTRY_KEY] = new AdapterRegistry();
  }
  return globalThis[REGISTRY_KEY];
}

export const adapterRegistry = getAdapterRegistry();
