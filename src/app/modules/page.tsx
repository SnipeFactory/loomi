"use client";

import { useState, useRef } from "react";
import useSWR from "swr";
import { useModules } from "@/lib/hooks/use-modules";
import { ModuleCard } from "@/components/modules/module-card";
import { ModuleSettingsDialog } from "@/components/modules/module-settings-dialog";
import { PermissionConsentModal } from "@/components/modules/permission-consent-modal";
import {
  Search, FolderPlus, ArrowLeft, Puzzle, Layers, Blocks, Cpu,
  FolderOpen, ChevronDown, ChevronRight, Pencil, Check, X,
  Upload, RefreshCw, CheckCircle, SkipForward,
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
  supportsUpload?: boolean;
  status?: "stable" | "experimental" | "coming-soon";
}

interface ImportResult {
  imported: number;
  updated: number;
  skipped: number;
  totalSessions: number;
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
  const isComingSoon = adapter.status === "coming-soon";

  return (
    <div className={`border-b border-[hsl(var(--border))] last:border-0 ${isComingSoon ? "opacity-60" : ""}`}>
      {/* Header */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-2">
          {!isComingSoon && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            >
              {expanded
                ? <ChevronDown className="h-3.5 w-3.5" />
                : <ChevronRight className="h-3.5 w-3.5" />
              }
            </button>
          )}
          {isComingSoon && <div className="w-3.5" />}
          <Cpu className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
          <span className="text-sm font-medium text-[hsl(var(--foreground))]">{adapter.name}</span>
          <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] text-emerald-400">
            Collector
          </span>
          {adapter.supportsUpload && (
            <span className="rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[9px] text-blue-400">
              Upload
            </span>
          )}
          {isComingSoon && (
            <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] text-amber-400">
              Coming Soon
            </span>
          )}
          <span className="rounded-full bg-[hsl(var(--muted))] px-1.5 py-0.5 text-[9px] text-[hsl(var(--muted-foreground))]">
            {adapter.provider}
          </span>
          <span className="text-[10px] text-[hsl(var(--muted-foreground))]">v{adapter.version}</span>
        </div>
        <p className="mt-0.5 ml-6 text-xs text-[hsl(var(--muted-foreground))]">{adapter.description}</p>
        {!isComingSoon && adapter.filePatterns.length > 0 && (
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
        )}
      </div>

      {/* Expanded: path editor or upload UI */}
      {expanded && !isComingSoon && (
        adapter.supportsUpload
          ? <UploadSection adapterId={adapter.id} />
          : <PathSection adapter={adapter} />
      )}
    </div>
  );
}

function PathSection({ adapter }: { adapter: AdapterInfo }) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");

  const { data: pathsData, mutate } = useSWR<WatchedPath[]>(
    `/api/watched-paths?toolType=${adapter.id}`,
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
  );
}

type UploadPhase = "idle" | "uploading" | "processing" | "done" | "error";
type UploadMode = "file" | "local-path";

const MAX_CLIENT_SIZE = 200 * 1024 * 1024; // 200 MB

function ImportResult({ result, onReset }: { result: ImportResult; onReset: () => void }) {
  return (
    <div className="rounded border border-[hsl(var(--border))] bg-[hsl(var(--muted)/.4)] divide-y divide-[hsl(var(--border))] text-xs">
      <div className="px-3 py-1.5 text-[hsl(var(--muted-foreground))]">
        {result.totalSessions} sessions processed
      </div>
      <div className="flex items-center gap-2 px-3 py-1.5">
        <CheckCircle className="h-3 w-3 text-green-400" />
        <span className="text-[hsl(var(--muted-foreground))]">Imported</span>
        <span className="ml-auto font-medium text-[hsl(var(--foreground))]">{result.imported}</span>
      </div>
      <div className="flex items-center gap-2 px-3 py-1.5">
        <RefreshCw className="h-3 w-3 text-blue-400" />
        <span className="text-[hsl(var(--muted-foreground))]">Updated</span>
        <span className="ml-auto font-medium text-[hsl(var(--foreground))]">{result.updated}</span>
      </div>
      <div className="flex items-center gap-2 px-3 py-1.5">
        <SkipForward className="h-3 w-3 text-[hsl(var(--muted-foreground))]" />
        <span className="text-[hsl(var(--muted-foreground))]">Skipped</span>
        <span className="ml-auto font-medium text-[hsl(var(--foreground))]">{result.skipped}</span>
      </div>
      <div className="px-3 py-1.5">
        <button onClick={onReset} className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] underline underline-offset-2">
          Import another
        </button>
      </div>
    </div>
  );
}

