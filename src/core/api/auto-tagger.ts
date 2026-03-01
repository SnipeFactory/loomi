/**
 * Auto-Tagger — heuristic concept extraction from session messages.
 *
 * Extracts: tool names, programming languages, frameworks, error types.
 * Stores results in sessions.session_tags (JSON array).
 * Tags are later injected into embeddings to improve search relevance.
 */

import { sql, eq } from "drizzle-orm";
import { getDb } from "../db";
import { sessions } from "../db/schema";

// ── Types ─────────────────────────────────────────────────────────

export interface SessionConcepts {
  tools: string[];
  languages: string[];
  frameworks: string[];
  errors: string[];
}

// ── Heuristics ────────────────────────────────────────────────────

const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  ts: "TypeScript", tsx: "TypeScript",
  js: "JavaScript", jsx: "JavaScript", mjs: "JavaScript",
  py: "Python", pyw: "Python",
  rs: "Rust",
  go: "Go",
  java: "Java",
  kt: "Kotlin",
  rb: "Ruby",
  php: "PHP",
  cs: "C#",
  cpp: "C++", cc: "C++", cxx: "C++",
  c: "C",
  swift: "Swift",
  sh: "Shell", bash: "Shell", zsh: "Shell",
  sql: "SQL",
  html: "HTML", htm: "HTML",
  css: "CSS", scss: "CSS", sass: "CSS",
  json: "JSON", yaml: "YAML", yml: "YAML", toml: "TOML",
  md: "Markdown",
};

const FRAMEWORK_PATTERNS: [RegExp, string][] = [
  [/\bnext\.?js\b/i, "Next.js"],
  [/\breact\b/i, "React"],
  [/\bvue\b/i, "Vue"],
  [/\bsvelte\b/i, "Svelte"],
  [/\bangular\b/i, "Angular"],
  [/\bexpress\b/i, "Express"],
  [/\bfastify\b/i, "Fastify"],
  [/\bhono\b/i, "Hono"],
  [/\bnestjs\b|\bnest\.js\b/i, "NestJS"],
  [/\bdrizzle\b/i, "Drizzle ORM"],
  [/\bprisma\b/i, "Prisma"],
  [/\bdjango\b/i, "Django"],
  [/\bfastapi\b/i, "FastAPI"],
  [/\bflask\b/i, "Flask"],
  [/\btailwind\b/i, "Tailwind CSS"],
  [/\bshadcn\b/i, "shadcn/ui"],
  [/\bsqlite\b/i, "SQLite"],
  [/\bpostgres\b|\bpostgresql\b/i, "PostgreSQL"],
  [/\bmysql\b/i, "MySQL"],
  [/\bredis\b/i, "Redis"],
  [/\bdocker\b/i, "Docker"],
  [/\bkubernetes\b|\bk8s\b/i, "Kubernetes"],
  [/\bgraphql\b/i, "GraphQL"],
  [/\btrpc\b/i, "tRPC"],
];

const ERROR_PATTERN = /\b(\w*(?:Error|Exception|Panic|Fatal|Traceback))\b/g;

