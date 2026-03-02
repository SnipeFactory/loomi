/**
 * Embedding Worker — runs as a child_process.fork() child.
 * Receives IPC messages from EmbeddingWorkerClient and returns embedding vectors.
 * Keeps ONNX runtime (C++) isolated from the main Next.js process.
 */

import {
  generateEmbeddingWithModel,
  generateMessagePairEmbeddingWithModel,
  disposeEmbeddings,
} from "./index";

type WorkerRequest =
  | { id: string; type: "embed"; text: string; modelName: string }
  | {
      id: string;
      type: "embed-pair";
      userText: string;
      assistantText: string;
      modelName: string;
      toolNames?: string[];
      sessionTagString?: string;
    }
  | { type: "shutdown" }
  | { type: "ping" };

type WorkerResponse =
  | { id: string; vector: number[] }
  | { id: string; error: string }
  | { type: "pong" };

process.on("message", async (req: WorkerRequest) => {
  if (req.type === "shutdown") {
    await disposeEmbeddings();
    process.exit(0);
  }

  if (req.type === "ping") {
    process.send!({ type: "pong" } as WorkerResponse);
    return;
  }

  try {
    let vector: number[];
    if (req.type === "embed") {
      vector = await generateEmbeddingWithModel(req.text, req.modelName);
    } else {
      vector = await generateMessagePairEmbeddingWithModel(
        req.userText,
        req.assistantText,
        req.modelName,
        req.toolNames,
        req.sessionTagString
      );
    }
    const response: WorkerResponse = { id: req.id, vector };
    process.send!(response);
  } catch (e) {
    const response: WorkerResponse = { id: req.id, error: String(e) };
    process.send!(response);
  }
});

process.on("SIGTERM", async () => {
  await disposeEmbeddings();
  process.exit(0);
});
