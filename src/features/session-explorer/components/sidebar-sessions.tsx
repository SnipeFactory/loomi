"use client";

import { useState } from "react";
import useSWR from "swr";
import { useSessions } from "../hooks/use-sessions";
import { SessionCard } from "./session-card";
import { Search, Sparkles, Zap, Globe, HardDrive, HelpCircle, Layers, Upload } from "lucide-react";
import { cn } from "@/lib/utils";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// Per-toolType display metadata
const TOOL_META: Record<string, { icon: typeof Sparkles; color: string; label: string }> = {
  "claude-cli":       { icon: Sparkles,   color: "text-orange-400", label: "Claude CLI" },
  "claude-ai-export": { icon: Upload,     color: "text-orange-300", label: "Claude.ai" },
  "chatgpt-export":   { icon: Zap,        color: "text-green-400",  label: "ChatGPT" },
  "cursor":           { icon: HardDrive,  color: "text-purple-400", label: "Cursor" },
  "aider":            { icon: HardDrive,  color: "text-blue-400",   label: "Aider" },
  "gemini-cli":       { icon: Globe,      color: "text-blue-400",   label: "Gemini CLI" },
};

const FALLBACK_META = { icon: HelpCircle, color: "text-gray-400", label: "" };

export function SidebarSessions({
  activeSessionId,
  onSelectSession,
}: {
  activeSessionId: number | null;
  onSelectSession: (id: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [toolFilter, setToolFilter] = useState<string | undefined>(undefined);
  const { sessions, isLoading } = useSessions({
    q: query || undefined,
    tool: toolFilter,
  });

  // Build tabs from actual toolTypes in DB — no adapter registry dependency
  const { data: toolCounts } = useSWR<{ tool_type: string; count: number }[]>(
    "/api/sessions/tools",
    fetcher,
    { refreshInterval: 30000 }
  );
  const toolTabs = (toolCounts || []).map((t) => {
    const meta = TOOL_META[t.tool_type] || { ...FALLBACK_META, label: t.tool_type };
    return { toolType: t.tool_type, label: meta.label, icon: meta.icon, color: meta.color };
  });

  return (
    <div className="flex h-full flex-col border-r border-[hsl(var(--border))]">
      {/* Search */}
      <div className="shrink-0 border-b border-[hsl(var(--border))] p-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-4 w-4 text-[hsl(var(--muted-foreground))]" />
          <input
            type="text"
            placeholder="Search sessions..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-md bg-[hsl(var(--muted))] py-1.5 pl-8 pr-3 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))]"
          />
        </div>
      </div>

      {/* Tool filter tabs */}
      {toolTabs.length > 0 && (
        <div className="shrink-0 flex items-center gap-1 px-2 py-1.5 border-b border-[hsl(var(--border))] overflow-x-auto">
          <button
            onClick={() => setToolFilter(undefined)}
            className={cn(
              "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors whitespace-nowrap",
              toolFilter === undefined
                ? "bg-[hsl(var(--accent))] text-[hsl(var(--foreground))]"
                : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]"
            )}
          >
            <Layers className="h-3 w-3" />
            All
          </button>
          {toolTabs.map((t) => {
            const Icon = t.icon;
            const isActive = toolFilter === t.toolType;
            return (
              <button
                key={t.toolType}
                onClick={() => setToolFilter(t.toolType)}
                className={cn(
                  "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors whitespace-nowrap",
                  isActive
                    ? "bg-[hsl(var(--accent))] text-[hsl(var(--foreground))]"
                    : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]"
                )}
              >
                <Icon className={cn("h-3 w-3", isActive ? t.color : "")} />
                {t.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Session list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 text-center text-sm text-[hsl(var(--muted-foreground))]">
            Loading...
          </div>
        ) : sessions.length === 0 ? (
          <div className="p-4 text-center text-sm text-[hsl(var(--muted-foreground))]">
            No sessions found
          </div>
        ) : (
          sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              isActive={session.id === activeSessionId}
              onClick={() => onSelectSession(session.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
