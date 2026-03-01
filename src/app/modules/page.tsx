"use client";

import { useState } from "react";
import useSWR from "swr";
import { useModules } from "@/lib/hooks/use-modules";
import { ModuleCard } from "@/components/modules/module-card";
import { ModuleSettingsDialog } from "@/components/modules/module-settings-dialog";
import { PermissionConsentModal } from "@/components/modules/permission-consent-modal";
import {
  Search, FolderPlus, ArrowLeft, Puzzle, Layers, Blocks, Cpu,
  FolderOpen, ChevronDown, ChevronRight, Pencil, Check, X,
} from "lucide-react";
import type { Module } from "@/types/domain";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Tab = "collectors" | "explorers";

interface AdapterInfo {
  id: string;
  name: string;
  version: string;
  provider: string;
  description: string;
  filePatterns: string[];
  defaultPaths?: string[];
}

interface WatchedPath {
  id: number;
  path: string;
  label: string | null;
  toolType: string;
  enabled: boolean;
}

function CollectorCard({ adapter }: { adapter: AdapterInfo }) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");

  const { data: pathsData, mutate } = useSWR<WatchedPath[]>(
    expanded ? `/api/watched-paths?toolType=${adapter.id}` : null,
    fetcher,
  );
  const currentPath = pathsData?.[0] ?? null;

  const handleEdit = () => {
    setEditValue(currentPath?.path ?? adapter.defaultPaths?.[0] ?? "");
    setEditing(true);
  };

  const handleSave = async () => {
    const trimmed = editValue.trim();
    if (!trimmed) return;
    await fetch("/api/watched-paths", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toolType: adapter.id, path: trimmed, label: adapter.name }),
    });
    setEditing(false);
    mutate();
  };

  const handleCancel = () => {
    setEditing(false);
    setEditValue("");
  };

  return (
    <div className="border-b border-[hsl(var(--border))] last:border-0">
      <div className="px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
          >
            {expanded
              ? <ChevronDown className="h-3.5 w-3.5" />
              : <ChevronRight className="h-3.5 w-3.5" />
            }
          </button>
          <Cpu className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
          <span className="text-sm font-medium text-[hsl(var(--foreground))]">{adapter.name}</span>
          <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] text-emerald-400">
            Collector
          </span>
          <span className="rounded-full bg-[hsl(var(--muted))] px-1.5 py-0.5 text-[9px] text-[hsl(var(--muted-foreground))]">
            {adapter.provider}
          </span>
          <span className="text-[10px] text-[hsl(var(--muted-foreground))]">v{adapter.version}</span>
        </div>
        <p className="mt-0.5 ml-6 text-xs text-[hsl(var(--muted-foreground))]">{adapter.description}</p>
        <div className="mt-1 ml-6 flex gap-1 flex-wrap">
          {adapter.filePatterns.map((pattern) => (
            <code
              key={pattern}
              className="rounded bg-[hsl(var(--muted))] px-1 py-0.5 text-[9px] text-[hsl(var(--muted-foreground))]"
            >
              {pattern}
            </code>
          ))}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-3 ml-6">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-3 w-3 text-[hsl(var(--muted-foreground))] shrink-0" />
            {editing ? (
              <>
                <input
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") handleCancel(); }}
                  className="flex-1 rounded bg-[hsl(var(--muted))] px-2 py-1 text-xs text-[hsl(var(--foreground))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))]"
                />
                <button onClick={handleSave} className="text-green-400 hover:text-green-300">
                  <Check className="h-3.5 w-3.5" />
                </button>
                <button onClick={handleCancel} className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
                  <X className="h-3.5 w-3.5" />
                </button>
              </>
            ) : (
              <>
                <span className="flex-1 truncate text-xs text-[hsl(var(--foreground))]">
                  {currentPath?.path ?? adapter.defaultPaths?.[0] ?? "Not configured"}
                </span>
                <button onClick={handleEdit} className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
                  <Pencil className="h-3 w-3" />
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ModulesPage() {
  const { modules, explorers, toggleModule, deleteModule, installModule, approveConsent, revokeConsent } = useModules();
  const { data: adapterData } = useSWR<{ adapters: AdapterInfo[] }>("/api/adapters", fetcher);
  const adapters = adapterData?.adapters || [];

  const [tab, setTab] = useState<Tab>("collectors");
  const [search, setSearch] = useState("");
  const [installPath, setInstallPath] = useState("");
  const [showInstall, setShowInstall] = useState(false);
  const [settingsModule, setSettingsModule] = useState<Module | null>(null);
  const [consentModule, setConsentModule] = useState<Module | null>(null);

  const filteredExplorers = explorers.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.moduleId.toLowerCase().includes(search.toLowerCase())
  );
  const filteredAdapters = adapters.filter(
    (a) =>
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.id.toLowerCase().includes(search.toLowerCase())
  );

  const handleInstall = async () => {
    if (!installPath.trim()) return;
    await installModule(installPath.trim());
    setInstallPath("");
    setShowInstall(false);
  };

  const handleApproveConsent = async () => {
    if (!consentModule) return;
    await approveConsent(consentModule.moduleId);
    setConsentModule(null);
  };

  const handleDenyConsent = async () => {
    if (!consentModule) return;
    await revokeConsent(consentModule.moduleId);
    setConsentModule(null);
  };

  const getConsentPermissions = (mod: Module): string[] => {
    try {
      const manifest = JSON.parse(mod.manifestJson);
      return manifest.permissions || [];
    } catch {
      return [];
    }
  };

  return (
    <div className="h-screen bg-[hsl(var(--background))] overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <a
              href="/"
              className="rounded p-1 hover:bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            >
              <ArrowLeft className="h-4 w-4" />
            </a>
            <div className="flex items-center gap-2">
              <Puzzle className="h-5 w-5 text-[hsl(var(--primary))]" />
              <h1 className="text-lg font-semibold text-[hsl(var(--foreground))]">
                Modules
              </h1>
            </div>
          </div>
          {tab === "explorers" && (
            <button
              onClick={() => setShowInstall(!showInstall)}
              className="flex items-center gap-1.5 rounded-md bg-[hsl(var(--primary))] px-3 py-1.5 text-xs text-[hsl(var(--primary-foreground))] hover:opacity-90"
            >
              <FolderPlus className="h-3.5 w-3.5" />
              Install from Path
            </button>
          )}
        </div>

        {/* Install input */}
        {showInstall && tab === "explorers" && (
          <div className="mb-4 flex gap-2 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3">
            <input
              value={installPath}
              onChange={(e) => setInstallPath(e.target.value)}
              placeholder="Enter module directory path..."
              className="flex-1 rounded-md bg-[hsl(var(--muted))] px-3 py-1.5 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))]"
            />
            <button
              onClick={handleInstall}
              className="rounded-md bg-[hsl(var(--primary))] px-4 py-1.5 text-xs text-[hsl(var(--primary-foreground))] hover:opacity-90"
            >
              Install
            </button>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mb-4 rounded-lg bg-[hsl(var(--muted))] p-1">
          <button
            onClick={() => setTab("collectors")}
            className={`flex items-center gap-1.5 rounded-md px-4 py-2 text-xs font-medium transition-colors ${
              tab === "collectors"
                ? "bg-[hsl(var(--background))] text-[hsl(var(--foreground))] shadow-sm"
                : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            Collectors
            <span className="ml-1 rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] text-emerald-400">
              {adapters.length}
            </span>
          </button>
          <button
            onClick={() => setTab("explorers")}
            className={`flex items-center gap-1.5 rounded-md px-4 py-2 text-xs font-medium transition-colors ${
              tab === "explorers"
                ? "bg-[hsl(var(--background))] text-[hsl(var(--foreground))] shadow-sm"
                : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            }`}
          >
            <Blocks className="h-3.5 w-3.5" />
            Explorers
            <span className="ml-1 rounded-full bg-purple-500/20 px-1.5 py-0.5 text-[10px] text-purple-400">
              {explorers.length}
            </span>
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${tab}...`}
            className="w-full rounded-md bg-[hsl(var(--muted))] pl-9 pr-3 py-2 text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))]"
          />
        </div>

        {/* Collectors tab */}
        {tab === "collectors" && (
          <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] divide-y divide-[hsl(var(--border))]">
            {filteredAdapters.length === 0 ? (
              <div className="p-8 text-center text-sm text-[hsl(var(--muted-foreground))]">
                No collectors found.
              </div>
            ) : (
              filteredAdapters.map((adapter) => (
                <CollectorCard key={adapter.id} adapter={adapter} />
              ))
            )}
          </div>
        )}

        {/* Explorers grid */}
        {tab === "explorers" && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filteredExplorers.map((mod) => (
                <ModuleCard
                  key={mod.moduleId}
                  module={mod}
                  onToggle={toggleModule}
                  onDelete={deleteModule}
                  onSettings={(id) => {
                    const m = modules.find((ml) => ml.moduleId === id);
                    if (m) setSettingsModule(m);
                  }}
                />
              ))}
            </div>
            {filteredExplorers.length === 0 && (
              <div className="text-center py-12 text-sm text-[hsl(var(--muted-foreground))]">
                No explorer modules found.
              </div>
            )}
          </>
        )}
      </div>

      {/* Settings dialog */}
      {settingsModule && (
        <ModuleSettingsDialog
          moduleId={settingsModule.moduleId}
          manifestJson={settingsModule.manifestJson}
          onClose={() => setSettingsModule(null)}
        />
      )}

      {/* Consent modal */}
      {consentModule && (
        <PermissionConsentModal
          moduleId={consentModule.moduleId}
          moduleName={consentModule.name}
          permissions={getConsentPermissions(consentModule)}
          onApprove={handleApproveConsent}
          onDeny={handleDenyConsent}
          onClose={() => setConsentModule(null)}
        />
      )}
    </div>
  );
}
