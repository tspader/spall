import { AsyncLocalStorage } from "async_hooks";

export enum FileStatus {
  Added = "added",
  Modified = "modified",
  Removed = "removed",
  Ok = "ok",
}

export type Event =
  | { tag: "init"; action: "create_db"; path: string }
  | { tag: "init"; action: "done" }
  | { tag: "model"; action: "download"; model: string }
  | { tag: "model"; action: "load"; model: string; path: string }
  | { tag: "model"; action: "ready"; model: string }
  | { tag: "scan"; action: "start"; total: number }
  | { tag: "scan"; action: "progress"; path: string; status: FileStatus }
  | { tag: "scan"; action: "done" }
  | {
      tag: "embed";
      action: "start";
      totalDocs: number;
      totalChunks: number;
      totalBytes: number;
    }
  | {
      tag: "embed";
      action: "progress";
      filesProcessed: number;
      totalFiles: number;
      bytesProcessed: number;
      totalBytes: number;
    }
  | { tag: "embed"; action: "done" };

const sseContext = new AsyncLocalStorage<(e: Event) => void>();

export namespace Event {
  export type Handler = (event: Event) => void;

  const handlers: Set<Handler> = new Set();

  /** Subscribe to events. Returns unsubscribe function. */
  export function listen(handler: Handler): () => void {
    handlers.add(handler);
    return () => handlers.delete(handler);
  }

  export function emit(event: Event): void {
    const sseWrite = sseContext.getStore();
    if (sseWrite) {
      // Server path: write to SSE only
      sseWrite(event);
    } else {
      // Client path: notify handlers
      for (const handler of handlers) {
        handler(event);
      }
    }
  }

  /** Run function within SSE context. Events emitted inside go to SSE stream. */
  export function withSSE<T>(write: (e: Event) => void, fn: () => T): T {
    return sseContext.run(write, fn);
  }

  export function clear(): void {
    handlers.clear();
  }
}
