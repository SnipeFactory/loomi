/**
 * Static adapter registration — safe to import from Next.js routes.
 * No dynamic imports; no runtime path resolution.
 */
import { adapterRegistry } from "./registry";
import { ClaudeCliAdapter } from "./claude-cli";
import { ChatGPTExportAdapter } from "./chatgpt-export";
import { CursorAdapter } from "./cursor";
import { AiderAdapter } from "./aider";
import { ClaudeAiExportAdapter } from "./claude-ai-export";

export function registerBuiltinAdapters(): void {
  adapterRegistry.register(new ClaudeCliAdapter());
  adapterRegistry.register(new ChatGPTExportAdapter());
  adapterRegistry.register(new CursorAdapter());
  adapterRegistry.register(new AiderAdapter());
  adapterRegistry.register(new ClaudeAiExportAdapter());
}
