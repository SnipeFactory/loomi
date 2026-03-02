"use client";

import useSWR from "swr";
import { Settings, Puzzle, FolderOpen, CheckCircle, XCircle, Database } from "lucide-react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface WatchedPath {
  id: number;
  path: string;
  label: string | null;
  toolType: string;
  enabled: boolean;
}

export function SidebarPaths() {
  const { data: paths } = useSWR<WatchedPath[]>("/api/watched-paths", fetcher, {
    refreshInterval: 30000,
  });

  const watchedPaths = paths || [];

  return (
    <div className="flex h-full flex-col border-r border-[hsl(var(--border))]">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between border-b border-[hsl(var(--border))] px-3 py-2.5">
        <h2 className="text-sm font-semibold text-[hsl(var(--foreground))]">
          Loomi
        </h2>
        <a
          href="/settings"
          className="rounded p-1 hover:bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
          title="Settings"
        >
          <Settings className="h-4 w-4" />
        </a>
      </div>

      {/* Watched Paths */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {watchedPaths.length > 0 && (
          <>
            <div className="text-[10px] uppercase tracking-wider text-[hsl(var(--muted-foreground))] px-1 mb-1.5">
              Collecting
            </div>
            {watchedPaths.map((wp) => (
              <div
                key={wp.id}
                className="flex items-center gap-2 rounded-md px-1.5 py-1 text-xs text-[hsl(var(--foreground))]"
                title={wp.path}
              >
                <FolderOpen className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                <span className="flex-1 truncate text-[hsl(var(--muted-foreground))]">
                  {wp.label || wp.toolType}
                </span>
                {wp.enabled ? (
                  <CheckCircle className="h-3 w-3 text-green-400 shrink-0" />
                ) : (
                  <XCircle className="h-3 w-3 text-[hsl(var(--muted-foreground))] shrink-0" />
                )}
              </div>
            ))}
          </>
        )}
      </div>

      {/* Bottom actions */}
      <div className="shrink-0 border-t border-[hsl(var(--border))] p-2 flex flex-col gap-1">
        <a
          href="/modules/episodic-memory"
          className="flex w-full items-center justify-center gap-1.5 rounded-md bg-[hsl(var(--muted))] px-2 py-1.5 text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))]"
          title="Memory Lab"
        >
          <Database className="h-3.5 w-3.5" />
          Memory Lab
        </a>
        <a
          href="/modules"
          className="flex w-full items-center justify-center gap-1.5 rounded-md bg-[hsl(var(--muted))] px-2 py-1.5 text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))]"
          title="Modules"
        >
          <Puzzle className="h-3.5 w-3.5" />
          Modules
        </a>
      </div>
    </div>
  );
}
