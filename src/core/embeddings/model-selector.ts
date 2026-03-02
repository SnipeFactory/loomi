/**
 * Language-based embedding model selector.
 *
 * Uses franc (ISO 639-3 codes) for language detection.
 * Language → model mapping is configurable via episodic-memory module settings.
 */

import { getDb } from "../db";
import { moduleSettings } from "../db/schema";
import { eq } from "drizzle-orm";
import { DEFAULT_MODEL } from "./index";

const EPISODIC_MEMORY_MODULE_ID = "episodic-memory";

export interface EmbeddingConfig {
  defaultModel: string;
  /** ISO 639-3 language code → model name (e.g. { "kor": "Xenova/paraphrase-...", "eng": "Xenova/all-MiniLM-..." }) */
  languageModelMap: Record<string, string>;
}

/**
 * Read embedding config from episodic-memory module settings.
 * Falls back to DEFAULT_MODEL if not configured.
 */
export function getEmbeddingConfig(): EmbeddingConfig {
  try {
    const db = getDb();
    const rows = db.select().from(moduleSettings)
      .where(eq(moduleSettings.moduleId, EPISODIC_MEMORY_MODULE_ID))
      .all();

    const raw: Record<string, string> = {};
    for (const row of rows) {
      try {
        raw[row.key] = JSON.parse(row.value || "null") as string;
      } catch {
        raw[row.key] = row.value || "";
      }
    }

    let langMap: Record<string, string> = {};
    if (raw.languageModelMap) {
      try {
        langMap = JSON.parse(raw.languageModelMap);
      } catch { /* ignore malformed JSON */ }
    }

    return {
      defaultModel: raw.defaultModel || DEFAULT_MODEL,
      languageModelMap: langMap,
    };
  } catch {
    return { defaultModel: DEFAULT_MODEL, languageModelMap: {} };
  }
}

/**
 * Fast script-based language detection for unambiguous non-Latin scripts.
 * Returns ISO 639-3 code if a distinctive script is found, null otherwise.
 */
function detectByScript(text: string): string | null {
  if (/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/.test(text)) return "kor"; // Hangul
  if (/[\u3040-\u30FF]/.test(text)) return "jpn";                           // Hiragana/Katakana
  if (/[\u0600-\u06FF]/.test(text)) return "ara";                           // Arabic
  if (/[\u0400-\u04FF]/.test(text)) return "rus";                           // Cyrillic
  if (/[\u4E00-\u9FFF\u3400-\u4DBF]/.test(text)) return "cmn";             // CJK (Chinese)
  return null;
}

/**
 * Detect language of text.
 *
 * Two-stage approach:
 *   1. Script detection — unambiguous for Hangul, CJK, Arabic, Cyrillic (no false positives)
 *   2. francAll — for Latin-script text, tries to match against configuredLanguages first.
 *      A configured language is accepted if its score is ≥ 85% of the top result's score,
 *      handling cases like sco/eng confusion (sco=1.0, eng=0.95 → eng wins as configured).
 *      Falls back to "und" if no confident match is found.
 *
 * @param configuredLanguages  ISO 639-3 codes from languageModelMap — used to prefer
 *                             known-configured languages over similar dialect matches.
 */
export async function detectLanguage(text: string, configuredLanguages?: string[]): Promise<string> {
  const sample = text.trim();
  if (sample.length < 10) return "und";

  // Stage 1: script detection (fast, unambiguous)
  const scriptLang = detectByScript(sample);
  if (scriptLang) return scriptLang;

  // Stage 2: francAll with confidence logic
  const { francAll } = await import("franc");
  const results = francAll(sample.slice(0, 500)) as [string, number][];
  if (results.length === 0) return "und";

  const [topLang, topScore] = results[0];

  // If caller provided configured languages, prefer the highest-scoring one
  // that's within 85% of the top result's score (handles sco/eng dialect confusion)
  if (configuredLanguages && configuredLanguages.length > 0) {
    const match = results.find(([lang, score]) =>
      configuredLanguages.includes(lang) && score >= topScore * 0.85
    );
    if (match) return match[0];
  }

  // Fallback: use top result only if no configured language matched
  // Require reasonable absolute score to avoid low-confidence guesses
  return topScore >= 0.7 ? topLang : "und";
}

/**
 * Select the appropriate embedding model for the given text.
 * Detects language → looks up config → returns model name.
 */
export async function selectModelForText(text: string): Promise<string> {
  const config = getEmbeddingConfig();
  const configuredLanguages = Object.keys(config.languageModelMap);
  const lang = await detectLanguage(text, configuredLanguages);
  return config.languageModelMap[lang] || config.defaultModel;
}