const FILE_PATH_PATTERN = /(?:^|[\s`'"])(\/?(?:[\w.-]+\/)+[\w.-]+\.(\w+))/gm;

// ── Extraction ────────────────────────────────────────────────────

function extractFromMessages(
  messages: { role: string; textContent: string | null; toolUseJson: string | null }[]
): SessionConcepts {
  const tools = new Set<string>();
  const languages = new Set<string>();
  const frameworks = new Set<string>();
  const errors = new Set<string>();

  const fullText = messages.map((m) => m.textContent || "").join("\n");

  // Tools from tool_use_json
  for (const msg of messages) {
    if (!msg.toolUseJson) continue;
    try {
      const parsed = JSON.parse(msg.toolUseJson) as { name: string }[];
      for (const t of parsed) {
        if (t.name) tools.add(t.name);
      }
    } catch { /* ignore */ }
  }

  // Languages from file extensions in text
  let match: RegExpExecArray | null;
  const pathRe = new RegExp(FILE_PATH_PATTERN.source, "gm");
  while ((match = pathRe.exec(fullText)) !== null) {
    const ext = match[2]?.toLowerCase();
    if (ext && EXTENSION_TO_LANGUAGE[ext]) {
      languages.add(EXTENSION_TO_LANGUAGE[ext]);
    }
  }

  // Frameworks from text
  for (const [pattern, name] of FRAMEWORK_PATTERNS) {
    if (pattern.test(fullText)) {
      frameworks.add(name);
    }
  }

  // Error types
  const errorRe = new RegExp(ERROR_PATTERN.source, "g");
  while ((match = errorRe.exec(fullText)) !== null) {
    errors.add(match[1]);
  }

  return {
    tools: [...tools].slice(0, 20),
    languages: [...languages].slice(0, 10),
    frameworks: [...frameworks].slice(0, 10),
    errors: [...errors].slice(0, 15),
  };
}

// ── Public API ────────────────────────────────────────────────────

/**
 * Extract concepts from all messages in a session and store in sessions.session_tags.
 */
export function tagSession(sessionId: number): SessionConcepts {
  const db = getDb();

  const msgs = db.all(sql`
    SELECT role, text_content, tool_use_json
    FROM messages
    WHERE session_id = ${sessionId}
    ORDER BY sort_order ASC
  `) as { role: string; textContent: string | null; toolUseJson: string | null }[];

  // Drizzle returns camelCase via schema mapping but raw sql returns snake_case
  const normalized = msgs.map((m) => ({
    role: m.role,
    textContent: (m as unknown as Record<string, string | null>).text_content ?? m.textContent,
    toolUseJson: (m as unknown as Record<string, string | null>).tool_use_json ?? m.toolUseJson,
  }));

  const concepts = extractFromMessages(normalized);
  const allTags = [
    ...concepts.tools,
    ...concepts.languages,
    ...concepts.frameworks,
    ...concepts.errors,
  ];

  db.update(sessions)
    .set({ sessionTags: JSON.stringify(allTags) })
    .where(eq(sessions.id, sessionId))
    .run();

  return concepts;
}

/**
 * Get stored concepts for a session (returns null if not yet tagged).
 */
export function getSessionConcepts(sessionId: number): SessionConcepts | null {
  const db = getDb();

  const row = db
    .select({ sessionTags: sessions.sessionTags })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .get();

  if (!row?.sessionTags) return null;

  try {
    const tags: string[] = JSON.parse(row.sessionTags);

    // Reconstruct categories from flat tag list by matching known patterns
    const tools = tags.filter((t) =>
      ["read", "write", "edit", "bash", "search", "glob", "grep", "computer"].some((k) =>
        t.toLowerCase().includes(k)
      )
    );
    const languages = tags.filter((t) => Object.values(EXTENSION_TO_LANGUAGE).includes(t));
    const frameworks = tags.filter((t) =>
      FRAMEWORK_PATTERNS.some(([, name]) => name === t)
    );
    const errors = tags.filter((t) => /Error|Exception|Panic|Fatal/.test(t));

    return { tools, languages, frameworks, errors };
  } catch {
    return null;
  }
}

/**
 * Convert concepts to a compact string for appending to embeddings.
 */
export function conceptsToTagString(concepts: SessionConcepts): string {
  const parts: string[] = [];
  if (concepts.tools.length > 0) parts.push(`Tools: ${concepts.tools.join(", ")}`);
  if (concepts.languages.length > 0) parts.push(`Languages: ${concepts.languages.join(", ")}`);
  if (concepts.frameworks.length > 0) parts.push(`Frameworks: ${concepts.frameworks.join(", ")}`);
  if (concepts.errors.length > 0) parts.push(`Errors: ${concepts.errors.join(", ")}`);
  return parts.join(" | ");
}
