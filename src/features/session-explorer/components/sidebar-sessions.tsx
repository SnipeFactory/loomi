"use client";

import { useState } from "react";
import useSWR from "swr";
import { useSessions } from "../hooks/use-sessions";
import { SessionCard } from "./session-card";
import { Search, Sparkles, Zap, Globe, HardDrive, HelpCircle, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

const PROVIDER_ICONS: Record<string, { icon: typeof Sparkles; color: string }> = {
  anthropic: { icon: Sparkles,   color: "text-orange-400" },
  openai:    { icon: Zap,        color: "text-green-400" },
  google:    { icon: Globe,      color: "text-blue-400" },
  local:     { icon: HardDrive,  color: "text-purple-400" },
  unknown:   { icon: HelpCircle, color: "text-gray-400" },
};

export function SidebarSessions({
  activeSessionId,
  onSelectSession,
}: {
  activeSessionId: number | null;
  onSelectSession: (id: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [providerFilter, setProviderFilter] = useState<string | undefined>(undefined);
  const { sessions, isLoading } = useSessions({
    q: query || undefined,
    provider: providerFilter,
  });

  // Fetch adapters + providers that actually have sessions
  const { data: adapterData } = useSWR("/api/adapters", fetcher, { refreshInterval: 60000 });
  const adapters: { id: string; name: string; provider: string }[] = adapterData?.adapters || [];
  const { data: providerCounts } = useSWR("/api/sessions/providers", fetcher, { refreshInterval: 30000 });
  const activeProviders: Set<string> = new Set(
    (providerCounts || []).map((p: { provider: string }) => p.provider)
  );

  // Only show tabs for providers that have session data
  const providerFilters = adapters.reduce<{ provider: string; label: string }[]>((acc, a) => {
    if (!acc.some((f) => f.provider === a.provider) && activeProviders.has(a.provider)) {
      acc.push({ provider: a.provider, label: a.name });
    }
    return acc;
  }, []);

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

      {/* Adapter-based filter tabs */}
      {providerFilters.length > 0 && (
        <div className="shrink-0 flex items-center gap-1 px-2 py-1.5 border-b border-[hsl(var(--border))] overflow-x-auto">
          {/* All tab */}
          <button
            onClick={() => setProviderFilter(undefined)}
            className={cn(
              "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors whitespace-nowrap",
              providerFilter === undefined
                ? "bg-[hsl(var(--accent))] text-[hsl(var(--foreground))]"
                : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]"
            )}
          >
            <Layers className="h-3 w-3" />
            All
          </button>
          {/* One tab per registered adapter provider */}
          {providerFilters.map((pf) => {
            const iconInfo = PROVIDER_ICONS[pf.provider] || PROVIDER_ICONS.unknown;
            const Icon = iconInfo.icon;
            const isActive = providerFilter === pf.provider;
            return (
              <button
                key={pf.provider}
                onClick={() => setProviderFilter(pf.provider)}
                className={cn(
                  "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-colors whitespace-nowrap",
                  isActive
                    ? "bg-[hsl(var(--accent))] text-[hsl(var(--foreground))]"
                    : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]"
                )}
              >
                <Icon className={cn("h-3 w-3", isActive ? iconInfo.color : "")} />
                {pf.label}
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
