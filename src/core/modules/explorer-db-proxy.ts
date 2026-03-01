/**
 * ExplorerDbProxy — DB access for Explorer modules.
 * All read results are scrubbed through DataScrubber before returning.
 */

import { ModuleDbProxy } from "./db-proxy";
import { getDataScrubber } from "./data-scrubber";
import type { ModulePermission } from "./types";

export class ExplorerDbProxy extends ModuleDbProxy {
  private scrubber = getDataScrubber();

  constructor(moduleId: string, permissions: ModulePermission[]) {
    // Explorer modules never get filesystem:read or db:write beyond module data
    const safePerms = permissions.filter(
      (p) => p !== "filesystem:read"
    );
    super(moduleId, safePerms);
  }

  override query(sqlStr: string, params: unknown[] = []): unknown[] {
    const results = super.query(sqlStr, params);
    return this.scrubResults(results);
  }

  override getSession(sessionUuid: string): unknown | undefined {
    const result = super.getSession(sessionUuid);
    if (!result) return undefined;
    return this.scrubber.scrubMessage(result as Record<string, unknown>);
  }

  override getSessions(opts?: { limit?: number; projectPath?: string }): unknown[] {
    const results = super.getSessions(opts);
    return this.scrubResults(results);
  }

  override getMessages(sessionId: number): unknown[] {
    const results = super.getMessages(sessionId);
    return this.scrubResults(results);
  }

  override searchMessages(query: string, limit?: number): unknown[] {
    const results = super.searchMessages(query, limit);
    return this.scrubResults(results);
  }

  private scrubResults(results: unknown[]): unknown[] {
    return results.map((r) => {
      if (typeof r === "object" && r !== null) {
        return this.scrubber.scrubMessage(r as Record<string, unknown>);
      }
      return r;
    });
  }
}
