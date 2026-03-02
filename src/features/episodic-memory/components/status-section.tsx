"use client";

import useSWR from "swr";
import { useState } from "react";

interface IndexingStatus {
  totalMessages: number;
  indexedMessages: number;
  pendingMessages: number;
  mlIndexedMessages: number;
  mlPendingMessages: number;
  totalSessionsWithSummary: number;
  indexedSessionSummaries: number;
  pendingSessionSummaries: number;
}

interface WorkerHealth {
  status: "ready" | "restarting" | "dead";
  lastAlive: number | null;
  restartCount: number;
  pendingRequests: number;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-[hsl(var(--muted-foreground))]">
        <span>{label}</span>
        <span>{value.toLocaleString()} / {max.toLocaleString()} ({pct}%)</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-[hsl(var(--muted))]">
        <div
          className="h-1.5 rounded-full bg-[hsl(var(--primary))] transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function WorkerBadge({ health }: { health: WorkerHealth }) {
  const badge = {
    ready: { label: "ready", color: "text-emerald-500", dot: "bg-emerald-500" },
    restarting: { label: "restarting", color: "text-amber-500", dot: "bg-amber-500 animate-pulse" },
    dead: { label: "dead", color: "text-red-500", dot: "bg-red-500" },
  }[health.status];

  const lastAlive = health.lastAlive
    ? new Date(health.lastAlive).toLocaleTimeString()
    : "never";

  return (
    <div className="flex items-center gap-3 text-xs">
      <span className={`flex items-center gap-1.5 font-medium ${badge.color}`}>
        <span className={`h-2 w-2 rounded-full ${badge.dot}`} />
        {badge.label}
      </span>
      <span className="text-[hsl(var(--muted-foreground))]">
        last alive: {lastAlive}
      </span>
      <span className="text-[hsl(var(--muted-foreground))]">
        restarts: {health.restartCount}
      </span>
      <span className="text-[hsl(var(--muted-foreground))]">
        pending: {health.pendingRequests}
      </span>
    </div>
  );
}

export function StatusSection() {
  const { data: status, mutate: mutateStatus } = useSWR<IndexingStatus>(
    "/api/memory?action=status",
    fetcher,
    { refreshInterval: 5000 }
  );
  const { data: health, mutate: mutateHealth } = useSWR<WorkerHealth>(
    "/api/memory?action=worker-health",
    fetcher,
    { refreshInterval: 5000 }
  );

  const [toast, setToast] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const runAction = async (action: string, label: string) => {
    setLoading(action);
    try {
      const res = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if ("indexed" in data) {
        showToast(`${label}: indexed ${data.indexed} items`);
      } else if ("deleted" in data) {
        showToast(`${label}: deleted ${data.deleted} entries`);
      } else if ("reset" in data) {
        showToast(`${label}: deleted ${data.deleted}, reset ${data.reset}`);
      } else {
        showToast(`${label}: done`);
      }
      mutateStatus();
      mutateHealth();
    } catch {
      showToast(`${label}: failed`);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Worker health */}
      <div className="rounded-md border border-[hsl(var(--border))] p-3 space-y-2">
        <div className="text-xs font-semibold text-[hsl(var(--foreground))] uppercase tracking-wider">
          Embedding Worker
        </div>
        {health ? (
          <WorkerBadge health={health} />
        ) : (
          <div className="text-xs text-[hsl(var(--muted-foreground))]">Loading...</div>
        )}
      </div>

      {/* Indexing progress */}
      <div className="rounded-md border border-[hsl(var(--border))] p-3 space-y-3">
        <div className="text-xs font-semibold text-[hsl(var(--foreground))] uppercase tracking-wider">
          Indexing Progress
        </div>
        {status ? (
          <>
            <ProgressBar
              label="Messages (ML)"
              value={status.mlIndexedMessages}
              max={status.totalMessages}
            />
            <ProgressBar
              label="Session Summaries"
              value={status.indexedSessionSummaries}
              max={status.totalSessionsWithSummary}
            />
          </>
        ) : (
          <div className="text-xs text-[hsl(var(--muted-foreground))]">Loading...</div>
        )}
      </div>

      {/* Actions */}
      <div className="rounded-md border border-[hsl(var(--border))] p-3 space-y-2">
        <div className="text-xs font-semibold text-[hsl(var(--foreground))] uppercase tracking-wider">
          Actions
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { action: "index-all", label: "Index All" },
            { action: "index-all-summaries", label: "Index Summaries" },
            { action: "cleanup-noise", label: "Cleanup Noise" },
            { action: "cleanup-tool-results", label: "Cleanup Tool Results" },
          ].map(({ action, label }) => (
            <button
              key={action}
              onClick={() => runAction(action, label)}
              disabled={loading !== null}
              className="px-3 py-1.5 text-xs rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] hover:bg-[hsl(var(--muted))] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading === action ? "Running..." : label}
            </button>
          ))}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 rounded-md bg-[hsl(var(--foreground))] text-[hsl(var(--background))] px-4 py-2 text-xs shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