function UploadSection({ adapterId }: { adapterId: string }) {
  const [mode, setMode] = useState<UploadMode>("file");

  // Shared state
  const [phase, setPhase] = useState<UploadPhase>("idle");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // File mode state
  const [file, setFile] = useState<File | null>(null);
  const [pct, setPct] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Local path mode state
  const [localPath, setLocalPath] = useState("");

  const reset = () => {
    setFile(null); setPhase("idle"); setPct(0); setResult(null); setErrorMsg(null);
    setLocalPath("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const switchMode = (m: UploadMode) => {
    reset();
    setMode(m);
  };

  const isRunning = phase === "uploading" || phase === "processing";

  // ── File mode handlers ──────────────────────────────────────────

  const handleFile = (f: File) => {
    if (!f.name.endsWith(".zip")) { setErrorMsg("Only .zip files are accepted."); return; }
    if (f.size > MAX_CLIENT_SIZE) {
      setErrorMsg("200 MB 초과 파일은 Local Path 모드를 사용하세요.");
      return;
    }
    setFile(f);
    setPhase("idle");
    setResult(null);
    setErrorMsg(null);
  };

  const handleUpload = () => {
    if (!file) return;
    setPhase("uploading");
    setPct(0);
    const formData = new FormData();
    formData.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) setPct(Math.round((e.loaded / e.total) * 100));
    });
    xhr.upload.addEventListener("load", () => setPhase("processing"));
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try { setResult(JSON.parse(xhr.responseText)); setPhase("done"); }
        catch { setErrorMsg("Invalid response."); setPhase("error"); }
      } else {
        try { setErrorMsg(JSON.parse(xhr.responseText).error || "Upload failed."); }
        catch { setErrorMsg(`Server error (${xhr.status})`); }
        setPhase("error");
      }
    });
    xhr.addEventListener("error", () => { setErrorMsg("Network error."); setPhase("error"); });
    xhr.open("POST", `/api/upload/${adapterId}`);
    xhr.send(formData);
  };

  // ── Local path mode handlers ────────────────────────────────────

  const handleLocalImport = async () => {
    const trimmed = localPath.trim();
    if (!trimmed) return;
    setPhase("processing");
    setErrorMsg(null);
    setResult(null);
    try {
      const res = await fetch(`/api/upload/${adapterId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ localPath: trimmed }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult(data);
        setPhase("done");
      } else {
        setErrorMsg(data.error || `Server error (${res.status})`);
        setPhase("error");
      }
    } catch {
      setErrorMsg("Network error.");
      setPhase("error");
    }
  };

  return (
    <div className="px-4 pb-4 ml-6 space-y-2.5">
      {/* Mode toggle */}
      <div className="flex gap-0.5 rounded-md bg-[hsl(var(--muted))] p-0.5 w-fit">
        <button
          onClick={() => switchMode("file")}
          className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
            mode === "file"
              ? "bg-[hsl(var(--background))] text-[hsl(var(--foreground))] shadow-sm"
              : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
          }`}
        >
          Upload File
        </button>
        <button
          onClick={() => switchMode("local-path")}
          className={`rounded px-2.5 py-1 text-[11px] font-medium transition-colors ${
            mode === "local-path"
              ? "bg-[hsl(var(--background))] text-[hsl(var(--foreground))] shadow-sm"
              : "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
          }`}
        >
          Local Path
        </button>
      </div>

      {/* ── File mode ── */}
      {mode === "file" && phase !== "done" && (
        <>
          <div className="flex items-center gap-2">
            <button
              onClick={() => !isRunning && inputRef.current?.click()}
              disabled={isRunning}
              className="rounded bg-[hsl(var(--muted))] px-2.5 py-1 text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] disabled:opacity-50"
            >
              Choose ZIP
            </button>
            {file ? (
              <span className="flex-1 truncate text-xs text-[hsl(var(--foreground))]">
                {file.name} <span className="text-[hsl(var(--muted-foreground))]">({(file.size / 1024 / 1024).toFixed(1)} MB)</span>
              </span>
            ) : (
              <span className="text-xs text-[hsl(var(--muted-foreground))]">No file selected (max 200 MB)</span>
            )}
            {file && !isRunning && (
              <button onClick={reset} className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <input ref={inputRef} type="file" accept=".zip" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
          </div>
          {file && phase === "idle" && (
            <button
              onClick={handleUpload}
              className="flex items-center gap-1.5 rounded bg-[hsl(var(--primary))] px-3 py-1 text-xs text-[hsl(var(--primary-foreground))] hover:opacity-90"
            >
              <Upload className="h-3 w-3" />
              Upload &amp; Import
            </button>
          )}
          {phase === "uploading" && (
            <div className="space-y-1">
              <div className="h-1.5 w-full rounded-full bg-[hsl(var(--muted))]">
                <div className="h-1.5 rounded-full bg-[hsl(var(--primary))] transition-all" style={{ width: `${pct}%` }} />
              </div>
              <span className="text-[10px] text-[hsl(var(--muted-foreground))]">Uploading… {pct}%</span>
            </div>
          )}
        </>
      )}

      {/* ── Local path mode ── */}
      {mode === "local-path" && phase !== "done" && (
        <>
          <div className="flex items-center gap-2">
            <input
              value={localPath}
              onChange={(e) => setLocalPath(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !isRunning) handleLocalImport(); }}
              disabled={isRunning}
              placeholder="/absolute/path/to/file.zip"
              className="flex-1 rounded bg-[hsl(var(--muted))] px-2.5 py-1 text-xs text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-1 focus:ring-[hsl(var(--primary))] disabled:opacity-50"
            />
            <button
              onClick={handleLocalImport}
              disabled={!localPath.trim() || isRunning}
              className="shrink-0 flex items-center gap-1.5 rounded bg-[hsl(var(--primary))] px-3 py-1 text-xs text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-50"
            >
              <Upload className="h-3 w-3" />
              Import
            </button>
          </div>
          <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
            서버 파일시스템 절대 경로 — 대용량 파일에 권장
          </p>
        </>
      )}

      {/* Processing spinner (shared) */}
      {phase === "processing" && (
        <div className="flex items-center gap-1.5 text-xs text-[hsl(var(--muted-foreground))]">
          <RefreshCw className="h-3 w-3 animate-spin" />
          Processing sessions…
        </div>
      )}

      {/* Error (shared) */}
      {phase === "error" && (
        <div className="text-xs text-red-400">
          {errorMsg}{" "}
          <button onClick={reset} className="underline underline-offset-2">retry</button>
        </div>
      )}

      {/* Result (shared) */}
      {phase === "done" && result && (
        <ImportResult result={result} onReset={reset} />
      )}
    </div>
  );
}

export default function ModulesPage() {
  const { modules, explorers, toggleModule, deleteModule, installModule, approveConsent, revokeConsent } = useModules();
  const { data: adapterData } = useSWR<{ adapters: AdapterInfo[] }>("/api/adapters", fetcher);
  const adapters = (adapterData?.adapters || []).sort((a, b) => {
    if (a.status === "stable" && b.status !== "stable") return -1;
    if (a.status !== "stable" && b.status === "stable") return 1;
    return a.name.localeCompare(b.name);
  });

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
