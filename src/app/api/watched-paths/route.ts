import { NextResponse } from "next/server";
import { listWatchedPaths, setWatchedPath, addWatchedPath, removeWatchedPath, restartWatcher } from "@core/api/watched-paths";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const moduleId = searchParams.get("moduleId") || undefined;
  const toolType = searchParams.get("toolType") || undefined;

  const paths = listWatchedPaths(moduleId, toolType);
  return NextResponse.json(paths);
}

export async function POST(request: Request) {
  const body = await request.json();

  const { path, toolType, label, moduleId } = body;
  if (!path) {
    return NextResponse.json({ error: "path is required" }, { status: 400 });
  }

  try {
    const created = addWatchedPath(path, { toolType, label, moduleId });
    await restartWatcher();
    return NextResponse.json(created, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("UNIQUE")) {
      return NextResponse.json({ error: "Path already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const body = await request.json();
  const { toolType, path, label } = body;
  if (!toolType || !path) {
    return NextResponse.json({ error: "toolType and path are required" }, { status: 400 });
  }
  try {
    const updated = setWatchedPath(toolType, path, label);
    await restartWatcher();
    return NextResponse.json(updated);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  removeWatchedPath(parseInt(id));
  await restartWatcher();

  return NextResponse.json({ ok: true });
}
