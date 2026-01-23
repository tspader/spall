import {
  mkdirSync,
  existsSync,
  unlinkSync,
  readFileSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import type { Server as BunServer } from "bun";
import { Event, type Event as EventType } from "./event";
import { Config } from "./config";

type LockData = { pid: number; port: number };

export namespace Cache {
  export function ensure(): void {
    const dir = Config.get().cacheDir;
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}

export namespace Server {
  let server: BunServer | null = null;
  let persist = false;
  let activeRequests = 0;
  let shutdownTimer: ReturnType<typeof setTimeout> | null = null;

  export namespace Lock {
    export function path(): string {
      return join(Config.get().cacheDir, "server.lock");
    }

    export function read(): LockData | null {
      try {
        const content = readFileSync(path(), "utf-8");
        return JSON.parse(content) as LockData;
      } catch {
        return null;
      }
    }

    export function write(port: number): boolean {
      Cache.ensure();
      try {
        writeFileSync(path(), JSON.stringify({ pid: process.pid, port }), {
          flag: "wx",
        });
        return true;
      } catch {
        return false;
      }
    }

    export function remove(): void {
      try {
        unlinkSync(path());
      } catch {
        // Ignore - may not exist
      }
    }
  }

  function streamEvents(handler: () => Promise<void>): Response {
    return new Response(
      new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();

          const write = (event: EventType) => {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
            );
          };

          const unsubscribe = Event.listen(write);
          try {
            await handler();
          } catch (e) {
            const error = e instanceof Error ? e.message : "Unknown error";
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ error })}\n\n`),
            );
          } finally {
            unsubscribe();
            controller.close();
          }
        },
      }),
      {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      },
    );
  }

  // ============================================
  // Handlers
  // ============================================

  async function index(_db: string, _dir: string): Promise<void> {
    // TODO: Actually do indexing via Store
    // For now, send stub events to prove the pipeline works
    Event.emit({ tag: "scan", action: "start", total: 0 });
    Event.emit({ tag: "scan", action: "done" });
  }

  export type SearchResult = { key: string; distance: number };

  async function search(
    _db: string,
    _query: string,
    _limit?: number,
  ): Promise<SearchResult[]> {
    // TODO: Actually do search via Store + Model
    return [];
  }

  // ============================================
  // Server Lifecycle
  // ============================================

  export type StartOptions = {
    persist?: boolean;
    onShutdown?: () => void;
  };

  export async function start(
    options?: StartOptions,
  ): Promise<{ port: number }> {
    persist = options?.persist ?? false;
    const onShutdown = options?.onShutdown;

    server = Bun.serve({
      port: 0,
      async fetch(req) {
        const url = new URL(req.url);

        activeRequests++;
        if (shutdownTimer) {
          clearTimeout(shutdownTimer);
          shutdownTimer = null;
        }

        try {
          if (req.method === "POST" && url.pathname === "/index") {
            const body = (await req.json()) as { db: string; dir: string };
            return streamEvents(() => index(body.db, body.dir));
          }

          if (req.method === "POST" && url.pathname === "/search") {
            const body = (await req.json()) as {
              db: string;
              query: string;
              limit?: number;
            };
            const results = await search(body.db, body.query, body.limit);
            return Response.json(results);
          }

          if (req.method === "GET" && url.pathname === "/health") {
            return new Response("ok");
          }

          return new Response("Not found", { status: 404 });
        } finally {
          activeRequests--;

          if (!persist && activeRequests === 0) {
            shutdownTimer = setTimeout(() => {
              if (activeRequests === 0) {
                stop();
                if (onShutdown) onShutdown();
              }
            }, 100);
          }
        }
      },
    });

    const port = server.port;
    if (!port) {
      server.stop();
      throw new Error("Failed to get server port");
    }

    if (!Lock.write(port)) {
      server.stop();
      throw new Error("Failed to acquire lock - another server may be running");
    }

    process.once("SIGINT", () => {
      stop();
      if (onShutdown) onShutdown();
    });
    process.once("SIGTERM", () => {
      stop();
      if (onShutdown) onShutdown();
    });

    return { port };
  }

  export function stop(): void {
    if (server) {
      server.stop();
      server = null;
    }
    Lock.remove();
  }
}
