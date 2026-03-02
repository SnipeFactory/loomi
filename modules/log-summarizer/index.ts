import type { HookContext } from "../../src/core/modules/types";

let ctx: HookContext | null = null;

export async function init(hookCtx: HookContext) {
  ctx = hookCtx;
  ctx.logger.info("Session Summarizer initialized");
}

export async function destroy() {
  ctx = null;
}

// ── Local Summary (no API cost) ───────────────────────────────────────────────

function generateLocalSummary(sessionId: number): { summary: string; keywords: string } {
  if (!ctx) return { summary: "", keywords: "" };

  const messages = ctx.db.getMessages(sessionId) as any[];
  const textMsgs = messages.filter((m: any) => m.textContent?.trim());
  const userMsgs = textMsgs.filter((m: any) => m.role === "user");
  const asstMsgs = textMsgs.filter((m: any) => m.role === "assistant");

  const parts: string[] = [];
  // Head: first 3 user + first 2 assistant
  userMsgs.slice(0, 3).forEach((m: any) => parts.push(`User: ${String(m.textContent).slice(0, 300)}`));
  asstMsgs.slice(0, 2).forEach((m: any) => parts.push(`Assistant: ${String(m.textContent).slice(0, 200)}`));
  // Tail: last user + last assistant (if not already in head)
  if (userMsgs.length > 3)
    parts.push(`User: ${String(userMsgs[userMsgs.length - 1].textContent).slice(0, 300)}`);
  if (asstMsgs.length > 2)
    parts.push(`Assistant: ${String(asstMsgs[asstMsgs.length - 1].textContent).slice(0, 200)}`);

  const summary = parts.join("\n");

  // Keyword extraction: top-8 frequent non-stopword words
  const STOPWORDS = new Set([
    "the","a","an","is","are","was","were","be","been","being","have","has","had",
    "do","does","did","will","would","should","could","may","might","can","to","of",
    "in","on","at","by","for","with","about","from","this","that","it","i","you",
    "we","they","and","or","but","not","so","if","as","how","what","when","where",
    "which","who","why","my","your","our","their","its","just","also","then","now",
    "here","there","use","used","using","need","make","made","get","set","run",
  ]);
  const allText = textMsgs.map((m: any) => String(m.textContent)).join(" ").toLowerCase();
  const freq = new Map<string, number>();
  (allText.match(/[a-z][a-z0-9_-]{2,}/g) || []).forEach((w) => {
    if (!STOPWORDS.has(w)) freq.set(w, (freq.get(w) || 0) + 1);
  });
  const keywords = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([w]) => w)
    .join(", ");

  return { summary, keywords };
}

// ── AI Summary ────────────────────────────────────────────────────────────────

const MODEL_TIMEOUT_MS = 30_000;

async function callModel(apiKey: string, model: string, prompt: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] }),
      signal: controller.signal,
    });

    // Retryable: rate-limit, quota exceeded, service unavailable
    if (response.status === 429 || response.status === 402 || response.status === 503) {
      return null;
    }
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`OpenRouter ${response.status}: ${body.slice(0, 200)}`);
    }
    const result = await response.json();
    return result.choices?.[0]?.message?.content ?? null;
  } catch (err) {
    if ((err as Error).name === "AbortError") {
      return null; // timeout → treat as retryable, try next model
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function buildPrompt(sessionId: number): string {
  if (!ctx) return "";
  const messages = ctx.db.getMessages(sessionId) as any[];
  const text = messages
    .filter((m: any) => m.textContent)
    .map((m: any) => `${m.role}: ${String(m.textContent).slice(0, 500)}`)
    .slice(0, 20)
    .join("\n");
  return (
    `Summarize this coding session in exactly 3 lines and extract 3-5 keywords. ` +
    `IMPORTANT: Respond in the same language as the conversation below.\n\n` +
    `Conversation:\n${text}\n\nFormat:\nSummary: <3 lines>\nKeywords: <comma-separated>`
  );
}

function parseAiText(text: string): { summary: string; keywords: string } {
  const summaryMatch = text.match(/Summary:\s*([\s\S]*?)(?:Keywords:|$)/i);
  const keywordsMatch = text.match(/Keywords:\s*(.*)/i);
  return {
    summary: summaryMatch?.[1]?.trim() || text.slice(0, 500),
    keywords: keywordsMatch?.[1]?.trim() || "",
  };
}

function getModelsToTry(): string[] {
  if (!ctx) return [];
  const mode = (ctx.settings.mode as string) || "manual";

  if (mode === "auto-swap" || mode === "manual") {
    const free = Array.isArray(ctx.settings.freeModelList)
      ? (ctx.settings.freeModelList as string[])
      : [];
    const paid = (ctx.settings.paidFallbackModel as string) || "";
    return paid ? [...free, paid] : [...free];
  }

  if (mode === "auto-fix") {
    const model = (ctx.settings.fixedModel as string) || "anthropic/claude-3-haiku";
    return [model];
  }

  return [];
}

/** Generate AI summary — called via HTTP API (manual) or onSessionEnd (auto). */
export async function summarize(
  sessionId: number,
  sessionUuid: string,
): Promise<{ summary: string; keywords: string; code?: string } | null> {
  if (!ctx) return null;

  const apiKey = (ctx.settings.apiKey as string) || process.env.OPENROUTER_API_KEY || "";
  if (!apiKey) {
    ctx.logger.warn("No OpenRouter API key configured");
    return { summary: "", keywords: "", code: "NO_API_KEY" };
  }

  const prompt = buildPrompt(sessionId);
  if (!prompt.trim()) return { summary: "", keywords: "", code: "NO_CONTENT" };

  const models = getModelsToTry();
  if (models.length === 0) return { summary: "", keywords: "", code: "NO_MODELS" };

  for (const model of models) {
    try {
      const text = await callModel(apiKey, model, prompt);
      if (text === null) {
        ctx.logger.warn(`${model} rate-limited, trying next...`);
        continue;
      }
      const parsed = parseAiText(text);
      ctx.db.setModuleData(`summary:${sessionUuid}`, parsed);
      ctx.logger.info(`AI summary stored for ${sessionUuid} via ${model}`);
      return parsed;
    } catch (err) {
      ctx.logger.error(`${model} failed: ${err}`);
    }
  }

  ctx.logger.warn(`All models exhausted for session ${sessionUuid}`);
  return { summary: "", keywords: "", code: "ALL_MODELS_FAILED" };
}

export const hooks = {
  async onSessionEnd(payload: { sessionId: number; sessionUuid: string }) {
    if (!ctx) return;

    // 1. Always generate local summary (free, synchronous)
    const local = generateLocalSummary(payload.sessionId);
    if (local.summary.trim()) {
      ctx.db.setModuleData(`local-summary:${payload.sessionUuid}`, local);
      ctx.logger.info(`Local summary stored for ${payload.sessionUuid}`);
    }

    // 2. If auto mode, generate AI summary (awaited — episodic-memory waits 5s)
    const mode = (ctx.settings.mode as string) || "manual";
    if (mode === "auto-swap" || mode === "auto-fix") {
      try {
        await summarize(payload.sessionId, payload.sessionUuid);
      } catch (err) {
        ctx.logger.error(`Auto AI summary failed for ${payload.sessionUuid}: ${err}`);
      }
    }
  },
};
