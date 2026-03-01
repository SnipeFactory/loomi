import {
  Terminal,
  FileText,
  FileEdit,
  FolderSearch,
  Search,
  Globe,
  UserQuestion,
  Wrench,
  LucideIcon,
  Code2,
  Database,
  BrainCircuit,
  MessageCircle,
} from "lucide-react";

export interface ToolStyle {
  color: string;
  icon: LucideIcon;
}

const TOOL_STYLE_MAP: Record<string, ToolStyle> = {
  // Shell / Execution
  bash: { color: "bg-emerald-500", icon: Terminal },
  run_shell_command: { color: "bg-emerald-500", icon: Terminal },

  // File Operations (Read)
  read_file: { color: "bg-blue-500", icon: FileText },
  list_directory: { color: "bg-blue-400", icon: FolderSearch },
  glob: { color: "bg-blue-400", icon: Search },

  // File Operations (Write/Edit)
  write_file: { color: "bg-amber-500", icon: FileEdit },
  replace: { color: "bg-amber-600", icon: FileEdit },
  insert: { color: "bg-amber-600", icon: FileEdit },

  // Search / Discovery
  grep_search: { color: "bg-purple-500", icon: Search },
  search: { color: "bg-indigo-500", icon: Database },
  codebase_investigator: { color: "bg-indigo-600", icon: BrainCircuit },

  // Web
  web_fetch: { color: "bg-cyan-500", icon: Globe },
  google_web_search: { color: "bg-cyan-600", icon: Globe },

  // Interaction / Skills
  ask_user: { color: "bg-pink-500", icon: UserQuestion },
  activate_skill: { color: "bg-rose-500", icon: SparklesIcon() as any }, // Handled specially below
  save_memory: { color: "bg-rose-400", icon: BrainCircuit },

  // MCP / Meta
  cli_help: { color: "bg-slate-500", icon: MessageCircle },
};

// Fallback for Sparkles since it's used in PROVIDER_ICONS too
function SparklesIcon() {
  return Wrench; // Use Wrench as fallback if needed
}

/**
 * Gets consistent color and icon for a tool name (case-insensitive)
 */
export function getToolStyle(name: string): ToolStyle {
  const normalized = name.toLowerCase();
  
  // Try exact match
  if (TOOL_STYLE_MAP[normalized]) return TOOL_STYLE_MAP[normalized];

  // Try partial matches for common patterns
  if (normalized.includes("bash") || normalized.includes("shell")) {
    return { color: "bg-emerald-500", icon: Terminal };
  }
  if (normalized.includes("read") || normalized.includes("list")) {
    return { color: "bg-blue-500", icon: FileText };
  }
  if (normalized.includes("write") || normalized.includes("replace") || normalized.includes("edit")) {
    return { color: "bg-amber-500", icon: FileEdit };
  }
  if (normalized.includes("search") || normalized.includes("grep") || normalized.includes("find")) {
    return { color: "bg-purple-500", icon: Search };
  }
  if (normalized.includes("web") || normalized.includes("google") || normalized.includes("fetch")) {
    return { color: "bg-cyan-500", icon: Globe };
  }

  // Default fallback
  return { color: "bg-gray-500", icon: Wrench };
}
