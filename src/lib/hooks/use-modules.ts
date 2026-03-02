"use client";

import useSWR from "swr";
import type { Module } from "@/types/domain";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useModules() {
  const { data, error, mutate } = useSWR<Module[]>("/api/modules", fetcher, {
    refreshInterval: 60000,
    revalidateOnFocus: false,
  });

  const toggleModule = async (moduleId: string, enabled: boolean) => {
    await fetch(`/api/modules/${moduleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    mutate();
  };

  const deleteModule = async (moduleId: string) => {
    await fetch(`/api/modules/${moduleId}`, { method: "DELETE" });
    mutate();
  };

  const installModule = async (dirPath: string) => {
    const res = await fetch("/api/modules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dirPath }),
    });
    const result = await res.json();
    mutate();
    return result;
  };

  const approveConsent = async (moduleId: string) => {
    await fetch(`/api/modules/${moduleId}/consent`, { method: "POST" });
    mutate();
  };

  const revokeConsent = async (moduleId: string) => {
    await fetch(`/api/modules/${moduleId}/consent`, { method: "DELETE" });
    mutate();
  };

  const allModules = data || [];

  return {
    modules: allModules,
    explorers: allModules.filter((p) => p.tier === "explorer" || !p.tier),
    isLoading: !error && !data,
    error,
    toggleModule,
    deleteModule,
    installModule,
    approveConsent,
    revokeConsent,
    mutate,
  };
}
