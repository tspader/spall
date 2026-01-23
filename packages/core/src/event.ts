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

export namespace Event {
  export type Handler = (event: Event) => void;

  const handlers: Set<Handler> = new Set();

  export function listen(handler: Handler): () => void {
    handlers.add(handler);
    return () => handlers.delete(handler);
  }

  export function emit(event: Event): void {
    for (const handler of handlers) {
      handler(event);
    }
  }

  export function clear(): void {
    handlers.clear();
  }
}
