/**
 * Local embedding engine using Transformers.js.
 * Runs 100% locally — no API calls.
 *
 * EN model:  Xenova/all-MiniLM-L6-v2               (384d, English-optimized)
 * ML model:  Xenova/paraphrase-multilingual-MiniLM-L12-v2 (384d, 50+ languages incl. Korean)
 */

import path from "path";

const EN_MODEL = "Xenova/all-MiniLM-L6-v2";
const ML_MODEL = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";
const MAX_TEXT_LENGTH = 2000;
const CACHE_DIR = path.resolve(process.cwd(), "data", "models");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let enPipeline: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let mlPipeline: any = null;

async function getTransformers() {
  const transformers = await import("@xenova/transformers");
  transformers.env.cacheDir = CACHE_DIR;
  (transformers.env as Record<string, unknown>).allowLocalModels = true;
  return transformers;
}

export async function initEmbeddings(): Promise<void> {
  if (enPipeline) return;
  const transformers = await getTransformers();
  enPipeline = await transformers.pipeline("feature-extraction", EN_MODEL, { quantized: true });
  console.log("[Loomi] EN embedding model loaded:", EN_MODEL);
}

export async function initMultilingualEmbeddings(): Promise<void> {
  if (mlPipeline) return;
  const transformers = await getTransformers();
  mlPipeline = await transformers.pipeline("feature-extraction", ML_MODEL, { quantized: true });
  console.log("[Loomi] ML embedding model loaded:", ML_MODEL);
}

export async function disposeEmbeddings(): Promise<void> {
  await Promise.allSettled([
    enPipeline?.dispose(),
    mlPipeline?.dispose(),
  ]);
  enPipeline = null;
  mlPipeline = null;
}

/**
 * Generate a 384-dimensional embedding using the English model.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  await initEmbeddings();
  const output = await enPipeline(text.slice(0, MAX_TEXT_LENGTH), { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array);
}

/**
 * Generate a 384-dimensional embedding using the multilingual model (Korean/English/etc.).
 */
export async function generateMultilingualEmbedding(text: string): Promise<number[]> {
  await initMultilingualEmbeddings();
  const output = await mlPipeline(text.slice(0, MAX_TEXT_LENGTH), { pooling: "mean", normalize: true });
  return Array.from(output.data as Float32Array);
}

/**
 * Generate an EN embedding for a user+assistant message pair.
 */
export async function generateMessagePairEmbedding(
  userMessage: string,
  assistantMessage: string,
  toolNames?: string[],
  sessionTagString?: string
): Promise<number[]> {
  const parts = [userMessage, assistantMessage];
  if (toolNames && toolNames.length > 0) parts.push(`Tools: ${toolNames.join(", ")}`);
  if (sessionTagString) parts.push(sessionTagString);
  return generateEmbedding(parts.join("\n\n"));
}

/**
 * Generate an ML (multilingual) embedding for a user+assistant message pair.
 */
export async function generateMultilingualMessagePairEmbedding(
  userMessage: string,
  assistantMessage: string,
  toolNames?: string[],
  sessionTagString?: string
): Promise<number[]> {
  const parts = [userMessage, assistantMessage];
  if (toolNames && toolNames.length > 0) parts.push(`Tools: ${toolNames.join(", ")}`);
  if (sessionTagString) parts.push(sessionTagString);
  return generateMultilingualEmbedding(parts.join("\n\n"));
}
