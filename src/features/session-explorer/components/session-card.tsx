"use client";

import type { Session } from "@/types/domain";
import { formatCost } from "@core/utils/format-cost";
import { cn } from "@/lib/utils";
import { Sparkles, Zap, Globe, HardDrive, HelpCircle } from "lucide-react";

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

const PROVIDER_ICON: Record<string, { icon: typeof Sparkles; color: string; label: string }> = {
  anthropic: { icon: Sparkles, color: "text-orange-400", label: "Claude" },
  openai:    { icon: Zap,      color: "text-green-400",  label: "ChatGPT" },
  google:    { icon: Globe,    color: "text-blue-400",   label: "Gemini" },
  local:     { icon: HardDrive,color: "text-purple-400", label: "Local" },
  unknown:   { icon: HelpCircle,color:"text-gray-400",   label: "Unknown" },
};

export function SessionCard({
  session,
  isActive,
  onClick,
}: {
  session: Session;
  isActive: boolean;
  onClick: () => void;
}) {
  const providerInfo = PROVIDER_ICON[session.provider] || PROVIDER_ICON.unknown;
  const ProviderIcon = providerInfo.icon;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-3 py-2.5 border-b border-[hsl(var(--border))] transition-colors",
        isActive
          ? "bg-[hsl(var(--accent))]"
          : "hover:bg-[hsl(var(--muted))]"
      )}
    >
      <div className="flex items-center gap-1.5">
        <ProviderIcon className={cn("h-3.5 w-3.5 shrink-0", providerInfo.color)} />
        <div className="truncate text-sm font-medium text-[hsl(var(--foreground))]">
          {session.title || "Untitled"}
        </div>
      </div>
      <div className="mt-1 flex items-center gap-2 text-[10px] text-[hsl(var(--muted-foreground))]">
        <span>{timeAgo(session.lastActivityAt)}</span>
        <span className="opacity-40">|</span>
        <span>{session.userMessageCount + session.assistantMessageCount} msgs</span>
        {session.estimatedCostUsd > 0 && (
          <>
            <span className="opacity-40">|</span>
            <span className="text-amber-400">{formatCost(session.estimatedCostUsd)}</span>
          </>
        )}
        <span className={cn("ml-auto text-[9px] px-1 py-0.5 rounded", providerInfo.color, "opacity-60")}>
          {session.toolType}
        </span>
      </div>
      {session.projectPath && (
        <div className="mt-0.5 truncate text-[10px] text-[hsl(var(--muted-foreground))] opacity-60">
          {session.projectPath}
        </div>
      )}
    </button>
  );
}
