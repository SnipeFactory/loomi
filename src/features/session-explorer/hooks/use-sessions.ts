"use client";
import useSWR from "swr";
import type { Session } from "@/types/domain";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useSessions(params?: {
  tool?: string;
  provider?: string;
  project?: string;
  q?: string;
  page?: number;
}) {
  const searchParams = new URLSearchParams();
  if (params?.tool) searchParams.set("tool", params.tool);
  if (params?.provider) searchParams.set("provider", params.provider);
  if (params?.project) searchParams.set("project", params.project);
  if (params?.q) searchParams.set("q", params.q);
  if (params?.page) searchParams.set("page", String(params.page));

  const query = searchParams.toString();
  const url = `/api/sessions${query ? `?${query}` : ""}`;

  const { data, error, mutate } = useSWR<{
    sessions: Session[];
    total: number;
    page: number;
    limit: number;
  }>(url, fetcher, { refreshInterval: 5000 });

  return {
    sessions: data?.sessions || [],
    total: data?.total || 0,
    isLoading: !error && !data,
    error,
    mutate,
  };
}
