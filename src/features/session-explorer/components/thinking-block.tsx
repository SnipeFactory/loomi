"use client";

import { useState } from "react";
import { ChevronRight, Brain } from "lucide-react";
import { cn } from "@/lib/utils";

export function ThinkingBlock({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="my-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))] overflow-hidden shadow-sm">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--accent))] transition-all"
      >
        <ChevronRight
          className={cn("h-4 w-4 transition-transform", expanded && "rotate-90")}
        />
        <div className="flex h-5 w-5 items-center justify-center rounded bg-purple-500">
          <Brain className="h-3 w-3 text-white" />
        </div>
        <span className="font-medium">Thinking Process</span>
        {!expanded && (
          <span className="ml-2 truncate text-[11px] opacity-60 italic">
            {content.slice(0, 80)}...
          </span>
        )}
      </button>
      {expanded && (
        <div className="max-h-96 overflow-y-auto border-t border-[hsl(var(--border))] bg-[hsl(var(--background))] bg-opacity-50 px-4 py-3 text-[13px] leading-relaxed text-[hsl(var(--muted-foreground))] whitespace-pre-wrap italic">
          {content}
        </div>
      )}
    </div>
  );
}
