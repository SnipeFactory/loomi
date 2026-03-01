"use client";

import { useState } from "react";
import { ChevronRight, Brain } from "lucide-react";
import { cn } from "@/lib/utils";

export function ThinkingBlock({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="my-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
      >
        <ChevronRight
          className={cn("h-4 w-4 transition-transform", expanded && "rotate-90")}
        />
        <Brain className="h-4 w-4" />
        <span>Thinking</span>
        {!expanded && (
          <span className="ml-2 truncate text-xs opacity-60">
            {content.slice(0, 80)}...
          </span>
        )}
      </button>
      {expanded && (
        <div className="max-h-96 overflow-y-auto border-t border-[hsl(var(--border))] px-4 py-3 text-sm text-[hsl(var(--muted-foreground))] whitespace-pre-wrap">
          {content}
        </div>
      )}
    </div>
  );
}
