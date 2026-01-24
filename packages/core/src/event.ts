import { Event as EventSchema, FileStatus as FileStatusSchema } from "./schema";

// Re-export types derived from Zod schemas (single source of truth)
export type Event = EventSchema;
export type FileStatus = FileStatusSchema;

// Re-export the Zod enum values for runtime use
export const FileStatus = {
  Added: "added" as const,
  Modified: "modified" as const,
  Removed: "removed" as const,
  Ok: "ok" as const,
};

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
