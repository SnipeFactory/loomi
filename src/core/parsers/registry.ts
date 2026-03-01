import type { ILogParser } from "./types";
import { ClaudeCliParser } from "./claude-cli";
import { adapterRegistry } from "../adapters/registry";

class ParserRegistry {
  private parsers: ILogParser[] = [];

  register(parser: ILogParser) {
    this.parsers.push(parser);
  }

  getParserForFile(filePath: string): ILogParser | null {
    // First try adapter registry (new system)
    const adapter = adapterRegistry.getAdapterForFile(filePath);
    if (adapter) {
      // Wrap adapter as ILogParser for backward compatibility
      return {
        toolType: adapter.metadata.id,
        canParse: (fp: string) => adapter.detectFile(fp).detected,
        parseLines: (lines: string[], fp: string) => adapter.parseLines(lines, fp),
      };
    }

    // Fallback to legacy parsers
    return this.parsers.find((p) => p.canParse(filePath)) ?? null;
  }
}

export const parserRegistry = new ParserRegistry();
// Keep legacy parser as fallback (adapter registry is primary)
parserRegistry.register(new ClaudeCliParser());
