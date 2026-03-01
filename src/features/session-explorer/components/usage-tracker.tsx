"use client";

import useSWR from "swr";
import { formatCost } from "@core/utils/format-cost";
import { FolderOpen, MessageSquare, Coins, Clock } from "lucide-react";

interface ProjectUsageStats {
  projectPath: string;
  sessionCount: number;
  messageCount: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  lastActivityAt: string;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function UsageTracker({ sessionId }: { sessionId?: number | null }) {
  const url = sessionId
    ? `/api/stats/projects?sessionId=${sessionId}`
    : "/api/stats/projects";

  const { data: stats, isLoading } = useSWR<ProjectUsageStats[]>(
    url,
    fetcher,
    { refreshInterval: 10000 }
  );

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-[hsl(var(--muted-foreground))]">
        <p className="text-sm">Loading usage data...</p>
      </div>
    );
  }

  if (!stats || stats.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-[hsl(var(--muted-foreground))]">
        <div className="text-center">
          <FolderOpen className="mx-auto h-12 w-12 mb-3 opacity-30" />
          <p className="text-sm">No usage data yet</p>
        </div>
      </div>
    );
  }

  const maxSessions = Math.max(...stats.map((s) => s.sessionCount));
  const totalCostAll = stats.reduce((sum, s) => sum + s.totalCost, 0);
  const isSessionView = !!sessionId;

  return (
    <div className="h-full overflow-y-auto">
      {/* Summary header */}
      <div className="sticky top-0 bg-[hsl(var(--background))] border-b border-[hsl(var(--border))] px-4 py-3">
        <h2 className="text-sm font-semibold text-[hsl(var(--foreground))]">
          {isSessionView ? "Session Usage" : "Project Usage Overview"}
        </h2>
        <div className="mt-1 flex items-center gap-4 text-[10px] text-[hsl(var(--muted-foreground))]">
          {!isSessionView && <span>{stats.length} projects</span>}
          <span>{stats.reduce((s, p) => s + p.messageCount, 0)} messages</span>
          <span>
            {((stats.reduce((s, p) => s + p.totalInputTokens + p.totalOutputTokens, 0)) / 1000).toFixed(0)}K tokens
          </span>
          <span className="text-amber-400 font-medium">{formatCost(totalCostAll)} total cost</span>
        </div>
      </div>

      {/* Project list with bar chart */}
      <div className="divide-y divide-[hsl(var(--border))]">
        {stats.map((project) => (
          <div key={project.projectPath} className="px-4 py-3">
            <div className="flex items-start justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <FolderOpen className="h-3.5 w-3.5 shrink-0 text-blue-400" />
                  <span className="text-sm font-medium text-[hsl(var(--foreground))] truncate">
                    {project.projectPath}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-3 text-[10px] text-[hsl(var(--muted-foreground))]">
                  {!isSessionView && (
                    <span className="flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" />
                      {project.sessionCount} sessions
                    </span>
                  )}
                  <span>{project.messageCount} msgs</span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {timeAgo(project.lastActivityAt)}
                  </span>
                </div>
              </div>
              <div className="text-right shrink-0 ml-3">
                <div className="flex items-center gap-1 text-xs text-amber-400 font-medium">
                  <Coins className="h-3 w-3" />
                  {formatCost(project.totalCost)}
                </div>
                <div className="text-[10px] text-[hsl(var(--muted-foreground))]">
                  {((project.totalInputTokens + project.totalOutputTokens) / 1000).toFixed(0)}K tokens
                </div>
              </div>
            </div>

            {/* Usage bar */}
            {!isSessionView && (
              <div className="mt-2 h-1.5 rounded-full bg-[hsl(var(--muted))] overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all"
                  style={{
                    width: `${(project.sessionCount / maxSessions) * 100}%`,
                  }}
                />
              </div>
            )}

            {/* Token breakdown for session view */}
            {isSessionView && (
              <div className="mt-2 flex gap-4 text-[10px] text-[hsl(var(--muted-foreground))]">
                <span>Input: {(project.totalInputTokens / 1000).toFixed(1)}K</span>
                <span>Output: {(project.totalOutputTokens / 1000).toFixed(1)}K</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
