"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import useSWR from "swr";
import { useSessionDetail } from "../hooks/use-session-detail";
import { MessageBubble } from "./message-bubble";
import { formatCost } from "@core/utils/format-cost";
import { MessageSquare, GitBranch, Cpu, DollarSign, FileText, Tag, Sparkles, Loader2, Settings, ChevronUp } from "lucide-react";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function SessionSummary({ sessionId, sessionUuid }: { sessionId: number; sessionUuid: string }) {
  const { data, isLoading, mutate } = useSWR<{ summary: string; keywords: string } | null>(
    `/api/modules/log-summarizer/data?key=summary:${sessionUuid}`,
    fetcher
  );
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);
    setErrorCode(null);
    try {
      const res = await fetch("/api/modules/log-summarizer/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, sessionUuid }),
      });
      if (!res.ok) {
        const err = await res.json();
        setError(err.error || "Failed to generate");
        setErrorCode(err.code || null);
      } else {
        mutate();
      }
    } catch {
      setError("Network error");
    }
    setGenerating(false);
  };

  if (isLoading) return null;

  // Summary exists
  if (data && data.summary) {
    return (
      <div className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-4 py-2">
        <div className="flex items-start gap-2">
          <FileText className="h-3.5 w-3.5 shrink-0 mt-0.5 text-[hsl(var(--muted-foreground))]" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-[hsl(var(--foreground))] leading-relaxed whitespace-pre-line">
              {data.summary}
            </p>
            {data.keywords && (
              <div className="mt-1 flex items-center gap-1 flex-wrap">
                <Tag className="h-3 w-3 text-[hsl(var(--muted-foreground))]" />
                {data.keywords.split(",").map((kw) => (
                  <span
                    key={kw.trim()}
                    className="rounded-full bg-[hsl(var(--background))] px-1.5 py-0.5 text-[9px] text-[hsl(var(--muted-foreground))]"
                  >
                    {kw.trim()}
                  </span>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="shrink-0 rounded p-1 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--background))]"
            title="Regenerate summary"
          >
            {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
          </button>
        </div>
      </div>
    );
  }

  // No summary yet — show generate button or error guidance
  return (
    <div className="border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))] px-4 py-2">
      <div className="flex items-center gap-2">
        <FileText className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--muted-foreground))]" />
        <span className="flex-1 text-[11px] text-[hsl(var(--muted-foreground))]">
          {errorCode === "NO_API_KEY"
            ? "Please set OpenRouter API key"
            : error || "No AI summary yet"}
        </span>
        {errorCode === "NO_API_KEY" ? (
          <a
            href="/settings/modules/log-summarizer"
            className="flex items-center gap-1 rounded-md bg-[hsl(var(--background))] px-2 py-0.5 text-[10px] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] border border-[hsl(var(--border))]"
          >
            <Settings className="h-3 w-3" />
            Settings
          </a>
        ) : (
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-1 rounded-md bg-[hsl(var(--background))] px-2 py-0.5 text-[10px] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] border border-[hsl(var(--border))]"
          >
            {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            {generating ? "Generating..." : "Summarize"}
          </button>
        )}
      </div>
    </div>
  );
}

export function ChatViewer({ sessionId }: { sessionId: number | null }) {
  const { session, messages, isLoading, isLoadingMore, hasMore, totalMessages, loadMore } = useSessionDetail(sessionId);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isPrependingRef = useRef(false);
  const prevScrollHeightRef = useRef(0);
  const prevSessionIdRef = useRef<number | null>(null);

  // Scroll to bottom only on initial session load (not on every message append)
  useEffect(() => {
    if (sessionId !== prevSessionIdRef.current && !isLoading) {
      bottomRef.current?.scrollIntoView({ behavior: "auto" });
      prevSessionIdRef.current = sessionId;
    }
  }, [sessionId, isLoading]);

  // Preserve scroll position when prepending older messages
  useEffect(() => {
    if (isPrependingRef.current && scrollContainerRef.current) {
      const delta = scrollContainerRef.current.scrollHeight - prevScrollHeightRef.current;
      scrollContainerRef.current.scrollTop += delta;
      isPrependingRef.current = false;
    }
  }, [messages]);

  const handleLoadMore = useCallback(() => {
    if (!scrollContainerRef.current) return;
    prevScrollHeightRef.current = scrollContainerRef.current.scrollHeight;
    isPrependingRef.current = true;
    loadMore();
  }, [loadMore]);

  if (!sessionId) {
    return (
      <div className="flex h-full items-center justify-center text-[hsl(var(--muted-foreground))]">
        <div className="text-center">
          <MessageSquare className="mx-auto h-12 w-12 mb-3 opacity-30" />
          <p className="text-sm">Select a session to view</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-[hsl(var(--muted-foreground))]">
        <p className="text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Session header */}
      {session && (
        <div className="shrink-0 border-b border-[hsl(var(--border))] px-4 py-3">
          <h2 className="text-sm font-semibold text-[hsl(var(--foreground))] truncate">
            {session.title || "Untitled Session"}
          </h2>
          <div className="mt-1 flex items-center gap-3 text-[10px] text-[hsl(var(--muted-foreground))]">
            {session.projectPath && (
              <span className="truncate max-w-[200px]">{session.projectPath}</span>
            )}
            {session.gitBranch && (
              <span className="flex items-center gap-1">
                <GitBranch className="h-3 w-3" />
                {session.gitBranch}
              </span>
            )}
            {session.primaryModel && (
              <span className="flex items-center gap-1">
                <Cpu className="h-3 w-3" />
                {session.primaryModel}
              </span>
            )}
            <span className="flex items-center gap-1">
              <DollarSign className="h-3 w-3" />
              {formatCost(session.estimatedCostUsd)}
            </span>
            <span>
              {session.userMessageCount + session.assistantMessageCount} messages
            </span>
          </div>
        </div>
      )}

      {/* AI Summary (from Session Summarizer module) */}
      {session && <SessionSummary sessionId={session.id} sessionUuid={session.sessionUuid} />}

      {/* Messages */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
        {/* Load earlier messages */}
        {hasMore && (
          <div className="flex items-center justify-center py-2 border-b border-[hsl(var(--border))]">
            <button
              onClick={handleLoadMore}
              disabled={isLoadingMore}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] disabled:opacity-50"
            >
              {isLoadingMore ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <ChevronUp className="h-3 w-3" />
              )}
              {isLoadingMore
                ? "Loading..."
                : `Load earlier messages (${totalMessages - messages.length} more)`}
            </button>
          </div>
        )}
        <div className="divide-y divide-[hsl(var(--border))]">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
        </div>
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
