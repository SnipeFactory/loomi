import { NextResponse } from "next/server";
import os from "os";
import path from "path";
import fs from "fs";

interface KnownSource {
  id: string;
  name: string;
  description: string;
  defaultPath: string;
  exists: boolean;
  icon: string;
}

export async function GET() {
  const home = os.homedir();
  const platform = os.platform(); // "linux" | "darwin" | "win32"
  const isWSL = platform === "linux" && fs.existsSync("/proc/version")
    ? fs.readFileSync("/proc/version", "utf-8").toLowerCase().includes("microsoft")
    : false;

  let platformLabel: string;
  if (isWSL) {
    platformLabel = "Windows (WSL)";
  } else if (platform === "darwin") {
    platformLabel = "macOS";
  } else if (platform === "win32") {
    platformLabel = "Windows";
  } else {
    platformLabel = "Linux";
  }

  const sources: KnownSource[] = [
    {
      id: "claude-cli",
      name: "Claude Code (CLI)",
      description: "Claude Code CLI 대화 로그가 저장되는 경로입니다.",
      defaultPath: path.join(home, ".claude", "projects"),
      exists: fs.existsSync(path.join(home, ".claude", "projects")),
      icon: "terminal",
    },
    {
      id: "gemini-cli",
      name: "Gemini CLI",
      description: "Google Gemini CLI 대화 로그가 저장되는 경로입니다.",
      defaultPath: path.join(home, ".gemini", "tmp"),
      exists: fs.existsSync(path.join(home, ".gemini", "tmp")),
      icon: "terminal",
    },
  ];

  return NextResponse.json({
    platform: platformLabel,
    home,
    sources,
  });
}
