"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message } from "@/types/domain";
import { ThinkingBlock } from "./thinking-block";
import { ToolUseBlock } from "./tool-use-block";
import { CodeBlock } from "./code-block";
import { TokenBadge } from "./token-badge";
import { User, Bot, Sparkles, Zap, Globe, HardDrive, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const PROVIDER_ICONS: Record<string, { icon: typeof Sparkles; color: string }> = {
  anthropic: { icon: Sparkles,   color: "bg-orange-500/20 text-orange-400" },
  openai:    { icon: Zap,        color: "bg-green-500/20 text-green-400" },
  google:    { icon: Globe,      color: "bg-blue-500/20 text-blue-400" },
  local:     { icon: HardDrive,  color: "bg-purple-500/20 text-purple-400" },
  unknown:   { icon: HelpCircle, color: "bg-gray-500/20 text-gray-400" },
};

export function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const toolUse = message.toolUseJson ? JSON.parse(message.toolUseJson) : null;

  // Determine assistant icon based on provider
  const provider = message.provider || "anthropic";
  const providerInfo = PROVIDER_ICONS[provider] || PROVIDER_ICONS.unknown;
  const AssistantIcon = providerInfo.icon;

  return (
    <div
      className={cn(
        "flex gap-3 py-4 px-4",
        isUser ? "bg-[hsl(var(--muted))]" : ""
      )}
    >
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
          isUser
            ? "bg-blue-500/20 text-blue-400"
            : providerInfo.color
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <AssistantIcon className="h-4 w-4" />}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium text-[hsl(var(--foreground))]">
            {isUser ? "User" : "Assistant"}
          </span>
          <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
            {new Date(message.timestamp).toLocaleTimeString()}
          </span>
          {message.model && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]">
              {message.model}
            </span>
          )}
        </div>

        {message.thinkingContent && (
          <ThinkingBlock content={message.thinkingContent} />
        )}

        {message.textContent && (
          <div className="prose prose-invert prose-sm max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                code(props) {
                  const { children, className, ...rest } = props;
                  const match = /language-(\w+)/.exec(className || "");
                  const isInline = !match;
                  if (isInline) {
                    return (
                      <code
                        className="rounded bg-[hsl(var(--muted))] px-1.5 py-0.5 text-sm"
                        {...rest}
                      >
                        {children}
                      </code>
                    );
                  }
                  return (
                    <CodeBlock language={match[1]}>
                      {String(children).replace(/\n$/, "")}
                    </CodeBlock>
                  );
                },
              }}
            >
              {message.textContent}
            </ReactMarkdown>
          </div>
        )}

        {toolUse && toolUse.length > 0 && <ToolUseBlock tools={toolUse} />}

        {!isUser && (message.inputTokens || message.outputTokens || message.estimatedCostUsd) && (
          <TokenBadge
            inputTokens={message.inputTokens}
            outputTokens={message.outputTokens}
            cacheCreationTokens={message.cacheCreationTokens}
            cacheReadTokens={message.cacheReadTokens}
            cost={message.estimatedCostUsd}
          />
        )}
      </div>
    </div>
  );
}
