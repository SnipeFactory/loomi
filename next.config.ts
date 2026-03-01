import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "sqlite-vec", "@xenova/transformers", "onnxruntime-node"],
  turbopack: {
    resolveAlias: {
      "@features/session-explorer": path.resolve(__dirname, "src/features/session-explorer"),
    },
  },
};

export default nextConfig;
