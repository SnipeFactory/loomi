import type { HookContext } from "../../src/core/modules/types";

let ctx: HookContext | null = null;

export async function init(hookCtx: HookContext) {
  ctx = hookCtx;
  ctx.logger.info("Session Summarizer initialized");
}

export async function destroy() {
  ctx = null;
}

/** Generate summary for a specific session (called via API) */
export async function summarize(sessionId: number, sessionUuid: string): Promise<{ summary: string; keywords: string; code?: string } | null> {
  if (!ctx) return null;

  const apiKey = (ctx.settings.apiKey as string) || process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    ctx.logger.warn("OpenRouter API key not configured — set it in module settings or OPENROUTER_API_KEY env var");
    return { summary: "", keywords: "", code: "NO_API_KEY" };
  }

  const messages = ctx.db.getMessages(sessionId) as any[];

  const conversationText = messages
    .filter((m: any) => m.textContent)
    .map((m: any) => `${m.role}: ${(m.textContent || "").slice(0, 500)}`)
    .slice(0, 20)
    .join("\n");

  if (!conversationText.trim()) {
    return { summary: "", keywords: "", code: "NO_CONTENT" };
  }

  const model = (ctx.settings.summaryModel as string) || "openrouter/auto";

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{
        role: "user",
        content: `Summarize this coding session in exactly 3 lines and extract 3-5 keywords. IMPORTANT: Respond in the same language as the conversation below.\n\nConversation:\n${conversationText}\n\nFormat:\nSummary: <3 lines>\nKeywords: <comma-separated>`,
      }],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    ctx.logger.error(`OpenRouter API error: ${response.status} ${errorBody}`);
    throw new Error(`OpenRouter API error: ${response.status}`);
  }

  const result = await response.json();
  const text = result.choices?.[0]?.message?.content || "";

  const summaryMatch = text.match(/Summary:\s*([\s\S]*?)(?:Keywords:|$)/i);
  const keywordsMatch = text.match(/Keywords:\s*(.*)/i);

  const summary = summaryMatch?.[1]?.trim() || text.slice(0, 500);
  const keywords = keywordsMatch?.[1]?.trim() || "";

  // Store
  ctx.db.setModuleData(`summary:${sessionUuid}`, { summary, keywords });
  ctx.logger.info(`Generated summary for session ${sessionUuid}`);

  return { summary, keywords };
}

export const hooks = {};
