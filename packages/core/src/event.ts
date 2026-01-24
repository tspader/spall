import { Event as EventSchema, FileStatus as FileStatusSchema } from "./schema";

export type Event = EventSchema;
export type FileStatus = FileStatusSchema;

export const FileStatus = {
  Added: "added" as const,
  Modified: "modified" as const,
  Removed: "removed" as const,
  Ok: "ok" as const,
};

export namespace Bus {
  export type Handler = (event: Event) => void | Promise<void>;

  const handlers: Set<Handler> = new Set();

  export function listen(handler: Handler): () => void {
    handlers.add(handler);
    return () => handlers.delete(handler);
  }

  export async function emit(event: Event): Promise<void> {
    for (const handler of handlers) {
      await handler(event);
    }
  }

  export function clear(): void {
    handlers.clear();
  }
}
