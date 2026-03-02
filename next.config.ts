import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "sqlite-vec", "@xenova/transformers", "onnxruntime-node"],
  turbopack: {
    resolveAlias: {
      "@features/session-explorer": path.resolve(__dirname, "src/features/session-explorer"),
      "@features/episodic-memory": path.resolve(__dirname, "src/features/episodic-memory"),
    },
  },
};

export default nextConfig;
