"use client";

import { useState } from "react";
import { ChevronRight, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

interface ToolUse {
  name: string;
  id: string;
  input: unknown;
}

export function ToolUseBlock({ tools }: { tools: ToolUse[] }) {
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
        <Wrench className="h-4 w-4" />
        <span>
          {tools.map((t) => t.name).join(", ")}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-[hsl(var(--border))] px-4 py-3 space-y-2">
          {tools.map((tool) => (
            <div key={tool.id} className="text-sm">
              <div className="font-mono text-xs font-semibold text-[hsl(var(--foreground))]">
                {tool.name}
              </div>
              <pre className="mt-1 max-h-48 overflow-auto rounded bg-[hsl(var(--background))] p-2 text-xs text-[hsl(var(--muted-foreground))]">
                {JSON.stringify(tool.input, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
