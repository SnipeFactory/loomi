import type { HookContext } from "../../src/core/modules/types";
import { indexSession, indexAll, indexSessionSummary, indexAllSessionSummaries, getIndexingStatus } from "../../src/core/api/memory";
import { tagSession } from "../../src/core/api/auto-tagger";

let ctx: HookContext | null = null;

export async function init(hookCtx: HookContext) {
  ctx = hookCtx;
  ctx.logger.info("Episodic Memory initialized");

  const status = getIndexingStatus();

  // Background batch indexing of unindexed messages
  if (status.pendingMessages > 0) {
    ctx.logger.info(`${status.pendingMessages} messages pending indexing, starting batch...`);
    indexAll()
      .then((count) => ctx?.logger.info(`Batch indexed ${count} message pairs`))
      .catch((err) => ctx?.logger.error(`Batch indexing error: ${err}`));
  }

  // Background session summary indexing (covers sessions skipped at startup)
  if (status.pendingSessionSummaries > 0) {
    ctx.logger.info(`${status.pendingSessionSummaries} session summaries pending indexing, starting batch...`);
    indexAllSessionSummaries()
      .then((count) => ctx?.logger.info(`Batch indexed ${count} session summaries`))
      .catch((err) => ctx?.logger.error(`Session summary batch indexing error: ${err}`));
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

      // 3. Attempt session summary indexing after 5s delay
      //    (log-summarizer must run first to write module_data)
      const timer = setTimeout(async () => {
        try {
          const ok = await indexSessionSummary(payload.sessionId);
          if (ok) ctx?.logger.info(`Indexed session summary for ${payload.sessionUuid}`);
        } catch { /* no summary yet — will be indexed on next indexAll() */ }
      }, 5_000);
      timer.unref();
    } catch (err) {
      ctx.logger.error(`Failed to process session ${payload.sessionUuid}: ${err}`);
    }
  },
};
