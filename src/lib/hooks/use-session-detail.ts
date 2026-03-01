"use client";
import useSWR from "swr";
import type { Session, Message } from "@/types/domain";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useSessionDetail(sessionId: number | null) {
  const { data, error, mutate } = useSWR<{
    session: Session;
    messages: Message[];
  }>(sessionId ? `/api/sessions/${sessionId}` : null, fetcher, {
    refreshInterval: 3000,
  });

  return {
    session: data?.session || null,
    messages: data?.messages || [],
    isLoading: !error && !data && sessionId !== null,
    error,
    mutate,
  };
}
