import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "sqlite-vec", "@xenova/transformers", "onnxruntime-node"],
};

export default nextConfig;
