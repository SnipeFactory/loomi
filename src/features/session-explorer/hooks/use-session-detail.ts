"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import type { Session, Message } from "@/types/domain";

const PAGE_SIZE = 50;
const POLL_INTERVAL = 3000;

interface SessionDetailData {
  session: Session;
  messages: Message[];
  totalMessages: number;
  hasMore: boolean;
}

export function useSessionDetail(sessionId: number | null) {
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [totalMessages, setTotalMessages] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Cursors — stored in refs so polling closures always see latest values
  const maxSortOrderRef = useRef<number | null>(null);
  const minSortOrderRef = useRef<number | null>(null);

  // Initial load — fires whenever sessionId changes
  useEffect(() => {
    if (!sessionId) {
      setSession(null);
      setMessages([]);
      setHasMore(false);
      setTotalMessages(0);
      maxSortOrderRef.current = null;
      minSortOrderRef.current = null;
      return;
    }

    setIsLoading(true);
    setError(null);
    setMessages([]);
    maxSortOrderRef.current = null;
    minSortOrderRef.current = null;

    fetch(`/api/sessions/${sessionId}?limit=${PAGE_SIZE}`)
      .then((r) => r.json())
      .then((data: SessionDetailData) => {
        setSession(data.session);
        setMessages(data.messages);
        setHasMore(data.hasMore);
        setTotalMessages(data.totalMessages);
        if (data.messages.length > 0) {
          minSortOrderRef.current = data.messages[0].sortOrder;
          maxSortOrderRef.current = data.messages[data.messages.length - 1].sortOrder;
        }
      })
      .catch((err) => setError(err))
      .finally(() => setIsLoading(false));
  }, [sessionId]);

  // Efficient live-update polling — only fetches new messages (tiny payload)
  useEffect(() => {
    if (!sessionId) return;

    const interval = setInterval(() => {
      if (maxSortOrderRef.current === null) return;

      fetch(`/api/sessions/${sessionId}?after=${maxSortOrderRef.current}`)
        .then((r) => r.json())
        .then((data: SessionDetailData) => {
          if (data.messages.length > 0) {
            setMessages((prev) => [...prev, ...data.messages]);
            setTotalMessages(data.totalMessages);
            maxSortOrderRef.current = data.messages[data.messages.length - 1].sortOrder;
          }
        })
        .catch(() => {}); // silent — polling failures are non-critical
    }, POLL_INTERVAL);

    return () => clearInterval(interval);
  }, [sessionId]);

  // Load earlier messages (cursor-based, prepend)
  const loadMore = useCallback(() => {
    if (!sessionId || !hasMore || isLoadingMore || minSortOrderRef.current === null) return;

    setIsLoadingMore(true);
    fetch(`/api/sessions/${sessionId}?limit=${PAGE_SIZE}&before=${minSortOrderRef.current}`)
      .then((r) => r.json())
      .then((data: SessionDetailData) => {
        setMessages((prev) => [...data.messages, ...prev]);
        setHasMore(data.hasMore);
        setTotalMessages(data.totalMessages);
        if (data.messages.length > 0) {
          minSortOrderRef.current = data.messages[0].sortOrder;
        }
      })
      .catch((err) => setError(err))
      .finally(() => setIsLoadingMore(false));
  }, [sessionId, hasMore, isLoadingMore]);

  return {
    session,
    messages,
    isLoading,
    isLoadingMore,
    hasMore,
    totalMessages,
    error,
    loadMore,
  };
}
