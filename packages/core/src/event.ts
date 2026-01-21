export type Event =
  | { tag: "init"; action: "create_db"; path: string }
  | { tag: "init"; action: "done" }
  | { tag: "model"; action: "download"; model: string }
  | { tag: "model"; action: "ready"; model: string }
  | { tag: "scan"; action: "start" }
  | { tag: "scan"; action: "progress"; found: number }
  | {
      tag: "scan";
      action: "done";
      added: number;
      modified: number;
      removed: number;
    }
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
      current: number;
      total: number;
      bytesProcessed: number;
      totalBytes: number;
    }
  | { tag: "embed"; action: "done" };

export namespace Event {
  export type Handler = (event: Event) => void;

  const handlers: Handler[] = [];

  export function on(handler: Handler): void {
    handlers.push(handler);
  }

  export function off(handler: Handler): void {
    const idx = handlers.indexOf(handler);
    if (idx !== -1) handlers.splice(idx, 1);
  }

  export function emit(event: Event): void {
    for (const handler of handlers) {
      handler(event);
    }
  }

  export function clear(): void {
    handlers.length = 0;
  }
}
