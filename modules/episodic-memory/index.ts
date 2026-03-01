import type { HookContext } from "../../src/core/modules/types";
import { indexSession, indexAll, getIndexingStatus } from "../../src/core/api/memory";
import { tagSession } from "../../src/core/api/auto-tagger";

let ctx: HookContext | null = null;

export async function init(hookCtx: HookContext) {
  ctx = hookCtx;
  ctx.logger.info("Episodic Memory initialized");

  // Background batch indexing of unindexed messages
  const status = getIndexingStatus();
  if (status.pendingMessages > 0) {
    ctx.logger.info(`${status.pendingMessages} messages pending indexing, starting batch...`);
    // Run in background to not block startup
    indexAll()
      .then((count) => ctx?.logger.info(`Batch indexed ${count} message pairs`))
      .catch((err) => ctx?.logger.error(`Batch indexing error: ${err}`));
  }
}

export async function destroy() {
  ctx = null;
}

export const hooks = {
  async onSessionEnd(payload: { sessionId: number; sessionUuid: string }) {
    if (!ctx) return;

    try {
      // 1. Extract concepts and store as session_tags before indexing
      const concepts = tagSession(payload.sessionId);
      const tagSummary = [
        concepts.tools.length > 0 ? `tools: ${concepts.tools.slice(0, 5).join(",")}` : "",
        concepts.languages.length > 0 ? `lang: ${concepts.languages.join(",")}` : "",
        concepts.frameworks.length > 0 ? `fw: ${concepts.frameworks.join(",")}` : "",
      ].filter(Boolean).join(" | ");
      if (tagSummary) ctx.logger.info(`Tagged session ${payload.sessionUuid} — ${tagSummary}`);

      // 2. Index message pairs with tags injected into embeddings
      const count = await indexSession(payload.sessionId);
      if (count > 0) {
        ctx.logger.info(`Indexed ${count} message pairs for session ${payload.sessionUuid}`);
      }
    } catch (err) {
      ctx.logger.error(`Failed to process session ${payload.sessionUuid}: ${err}`);
    }
  },
};
