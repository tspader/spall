export type Event =
  | { tag: "init"; action: "create_db"; path: string }
  | { tag: "init"; action: "done" }
  | { tag: "model"; action: "download"; model: string }
  | { tag: "model"; action: "ready"; model: string };

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
