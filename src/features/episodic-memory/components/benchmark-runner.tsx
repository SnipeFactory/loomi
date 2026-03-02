"use client";

import { useState } from "react";

const DEFAULT_QUERIES = [
  "embedding model language detection",
  "episodic memory indexing",
  "adapter pattern implementation",
  "module slot registration",
  "session search hybrid RRF",
];

type BenchMode = "vector" | "text" | "both";

interface BenchRow {
  query: string;
  vector: number | null;
  text: number | null;
  both: number | null;
  vectorCount: number | null;
  textCount: number | null;
  bothCount: number | null;
}

const MODES: BenchMode[] = ["vector", "text", "both"];

async function runQuery(query: string, mode: BenchMode, limit: number): Promise<{ ms: number; count: number }> {
  const t0 = performance.now();
  const res = await fetch(`/api/memory?q=${encodeURIComponent(query)}&mode=${mode}&limit=${limit}`);
  const data = await res.json();
  return {
    ms: Math.round(performance.now() - t0),
    count: (data.results || []).length,
  };
}

export function BenchmarkRunner() {
  const [queriesText, setQueriesText] = useState(DEFAULT_QUERIES.join("\n"));
  const [limit, setLimit] = useState(10);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState("");
  const [rows, setRows] = useState<BenchRow[] | null>(null);

  const run = async () => {
    const queries = queriesText.split("\n").map((q) => q.trim()).filter(Boolean);
    if (queries.length === 0) return;

    setRunning(true);
    setRows(null);
    const results: BenchRow[] = [];

    for (const query of queries) {
      const row: BenchRow = {
        query,
        vector: null,
        text: null,
        both: null,
        vectorCount: null,
        textCount: null,
        bothCount: null,
      };

      for (const mode of MODES) {
        setProgress(`${query} / ${mode}...`);
        try {
          const { ms, count } = await runQuery(query, mode, limit);
          if (mode === "vector") { row.vector = ms; row.vectorCount = count; }
          if (mode === "text") { row.text = ms; row.textCount = count; }
          if (mode === "both") { row.both = ms; row.bothCount = count; }
        } catch {
          // keep null
        }
      }

      results.push(row);
    }

    setRows(results);
    setProgress("");
    setRunning(false);
  };

  const avg = (vals: (number | null)[]) => {
    const valid = vals.filter((v): v is number => v !== null);
    if (valid.length === 0) return null;
    return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
  };

  return (
    <div className="space-y-4">
      {/* Query input */}
      <div className="space-y-1">
        <label className="text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
          Queries (one per line)
        </label>
        <textarea
          value={queriesText}
          onChange={(e) => setQueriesText(e.target.value)}
          rows={5}
          className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-xs font-mono outline-none focus:ring-1 focus:ring-[hsl(var(--ring))] resize-y"
        />
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs text-[hsl(var(--muted-foreground))]">Limit</label>
          <input
            type="number"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            min={1}
            max={50}
            className="w-16 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1.5 text-xs outline-none"
          />
        </div>
        <button
          onClick={run}
          disabled={running}
          className="px-4 py-1.5 text-xs rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] disabled:opacity-50 disabled:cursor-not-allowed transition-colors hover:opacity-90"
        >
          {running ? "Running..." : "Run Benchmark"}
        </button>
        {progress && (
          <span className="text-[10px] text-[hsl(var(--muted-foreground))]">{progress}</span>
        )}
      </div>

      {/* Results table */}
      {rows && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="border-b border-[hsl(var(--border))]">
                <th className="text-left py-1.5 pr-4 text-[hsl(var(--muted-foreground))] font-medium">Query</th>
                <th className="text-right py-1.5 px-2 text-[hsl(var(--muted-foreground))] font-medium">vector (ms)</th>
                <th className="text-right py-1.5 px-2 text-[hsl(var(--muted-foreground))] font-medium">text (ms)</th>
                <th className="text-right py-1.5 px-2 text-[hsl(var(--muted-foreground))] font-medium">both (ms)</th>
                <th className="text-right py-1.5 pl-2 text-[hsl(var(--muted-foreground))] font-medium">results</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-[hsl(var(--border))]/50 hover:bg-[hsl(var(--muted))]/50">
                  <td className="py-1.5 pr-4 text-[hsl(var(--foreground))] max-w-[200px] truncate" title={row.query}>
                    {row.query}
                  </td>
                  <td className="text-right py-1.5 px-2 tabular-nums">{row.vector ?? "—"}</td>
                  <td className="text-right py-1.5 px-2 tabular-nums">{row.text ?? "—"}</td>
                  <td className="text-right py-1.5 px-2 tabular-nums">{row.both ?? "—"}</td>
                  <td className="text-right py-1.5 pl-2 tabular-nums text-[hsl(var(--muted-foreground))]">
                    v:{row.vectorCount ?? "—"} t:{row.textCount ?? "—"} b:{row.bothCount ?? "—"}
                  </td>
                </tr>
              ))}
              {/* Averages row */}
              <tr className="border-t border-[hsl(var(--border))] font-medium text-[hsl(var(--muted-foreground))]">
                <td className="py-1.5 pr-4">Average</td>
                <td className="text-right py-1.5 px-2 tabular-nums">{avg(rows.map((r) => r.vector)) ?? "—"}</td>
                <td className="text-right py-1.5 px-2 tabular-nums">{avg(rows.map((r) => r.text)) ?? "—"}</td>
                <td className="text-right py-1.5 px-2 tabular-nums">{avg(rows.map((r) => r.both)) ?? "—"}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
