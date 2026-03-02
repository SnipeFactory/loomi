"use client";

import { useState } from "react";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface WorkerHealth {
  status: "ready" | "restarting" | "dead";
  lastAlive: number | null;
  restartCount: number;
  pendingRequests: number;
}

interface IndexingStatus {
  totalMessages: number;
  indexedMessages: number;
  pendingMessages: number;
  indexedSessionSummaries: number;
  totalSessionsWithSummary: number;
}

function McpStatusBar() {
  const { data: health } = useSWR<WorkerHealth>("/api/memory?action=worker-health", fetcher, { refreshInterval: 5000 });
  const { data: status } = useSWR<IndexingStatus>("/api/memory?action=status", fetcher, { refreshInterval: 10000 });

  const workerColor =
    health?.status === "ready" ? "bg-green-500" :
    health?.status === "restarting" ? "bg-yellow-500" :
    health?.status === "dead" ? "bg-red-500" :
    "bg-[hsl(var(--muted-foreground))]";

  const workerLabel = health?.status ?? "unknown";

  const msgPct = status && status.totalMessages > 0
    ? Math.round((status.indexedMessages / status.totalMessages) * 100)
    : null;

  const sessPct = status && status.totalSessionsWithSummary > 0
    ? Math.round((status.indexedSessionSummaries / status.totalSessionsWithSummary) * 100)
    : null;

  return (
    <div className="flex items-center gap-3 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))/40] px-3 py-2 text-[10px]">
      {/* Worker badge */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span className={`h-1.5 w-1.5 rounded-full ${workerColor}`} />
        <span className="font-mono text-[hsl(var(--foreground))]">worker</span>
        <span className="text-[hsl(var(--muted-foreground))]">{workerLabel}</span>
      </div>
      <span className="text-[hsl(var(--border))]">|</span>
      {/* Message index */}
      <div className="flex items-center gap-1 text-[hsl(var(--muted-foreground))]">
        <span>msg</span>
        <span className="font-mono text-[hsl(var(--foreground))]">
          {status ? `${status.indexedMessages}/${status.totalMessages}` : "—"}
        </span>
        {msgPct !== null && <span className="text-[hsl(var(--muted-foreground))]">({msgPct}%)</span>}
      </div>
      <span className="text-[hsl(var(--border))]">|</span>
      {/* Session index */}
      <div className="flex items-center gap-1 text-[hsl(var(--muted-foreground))]">
        <span>sess</span>
        <span className="font-mono text-[hsl(var(--foreground))]">
          {status ? `${status.indexedSessionSummaries}/${status.totalSessionsWithSummary}` : "—"}
        </span>
        {sessPct !== null && <span className="text-[hsl(var(--muted-foreground))]">({sessPct}%)</span>}
      </div>
      {health?.restartCount ? (
        <>
          <span className="text-[hsl(var(--border))]">|</span>
          <span className="text-yellow-500">restarts: {health.restartCount}</span>
        </>
      ) : null}
    </div>
  );
}

type McpTool = "search" | "sessions" | "status" | "show";

interface ToolConfig {
  label: string;
  fields: { key: string; label: string; placeholder: string; required?: boolean }[];
}

const TOOL_CONFIGS: Record<McpTool, ToolConfig> = {
  search: {
    label: "search — message-level hybrid search",
    fields: [
      { key: "q", label: "Query", placeholder: "Enter search query", required: true },
      { key: "mode", label: "Mode", placeholder: "both / vector / vector-ml / text" },
      { key: "limit", label: "Limit", placeholder: "10" },
      { key: "project", label: "Project filter", placeholder: "e.g. loomi" },
    ],
  },
  sessions: {
    label: "sessions — session-level search",
    fields: [
      { key: "q", label: "Query", placeholder: "Enter search query", required: true },
      { key: "limit", label: "Limit", placeholder: "10" },
      { key: "project", label: "Project filter", placeholder: "e.g. loomi" },
    ],
  },
  status: {
    label: "status — indexing status",
    fields: [],
  },
  show: {
    label: "show — read a specific session",
    fields: [
      { key: "q", label: "Session UUID", placeholder: "session uuid", required: true },
    ],
  },
};

export function McpTester() {
  const [tool, setTool] = useState<McpTool>("search");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [result, setResult] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState<number | null>(null);

  const config = TOOL_CONFIGS[tool];

  const runTool = async () => {
    setLoading(true);
    setResult(null);
    const t0 = performance.now();
    try {
      if (tool === "status") {
        const res = await fetch("/api/memory?action=status");
        setResult(await res.json());
      } else if (tool === "search" || tool === "sessions") {
        const q = fields.q || "";
        const params = new URLSearchParams({ q });
        if (tool === "sessions") {
          params.set("target", "sessions");
        } else {
          if (fields.mode) params.set("mode", fields.mode);
        }
        if (fields.limit) params.set("limit", fields.limit);
        if (fields.project) params.set("project", fields.project);
        const res = await fetch(`/api/memory?${params}`);
        setResult(await res.json());
      } else if (tool === "show") {
        // For show, we just display the session UUID — no direct HTTP endpoint maps to MCP show
        // We'll simulate by showing the message
        setResult({ note: "MCP show tool reads from local IPC — see MCP server output", sessionUuid: fields.q });
      }
      setElapsed(Math.round(performance.now() - t0));
    } catch (e) {
      setResult({ error: String(e) });
    } finally {
      setLoading(false);
    }
  };

  const canRun = tool === "status" || (config.fields.find((f) => f.required) ? !!fields.q?.trim() : true);

  return (
    <div className="space-y-4">
      {/* Live MCP status */}
      <McpStatusBar />

      {/* Tool selector */}
      <div className="space-y-1">
        <label className="text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Tool</label>
        <select
          value={tool}
          onChange={(e) => { setTool(e.target.value as McpTool); setFields({}); setResult(null); }}
          className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-1.5 text-xs outline-none"
        >
          {(Object.keys(TOOL_CONFIGS) as McpTool[]).map((t) => (
            <option key={t} value={t}>{t} — {TOOL_CONFIGS[t].label}</option>
          ))}
        </select>
      </div>

      {/* Dynamic fields */}
      {config.fields.map((f) => (
        <div key={f.key} className="space-y-1">
          <label className="text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
            {f.label}{f.required && " *"}
          </label>
          <input
            type="text"
            value={fields[f.key] || ""}
            onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
            onKeyDown={(e) => e.key === "Enter" && canRun && runTool()}
            placeholder={f.placeholder}
            className="w-full rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-1.5 text-xs outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
          />
        </div>
      ))}

      {/* Run button */}
      <button
        onClick={runTool}
        disabled={loading || !canRun}
        className="px-4 py-1.5 text-xs rounded-md bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] disabled:opacity-50 disabled:cursor-not-allowed transition-colors hover:opacity-90"
      >
        {loading ? "Running..." : "Run"}
      </button>

      {/* Result */}
      {elapsed !== null && result !== null && (
        <div className="text-[10px] text-[hsl(var(--muted-foreground))]">
          Completed in {elapsed}ms
        </div>
      )}
      {result !== null && (
        <pre className="overflow-auto rounded-md bg-[hsl(var(--muted))] p-3 text-[10px] font-mono max-h-80">
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
