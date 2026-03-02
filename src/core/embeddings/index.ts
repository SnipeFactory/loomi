/**
 * Local embedding engine using Transformers.js.
 * Runs 100% locally — no API calls.
 *
 * Supports multiple models simultaneously, each with its own TTL-based auto-unload.
 * Model loaded on first use, disposed after EMBEDDING_TTL_MS of inactivity (default 10 min).
 *
 * Model → vector table registry:
 *   Xenova/all-MiniLM-L6-v2                       → vec_messages
 *   Xenova/paraphrase-multilingual-MiniLM-L12-v2   → vec_messages_ml
 */

import path from "path";

export const MODEL_TABLE_REGISTRY: Record<string, string> = {
  "Xenova/all-MiniLM-L6-v2": "vec_messages",
  "Xenova/paraphrase-multilingual-MiniLM-L12-v2": "vec_messages_ml",
};

export const DEFAULT_MODEL = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";

const MAX_TEXT_LENGTH = 2000;
const CACHE_DIR = path.resolve(process.cwd(), "data", "models");
const MODEL_TTL_MS = parseInt(process.env.EMBEDDING_TTL_MS || "600000", 10); // 10 minutes

interface ModelState {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pipeline: any | null;
  lastUsedAt: number;
  ttlTimer: NodeJS.Timeout | null;
  loadPromise: Promise<void> | null;
}

const modelStates = new Map<string, ModelState>();

function getOrCreateState(modelName: string): ModelState {
  if (!modelStates.has(modelName)) {
    modelStates.set(modelName, {
      pipeline: null,
      lastUsedAt: 0,
      ttlTimer: null,
      loadPromise: null,
    });
  }
  return modelStates.get(modelName)!;
}

async function getTransformers() {
  const transformers = await import("@xenova/transformers");
  transformers.env.cacheDir = CACHE_DIR;
  (transformers.env as Record<string, unknown>).allowLocalModels = true;
  return transformers;
}

async function getOrLoadPipeline(modelName: string): Promise<void> {
  const state = getOrCreateState(modelName);
  if (state.pipeline) return;
  if (!state.loadPromise) {
    state.loadPromise = (async () => {
      const t = await getTransformers();
      state.pipeline = await t.pipeline("feature-extraction", modelName, { quantized: true });
      console.log("[Loomi] Embedding model loaded:", modelName);
    })();
  }
  await state.loadPromise;
}

function scheduleTtlCheck(modelName: string): void {
  const state = getOrCreateState(modelName);
  if (state.ttlTimer) clearTimeout(state.ttlTimer);

  state.ttlTimer = setTimeout(async () => {
    state.ttlTimer = null;
    if (state.pipeline && Date.now() - state.lastUsedAt >= MODEL_TTL_MS) {
      await state.pipeline.dispose();
      state.pipeline = null;
      state.loadPromise = null;
      console.log("[Loomi] Embedding model unloaded (TTL expired):", modelName);
    } else if (state.pipeline) {
      const remaining = MODEL_TTL_MS - (Date.now() - state.lastUsedAt);
      state.ttlTimer = setTimeout(() => scheduleTtlCheck(modelName), Math.max(remaining, 1000));
      state.ttlTimer.unref();
    }
  }, MODEL_TTL_MS);
  state.ttlTimer.unref();
}

function touchModel(modelName: string): void {
  const state = getOrCreateState(modelName);
  state.lastUsedAt = Date.now();
  scheduleTtlCheck(modelName);
}

/**
 * Generate a 384-dimensional embedding using a specific model.
 */
export async function generateEmbeddingWithModel(text: string, modelName: string): Promise<number[]> {
  await getOrLoadPipeline(modelName);
  touchModel(modelName);
  const state = getOrCreateState(modelName);
  const output = await state.pipeline(text.slice(0, MAX_TEXT_LENGTH), { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array);
}

/**
 * Generate a 384-dimensional embedding using the multilingual model.
 */
export async function generateMultilingualEmbedding(text: string): Promise<number[]> {
  return generateEmbeddingWithModel(text, DEFAULT_MODEL);
}

/**
 * Generate a 384-dimensional embedding.
 * Kept for backward compatibility; delegates to the multilingual model.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  return generateMultilingualEmbedding(text);
}

/**
 * Generate a multilingual embedding for a user+assistant message pair.
 */
export async function generateMultilingualMessagePairEmbedding(
  userMessage: string,
  assistantMessage: string,
  toolNames?: string[],
  sessionTagString?: string
): Promise<number[]> {
  return generateMessagePairEmbeddingWithModel(userMessage, assistantMessage, DEFAULT_MODEL, toolNames, sessionTagString);
}

/**
 * Generate an embedding for a user+assistant message pair using a specific model.
 */
export async function generateMessagePairEmbeddingWithModel(
  userMessage: string,
  assistantMessage: string,
  modelName: string,
  toolNames?: string[],
  sessionTagString?: string
): Promise<number[]> {
  const parts = [userMessage, assistantMessage];
  if (toolNames && toolNames.length > 0) parts.push(`Tools: ${toolNames.join(", ")}`);
  if (sessionTagString) parts.push(sessionTagString);
  return generateEmbeddingWithModel(parts.join("\n\n"), modelName);
}

/**
 * Generate an embedding for a message pair.
 * Kept for backward compatibility; delegates to multilingual.
 */
export async function generateMessagePairEmbedding(
  userMessage: string,
  assistantMessage: string,
  toolNames?: string[],
  sessionTagString?: string
): Promise<number[]> {
  return generateMultilingualMessagePairEmbedding(userMessage, assistantMessage, toolNames, sessionTagString);
}

/**
 * Dispose all loaded models immediately (e.g. graceful shutdown).
 */
export async function disposeEmbeddings(): Promise<void> {
  const disposePromises: Promise<void>[] = [];
  for (const [modelName, state] of modelStates.entries()) {
    if (state.ttlTimer) {
      clearTimeout(state.ttlTimer);
      state.ttlTimer = null;
    }
    if (state.pipeline) {
      disposePromises.push(
        Promise.resolve(state.pipeline.dispose()).then(() => {
          state.pipeline = null;
          state.loadPromise = null;
          console.log("[Loomi] Embedding model disposed:", modelName);
        })
      );
    }
  }
  await Promise.allSettled(disposePromises);
}

/** No-op: kept for backward compatibility. Models load lazily on first use. */
export async function initEmbeddings(): Promise<void> { /* no-op */ }

/** No-op: kept for backward compatibility. Models load lazily on first use. */
export async function initMultilingualEmbeddings(): Promise<void> { /* no-op */ }
