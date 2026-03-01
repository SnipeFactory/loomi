import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import os from "os";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  let dirPath = searchParams.get("path") || os.homedir();

  // Resolve ~ to home directory
  if (dirPath.startsWith("~")) {
    dirPath = path.join(os.homedir(), dirPath.slice(1));
  }

  dirPath = path.resolve(dirPath);

  try {
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) {
      return NextResponse.json({ error: "Not a directory" }, { status: 400 });
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const dirs = entries
      .filter((e) => {
        if (!e.isDirectory()) return false;
        // Hide hidden dirs except .claude
        if (e.name.startsWith(".") && e.name !== ".claude") return false;
        return true;
      })
      .map((e) => ({
        name: e.name,
        path: path.join(dirPath, e.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({
      current: dirPath,
      parent: path.dirname(dirPath),
      dirs,
    });
  } catch {
    return NextResponse.json(
      { error: "Cannot read directory", current: dirPath, parent: path.dirname(dirPath), dirs: [] },
      { status: 200 }
    );
  }
}
