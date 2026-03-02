"use client";

import { useState } from "react";

interface MessageResult {
  messageId: number;
  sessionUuid: string;
  sessionTitle: string | null;
  projectPath: string | null;
  userText: string | null;
  assistantText: string | null;
  timestamp: string;
  score: number;
  source: "vector" | "vector-ml" | "fts";
}

interface SessionResult {
  sessionId: number;
  sessionUuid: string;
  sessionTitle: string | null;
  projectPath: string | null;
  summary: string | null;
  keywords: string | null;
  sessionTags: string | null;
  lastActivityAt: string;
  score: number;
  source: "vector-session" | "fts-session";
}

const SOURCE_COLORS: Record<string, string> = {
  vector: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  "vector-ml": "bg-purple-500/10 text-purple-600 border-purple-500/20",
  fts: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  "vector-session": "bg-blue-500/10 text-blue-600 border-blue-500/20",
  "fts-session": "bg-amber-500/10 text-amber-600 border-amber-500/20",
};

function SourceBadge({ source }: { source: string }) {
  const cls = SOURCE_COLORS[source] || "bg-gray-500/10 text-gray-600 border-gray-500/20";
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>
      {source}
    </span>
  );
}

export function SearchLab() {
  const [tab, setTab] = useState<"messages" | "sessions">("messages");
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"both" | "vector" | "vector-ml" | "text">("both");
  const [limit, setLimit] = useState(10);
  const [results, setResults] = useState<MessageResult[] | SessionResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState<number | null>(null);

  const run = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setResults(null);
    const t0 = performance.now();
    try {
      let url = `/api/memory?q=${encodeURIComponent(query)}&limit=${limit}`;
      if (tab === "sessions") {
        url += "&target=sessions";
      } else {
        url += `&mode=${mode}`;
      }
      const res = await fetch(url);
      const data = await res.json();
      setResults(data.results || []);
      setElapsed(Math.round(performance.now() - t0));
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex gap-1 border-b border-[hsl(var(--border))]">
        {(["messages", "sessions"] as const).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setResults(null); }}
            className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors capitalize ${
              tab === t
                ? "border-[hsl(var(--primary))] text-[hsl(var(--foreground))]"
                : "border-transparent text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Controls */}
      <div className="flex gap-2 flex-wrap items-end">
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
            placeholder="Search query..."
            className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
          />
        </div>
        {tab === "messages" && (
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as typeof mode)}
            className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1.5 text-xs outline-none"
          >
            <option value="both">both</option>
            <option value="vector">vector (EN)</option>
            <option value="vector-ml">vector-ml</option>
            <option value="text">text (FTS)</option>
          </select>
        )}
        <input
          type="number"
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
          min={1}
          max={50}
          className="w-16 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1.5 text-xs outline-none"
        />
        <button
          onClick={run}
          disabled={loading || !query.trim()}
          className="px-3 py-1.5 text-xs rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] disabled:opacity-50 disabled:cursor-not-allowed transition-colors hover:opacity-90"
        >
          {loading ? "Searching..." : "Search"}
        </button>
      </div>

      {/* Results */}
      {elapsed !== null && results !== null && (
        <div className="text-[10px] text-[hsl(var(--muted-foreground))]">
          {results.length} results in {elapsed}ms
        </div>
      )}

      {results !== null && results.length === 0 && (
        <div className="text-xs text-[hsl(var(--muted-foreground))] py-4 text-center">No results</div>
      )}

      {tab === "messages" && results !== null && (results as MessageResult[]).map((r) => (
        <div key={r.messageId} className="rounded-md border border-[hsl(var(--border))] p-3 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <SourceBadge source={r.source} />
            <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
              score: {r.score.toFixed(4)}
            </span>
            <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
              {new Date(r.timestamp).toLocaleDateString()}
            </span>
          </div>
          <div className="text-xs font-medium text-[hsl(var(--foreground))] truncate">
            {r.sessionTitle || r.sessionUuid}
          </div>
          {r.userText && (
            <div className="text-xs text-[hsl(var(--muted-foreground))] line-clamp-2">
              {r.userText.slice(0, 200)}
            </div>
          )}
        </div>
      ))}

      {tab === "sessions" && results !== null && (results as SessionResult[]).map((r) => (
        <div key={r.sessionId} className="rounded-md border border-[hsl(var(--border))] p-3 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <SourceBadge source={r.source} />
            <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
              score: {r.score.toFixed(4)}
            </span>
            <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
              {new Date(r.lastActivityAt).toLocaleDateString()}
            </span>
          </div>
          <div className="text-xs font-medium text-[hsl(var(--foreground))] truncate">
            {r.sessionTitle || r.sessionUuid}
          </div>
          {r.summary && (
            <div className="text-xs text-[hsl(var(--muted-foreground))] line-clamp-2">
              {r.summary.slice(0, 200)}
            </div>
          )}
          {r.keywords && (
            <div className="text-[10px] text-[hsl(var(--muted-foreground))]">
              Keywords: {r.keywords}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
