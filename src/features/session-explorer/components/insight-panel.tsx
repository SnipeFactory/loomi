"use client";

import { useState } from "react";
import { ChatViewer } from "./chat-viewer";
import { UsageTracker } from "./usage-tracker";
import { ToolMonitor } from "./tool-monitor";
import { MessageSquare, BarChart3, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";

type InsightTab = "chat" | "usage" | "tools";

const tabs: { id: InsightTab; label: string; icon: typeof MessageSquare }[] = [
  { id: "chat", label: "Sessions", icon: MessageSquare },
  { id: "usage", label: "Usage", icon: BarChart3 },
  { id: "tools", label: "Tool Monitor", icon: Wrench },
];

export default function InsightPanel({ sessionId }: { sessionId: number | null }) {
  const [activeTab, setActiveTab] = useState<InsightTab>("chat");

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar */}
      <div className="shrink-0 flex items-center border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]">
        <span className="px-3 text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
          Session Explorer
        </span>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors border-b-2",
                activeTab === tab.id
                  ? "border-[hsl(var(--primary))] text-[hsl(var(--foreground))]"
                  : "border-transparent text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0">
        {activeTab === "chat" && <ChatViewer sessionId={sessionId} />}
        {activeTab === "usage" && <UsageTracker sessionId={sessionId} />}
        {activeTab === "tools" && <ToolMonitor sessionId={sessionId} />}
      </div>
    </div>
  );
}
