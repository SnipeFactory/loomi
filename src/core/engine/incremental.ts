import { createReadStream } from "fs";
import readline from "readline";

export async function readNewLines(
  filePath: string,
  byteOffset: number
): Promise<{ lines: string[]; bytesRead: number }> {
  const lines: string[] = [];
  let bytesRead = 0;

  const stream = createReadStream(filePath, {
    start: byteOffset,
    encoding: "utf-8",
  });

  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (line.trim()) {
      lines.push(line);
    }
    bytesRead += Buffer.byteLength(line, "utf-8") + 1; // +1 for newline
  }

  return { lines, bytesRead };
}
