"use client";

import type { Session } from "@/types/domain";
import { formatCost } from "@core/utils/format-cost";
import { cn } from "@/lib/utils";

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

export function SessionCard({
  session,
  isActive,
  onClick,
}: {
  session: Session;
  isActive: boolean;
  onClick: () => void;
}) {
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
      <div className="truncate text-sm font-medium text-[hsl(var(--foreground))]">
        {session.title || "Untitled"}
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
      </div>
      {session.projectPath && (
        <div className="mt-0.5 truncate text-[10px] text-[hsl(var(--muted-foreground))] opacity-60">
          {session.projectPath}
        </div>
      )}
    </button>
  );
}
