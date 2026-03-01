/**
 * DataScrubber — masks sensitive data before passing to Explorer modules.
 * Applies regex-based redaction for API keys, tokens, and secrets.
 */

const SCRUB_PATTERNS: { name: string; regex: RegExp; replacement: string }[] = [
  // API Keys
  { name: "anthropic_key", regex: /sk-ant-[a-zA-Z0-9\-_]{20,}/g, replacement: "[ANTHROPIC_KEY_REDACTED]" },
  { name: "openai_key", regex: /sk-[a-zA-Z0-9]{20,}/g, replacement: "[OPENAI_KEY_REDACTED]" },
  // Bearer tokens
  { name: "bearer_token", regex: /Bearer\s+[a-zA-Z0-9\-._~+/]+=*/g, replacement: "Bearer [TOKEN_REDACTED]" },
  // AWS
  { name: "aws_access_key", regex: /AKIA[0-9A-Z]{16}/g, replacement: "[AWS_KEY_REDACTED]" },
  { name: "aws_secret_key", regex: /(?<=aws_secret_access_key\s*[=:]\s*)[A-Za-z0-9/+=]{40}/g, replacement: "[AWS_SECRET_REDACTED]" },
  // GitHub
  { name: "github_token", regex: /gh[pousr]_[A-Za-z0-9_]{36,}/g, replacement: "[GITHUB_TOKEN_REDACTED]" },
  { name: "github_classic", regex: /ghp_[A-Za-z0-9]{36}/g, replacement: "[GITHUB_TOKEN_REDACTED]" },
  // Generic secrets
  { name: "generic_secret", regex: /(?<=(?:secret|password|token|api_key|apikey|api-key)\s*[=:]\s*["']?)[^\s"']{8,}/gi, replacement: "[SECRET_REDACTED]" },
  // Private keys
  { name: "private_key", regex: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA )?PRIVATE KEY-----/g, replacement: "[PRIVATE_KEY_REDACTED]" },
  // Connection strings
  { name: "connection_string", regex: /(?:mongodb|postgres|mysql|redis):\/\/[^\s"']+/gi, replacement: "[CONNECTION_STRING_REDACTED]" },
];

export class DataScrubber {
  /** Scrub sensitive data from a text string */
  scrub(text: string): string {
    let result = text;
    for (const { regex, replacement } of SCRUB_PATTERNS) {
      result = result.replace(regex, replacement);
    }
    return result;
  }

  /** Scrub sensitive data from a message-like record */
  scrubMessage(record: Record<string, unknown>): Record<string, unknown> {
    const scrubbed = { ...record };
    for (const [key, value] of Object.entries(scrubbed)) {
      if (typeof value === "string") {
        scrubbed[key] = this.scrub(value);
      }
    }
    return scrubbed;
  }

  /** Scrub an array of records */
  scrubRecords(records: Record<string, unknown>[]): Record<string, unknown>[] {
    return records.map((r) => this.scrubMessage(r));
  }
}

// Singleton
let instance: DataScrubber | undefined;
export function getDataScrubber(): DataScrubber {
  if (!instance) {
    instance = new DataScrubber();
  }
  return instance;
}
