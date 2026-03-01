"use client";

import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/**
 * Fetch sessions from the Loomi API.
 * Data is automatically scrubbed for Explorer modules.
 */
export function useLoomiSessions(opts?: {
  provider?: string;
  limit?: number;
  refreshInterval?: number;
}) {
  const params = new URLSearchParams();
  if (opts?.provider) params.set("provider", opts.provider);
  if (opts?.limit) params.set("limit", String(opts.limit));

  const url = `/api/sessions?${params.toString()}`;
  const { data, error, mutate } = useSWR(url, fetcher, {
    refreshInterval: opts?.refreshInterval ?? 30000,
  });

  return {
    sessions: data || [],
    isLoading: !error && !data,
    error,
    mutate,
  };
}

/**
 * Fetch a single session with its messages.
 */
export function useLoomiSession(sessionUuid: string | null) {
  const { data, error, mutate } = useSWR(
    sessionUuid ? `/api/sessions/${sessionUuid}` : null,
    fetcher,
  );

  return {
    session: data?.session || null,
    messages: data?.messages || [],
    isLoading: !error && !data && !!sessionUuid,
    error,
    mutate,
  };
}

/**
 * Full-text search across messages.
 */
export function useLoomiSearch(query: string, opts?: { limit?: number }) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (opts?.limit) params.set("limit", String(opts.limit));

  const { data, error } = useSWR(
    query ? `/api/search?${params.toString()}` : null,
    fetcher,
  );

  return {
    results: data || [],
    isLoading: !error && !data && !!query,
    error,
  };
}

/**
 * Read/write module-specific data (key-value store).
 */
export function useModuleData<T = unknown>(moduleId: string, key: string) {
  const { data, error, mutate } = useSWR<T>(
    `/api/modules/${moduleId}/data?key=${encodeURIComponent(key)}`,
    fetcher,
  );

  const setData = async (value: T) => {
    await fetch(`/api/modules/${moduleId}/data`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    });
    mutate();
  };

  return {
    data: data ?? null,
    isLoading: !error && data === undefined,
    error,
    setData,
    mutate,
  };
}
