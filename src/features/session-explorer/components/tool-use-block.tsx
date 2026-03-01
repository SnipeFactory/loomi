"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { getToolStyle } from "../utils/tool-styles";

interface ToolUse {
  name: string;
  id: string;
  input: unknown;
}

export function ToolUseBlock({ tools }: { tools: ToolUse[] }) {
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
        <div className="flex -space-x-1 overflow-hidden">
          {tools.slice(0, 3).map((t, i) => {
            const style = getToolStyle(t.name);
            const Icon = style.icon;
            return (
              <div 
                key={`${t.id}-${i}`}
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded border border-[hsl(var(--border))]",
                  style.color
                )}
              >
                <Icon className="h-3 w-3 text-white" />
              </div>
            );
          })}
          {tools.length > 3 && (
            <div className="flex h-5 w-5 items-center justify-center rounded border border-[hsl(var(--border))] bg-gray-600 text-[8px] text-white">
              +{tools.length - 3}
            </div>
          )}
        </div>
        <span className="truncate font-mono text-[11px]">
          {tools.map((t) => t.name).join(", ")}
        </span>
      </button>
      {expanded && (
        <div className="border-t border-[hsl(var(--border))] px-4 py-3 space-y-3 bg-[hsl(var(--background))] bg-opacity-50">
          {tools.map((tool) => {
            const style = getToolStyle(tool.name);
            const Icon = style.icon;
            
            return (
              <div key={tool.id} className="text-sm">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className={cn("flex h-5 w-5 items-center justify-center rounded", style.color)}>
                    <Icon className="h-3 w-3 text-white" />
                  </div>
                  <div className="font-mono text-xs font-semibold text-[hsl(var(--foreground))]">
                    {tool.name}
                  </div>
                  <span className="text-[9px] text-[hsl(var(--muted-foreground))] font-mono opacity-50 ml-auto">
                    {tool.id}
                  </span>
                </div>
                <pre className="max-h-64 overflow-auto rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-2.5 text-[11px] text-[hsl(var(--muted-foreground))] leading-relaxed">
                  {JSON.stringify(tool.input, null, 2)}
                </pre>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
