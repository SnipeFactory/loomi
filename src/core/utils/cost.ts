import { getDb } from "../db";
import { modelPricing } from "../db/schema";
import { eq } from "drizzle-orm";

// ── Hardcoded fallback (used when DB not yet initialized or no match) ──
const MODEL_PRICING: Record<
  string,
  { input: number; output: number; cacheWrite: number; cacheRead: number }
> = {
  "claude-opus-4-6": { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
  "claude-sonnet-4-6": { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4, cacheWrite: 1, cacheRead: 0.08 },
  "claude-sonnet-4-5-20250514": { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
};

const DEFAULT_PRICING = { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 };

// In-memory cache for DB pricing (refreshed lazily)
let pricingCache: { provider: string; pattern: string; input: number; output: number; cacheWrite: number | null; cacheRead: number | null }[] | null = null;
let pricingCacheTime = 0;
const CACHE_TTL_MS = 60_000;

function loadPricingFromDb(): typeof pricingCache {
  try {
    const db = getDb();
    const rows = db.select().from(modelPricing).all();
    return rows.map((r) => ({
      provider: r.provider,
      pattern: r.modelPattern,
      input: r.inputPerMillion,
      output: r.outputPerMillion,
      cacheWrite: r.cacheWritePerMillion,
      cacheRead: r.cacheReadPerMillion,
    }));
  } catch {
    return null;
  }
}

function getPricingCache() {
  const now = Date.now();
  if (!pricingCache || now - pricingCacheTime > CACHE_TTL_MS) {
    pricingCache = loadPricingFromDb();
    pricingCacheTime = now;
  }
  return pricingCache;
}

/** Simple glob matching: supports trailing * only */
function globMatch(pattern: string, value: string): boolean {
  if (pattern.endsWith("*")) {
    return value.startsWith(pattern.slice(0, -1));
  }
  return pattern === value;
}

function findDbPricing(provider: string | null, model: string): { input: number; output: number; cacheWrite: number; cacheRead: number } | null {
  const cache = getPricingCache();
  if (!cache) return null;

  // Try provider-specific match first, then any provider
  for (const row of cache) {
    if (provider && row.provider !== provider) continue;
    if (globMatch(row.pattern, model)) {
      return {
        input: row.input,
        output: row.output,
        cacheWrite: row.cacheWrite ?? 0,
        cacheRead: row.cacheRead ?? 0,
      };
    }
  }

  // Fallback: match any provider
  if (provider) {
    for (const row of cache) {
      if (globMatch(row.pattern, model)) {
        return {
          input: row.input,
          output: row.output,
          cacheWrite: row.cacheWrite ?? 0,
          cacheRead: row.cacheRead ?? 0,
        };
      }
    }
  }

  return null;
}

export function calculateCost(
  model: string | null,
  inputTokens: number,
  outputTokens: number,
  cacheCreationTokens: number,
  cacheReadTokens: number,
  provider?: string | null
): number {
  let pricing: { input: number; output: number; cacheWrite: number; cacheRead: number };

  if (model) {
    // 1. Try DB pricing
    const dbPricing = findDbPricing(provider ?? null, model);
    if (dbPricing) {
      pricing = dbPricing;
    } else {
      // 2. Fallback to hardcoded
      pricing = MODEL_PRICING[model] || DEFAULT_PRICING;
    }
  } else {
    pricing = DEFAULT_PRICING;
  }

  return (
    (inputTokens / 1_000_000) * pricing.input +
    (outputTokens / 1_000_000) * pricing.output +
    (cacheCreationTokens / 1_000_000) * pricing.cacheWrite +
    (cacheReadTokens / 1_000_000) * pricing.cacheRead
  );
}

// Re-export formatCost from client-safe module
export { formatCost } from "./format-cost";
