/**
 * EmbeddingWorkerClient — main process side of the embedding worker IPC.
 *
 * Forks embedding-worker.ts as a child process via tsx, keeping the ONNX
 * runtime (C++) memory-isolated from the Next.js / Turbopack process.
 *
 * Features:
 *   - Per-request UUID → pending Promise map
 *   - Configurable timeout (EMBED_TIMEOUT_MS, default 30s)
 *   - start() returns Promise that resolves when the worker IPC channel is ready
 *   - _send() awaits readiness so callers don't need to sequence manually
 *   - Auto-restart on worker exit (up to MAX_RESTARTS times)
 *   - Graceful shutdown via dispose()
 */

import { fork, ChildProcess } from "child_process";
import { randomUUID } from "crypto";
import path from "path";

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

export interface WorkerHealth {
  status: "ready" | "restarting" | "dead";
  lastAlive: number | null;
  restartCount: number;
  pendingRequests: number;
}

interface PendingRequest {
  resolve: (vector: number[]) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

const TIMEOUT_MS   = parseInt(process.env.EMBED_TIMEOUT_MS || "30000", 10);
const MAX_RESTARTS = 5;
const RESTART_DELAY_MS = 3000;

class EmbeddingWorkerClient {
  private worker: ChildProcess | null = null;
  private pending = new Map<string, PendingRequest>();
  private restartCount = 0;
  private disposed = false;
  private lastAliveAt: number | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  /** Resolves when the worker IPC channel is open and ready */
  private readyPromise: Promise<void> | null = null;

  /** Start the worker. Returns a promise that resolves when IPC is connected. */
  start(): Promise<void> {
    if (!this.readyPromise) {
      this.readyPromise = this._fork();
    }
    return this.readyPromise;
  }

  private _fork(): Promise<void> {
    if (this.disposed) return Promise.resolve();

    const workerPath = path.resolve(__dirname, "embedding-worker.ts");
    const tsxBin = path.resolve(process.cwd(), "node_modules", ".bin", "tsx");

    return new Promise<void>((resolve, reject) => {
      const worker = fork(workerPath, [], {
        execPath: tsxBin,
        execArgv: [],
        stdio: ["inherit", "inherit", "inherit", "ipc"],
      });
      this.worker = worker;

      // Resolve as soon as the IPC channel is established
      worker.once("spawn", () => {
        console.log(`[EmbeddingWorker] started (pid: ${worker.pid})`);
        this.lastAliveAt = Date.now();
        this._startHeartbeat();
        resolve();
      });

      // If the process fails to even start, reject the ready promise
      worker.once("error", (err) => {
        reject(err);
      });

      worker.on("message", (msg: WorkerResponse) => {
        // Handle heartbeat pong
        if ("type" in msg && msg.type === "pong") {
          this.lastAliveAt = Date.now();
          return;
        }

        const pending = this.pending.get((msg as { id: string }).id);
        if (!pending) return;
        clearTimeout(pending.timer);
        this.pending.delete((msg as { id: string }).id);

        if ("error" in msg) {
          pending.reject(new Error((msg as { error: string }).error));
        } else {
          pending.resolve((msg as { vector: number[] }).vector);
        }
      });

      worker.on("exit", (code, signal) => {
        if (this.disposed) return;
        console.warn(`[EmbeddingWorker] exited (code=${code}, signal=${signal})`);
        this._stopHeartbeat();

        // Reject all pending requests
        for (const [id, pending] of this.pending) {
          clearTimeout(pending.timer);
          pending.reject(new Error("[EmbeddingWorker] worker exited unexpectedly"));
          this.pending.delete(id);
        }

        this.worker = null;
        this.readyPromise = null;

        // Auto-restart
        if (this.restartCount < MAX_RESTARTS) {
          this.restartCount++;
          console.log(`[EmbeddingWorker] restarting in ${RESTART_DELAY_MS}ms (attempt ${this.restartCount}/${MAX_RESTARTS})...`);
          const timer = setTimeout(() => {
            if (!this.disposed) this.readyPromise = this._fork();
          }, RESTART_DELAY_MS);
          timer.unref();
        } else {
          console.error(`[EmbeddingWorker] max restarts (${MAX_RESTARTS}) reached — embedding is permanently disabled for this session`);
        }
      });
    });
  }

  private async _send(req: WorkerRequest): Promise<number[]> {
    // Wait for the worker to be ready (handles the startup race)
    if (this.readyPromise) {
      await this.readyPromise;
    }

    return new Promise((resolve, reject) => {
      if (!this.worker || !this.worker.connected) {
        reject(new Error("[EmbeddingWorker] worker not available"));
        return;
      }

      const id = (req as { id?: string }).id!;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`[EmbeddingWorker] request timed out after ${TIMEOUT_MS}ms`));
      }, TIMEOUT_MS);
      timer.unref();

      this.pending.set(id, { resolve, reject, timer });
      this.worker.send(req);
    });
  }

  async embed(text: string, modelName: string): Promise<number[]> {
    const id = randomUUID();
    return this._send({ id, type: "embed", text, modelName });
  }

  private _startHeartbeat(): void {
    this._stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.worker && this.worker.connected) {
        this.worker.send({ type: "ping" });
      }
    }, 30_000);
    this.heartbeatTimer.unref();
  }

  private _stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  getWorkerHealth(): WorkerHealth {
    let status: "ready" | "restarting" | "dead";
    if (this.disposed) {
      status = "dead";
    } else if (this.worker && this.worker.connected) {
      status = "ready";
    } else if (this.restartCount >= MAX_RESTARTS) {
      status = "dead";
    } else {
      status = "restarting";
    }
    return {
      status,
      lastAlive: this.lastAliveAt,
      restartCount: this.restartCount,
      pendingRequests: this.pending.size,
    };
  }

  async embedPair(
    userText: string,
    assistantText: string,
    modelName: string,
    toolNames?: string[],
    sessionTagString?: string
  ): Promise<number[]> {
    const id = randomUUID();
    return this._send({
      id,
      type: "embed-pair",
      userText,
      assistantText,
      modelName,
      toolNames,
      sessionTagString,
    });
  }

  dispose(): void {
    this.disposed = true;
    this._stopHeartbeat();
    for (const [, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error("[EmbeddingWorker] disposed"));
    }
    this.pending.clear();
    if (this.worker) {
      try {
        this.worker.send({ type: "shutdown" });
        const timer = setTimeout(() => this.worker?.kill(), 1000);
        timer.unref();
      } catch {
        this.worker.kill();
      }
    }
  }
}

// ── Singleton ─────────────────────────────────────────────────────

let _client: EmbeddingWorkerClient | null = null;

export function getEmbeddingWorkerClient(): EmbeddingWorkerClient {
  if (!_client) {
    _client = new EmbeddingWorkerClient();
  }
  return _client;
}
