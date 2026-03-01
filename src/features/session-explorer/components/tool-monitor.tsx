"use client";

import useSWR from "swr";
import { Wrench, Hash, FolderOpen } from "lucide-react";

interface ToolUsageRecord {
  toolName: string;
  usageCount: number;
  sessionCount: number;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const TOOL_COLORS: Record<string, string> = {
  Bash: "bg-emerald-500",
  Read: "bg-blue-500",
  Write: "bg-amber-500",
  Edit: "bg-purple-500",
  Glob: "bg-cyan-500",
  Grep: "bg-orange-500",
  Task: "bg-pink-500",
  WebFetch: "bg-red-500",
  WebSearch: "bg-indigo-500",
};

function getToolColor(name: string): string {
  return TOOL_COLORS[name] || "bg-gray-500";
}

export function ToolMonitor({ sessionId }: { sessionId?: number | null }) {
  const url = sessionId
    ? `/api/stats/tools?sessionId=${sessionId}`
    : "/api/stats/tools";

  const { data: tools, isLoading } = useSWR<ToolUsageRecord[]>(
    url,
    fetcher,
    { refreshInterval: 10000 }
  );

  const isSessionView = !!sessionId;

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-[hsl(var(--muted-foreground))]">
        <p className="text-sm">Loading tool usage data...</p>
      </div>
    );
  }

  if (!tools || tools.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-[hsl(var(--muted-foreground))]">
        <div className="text-center">
          <Wrench className="mx-auto h-12 w-12 mb-3 opacity-30" />
          <p className="text-sm">No tool usage data{isSessionView ? " in this session" : ""}</p>
        </div>
      </div>
    );
  }

  const maxUsage = Math.max(...tools.map((t) => t.usageCount));
  const totalUsage = tools.reduce((sum, t) => sum + t.usageCount, 0);

  return (
    <div className="h-full overflow-y-auto">
      {/* Summary header */}
      <div className="sticky top-0 bg-[hsl(var(--background))] border-b border-[hsl(var(--border))] px-4 py-3">
        <h2 className="text-sm font-semibold text-[hsl(var(--foreground))]">
          {isSessionView ? "Session Tool Usage" : "Tool Usage Monitor"}
        </h2>
        <div className="mt-1 flex items-center gap-4 text-[10px] text-[hsl(var(--muted-foreground))]">
          <span>{tools.length} tools used</span>
          <span>{totalUsage.toLocaleString()} total calls</span>
        </div>
      </div>

      {/* Tool list */}
      <div className="divide-y divide-[hsl(var(--border))]">
        {tools.map((tool) => (
          <div key={tool.toolName} className="px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className={`h-2.5 w-2.5 rounded-full ${getToolColor(tool.toolName)}`} />
                <span className="text-sm font-mono font-medium text-[hsl(var(--foreground))]">
                  {tool.toolName}
                </span>
              </div>
              <div className="flex items-center gap-3 text-[10px] text-[hsl(var(--muted-foreground))]">
                <span className="flex items-center gap-1">
                  <Hash className="h-3 w-3" />
                  {tool.usageCount.toLocaleString()} calls
                </span>
                {!isSessionView && (
                  <span className="flex items-center gap-1">
                    <FolderOpen className="h-3 w-3" />
                    {tool.sessionCount} sessions
                  </span>
                )}
              </div>
            </div>

            {/* Usage bar */}
            <div className="mt-2 h-1.5 rounded-full bg-[hsl(var(--muted))] overflow-hidden">
              <div
                className={`h-full rounded-full ${getToolColor(tool.toolName)} transition-all`}
                style={{
                  width: `${(tool.usageCount / maxUsage) * 100}%`,
                }}
              />
            </div>

            {/* Percentage */}
            <div className="mt-1 text-[10px] text-[hsl(var(--muted-foreground))]">
              {((tool.usageCount / totalUsage) * 100).toFixed(1)}% of total
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
