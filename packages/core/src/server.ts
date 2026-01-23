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

export namespace Server {
  let server: BunServer | null = null;
  let persist = false;
  let activeRequests = 0;
  let shutdownTimer: ReturnType<typeof setTimeout> | null = null;

  // ============================================
  // Lock File Management
  // ============================================

  function lockPath(): string {
    return join(Config.get().cacheDir, "server.lock");
  }

  function ensureCacheDir(): void {
    const dir = Config.get().cacheDir;
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  function readLock(): LockData | null {
    try {
      const content = readFileSync(lockPath(), "utf-8");
      return JSON.parse(content) as LockData;
    } catch {
      return null;
    }
  }

  function writeLock(port: number): boolean {
    ensureCacheDir();
    try {
      writeFileSync(lockPath(), JSON.stringify({ pid: process.pid, port }), {
        flag: "wx",
      });
      return true;
    } catch {
      return false;
    }
  }

  function removeLock(): void {
    try {
      unlinkSync(lockPath());
    } catch {
      // Ignore - may not exist
    }
  }

  // ============================================
  // Server
  // ============================================

  function sseResponse(
    handler: (send: (event: EventType) => void) => Promise<void>,
  ): Response {
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: EventType) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        };

        try {
          await handler(send);
          controller.close();
        } catch (e) {
          const error = e instanceof Error ? e.message : "Unknown error";
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error })}\n\n`),
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  async function handleIndex(
    _db: string,
    _dir: string,
    send: (event: EventType) => void,
  ): Promise<void> {
    // TODO: Actually do indexing via Store
    // For now, send stub events to prove the pipeline works
    send({ tag: "scan", action: "start", total: 0 });
    send({ tag: "scan", action: "done" });
  }

  async function handleSearch(
    _db: string,
    _query: string,
    _limit?: number,
  ): Promise<VSearchResult[]> {
    // TODO: Actually do search via Store + Model
    return [];
  }

  export type StartOptions = {
    persist?: boolean;
  };

  export async function start(
    options?: StartOptions,
  ): Promise<{ port: number }> {
    persist = options?.persist ?? false;

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
            return sseResponse((send) => handleIndex(body.db, body.dir, send));
          }

          if (req.method === "POST" && url.pathname === "/search") {
            const body = (await req.json()) as {
              db: string;
              query: string;
              limit?: number;
            };
            const results = await handleSearch(body.db, body.query, body.limit);
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
                process.exit(0);
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

    if (!writeLock(port)) {
      server.stop();
      throw new Error("Failed to acquire lock - another server may be running");
    }

    process.on("SIGINT", () => {
      stop();
      process.exit(0);
    });
    process.on("SIGTERM", () => {
      stop();
      process.exit(0);
    });

    return { port };
  }

  export function stop(): void {
    if (server) {
      server.stop();
      server = null;
    }
    removeLock();
  }

  // ============================================
  // Client
  // ============================================

  export type Client = {
    index(db: string, dir: string): Promise<void>;
    search(db: string, query: string, limit?: number): Promise<VSearchResult[]>;
    close(): void;
  };

  type VSearchResult = { key: string; distance: number };

  async function sse(url: string, init?: RequestInit): Promise<void> {
    const response = await fetch(url, init);

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = JSON.parse(line.slice(6));
          if (data.error) {
            throw new Error(data.error);
          }
          Event.emit(data as EventType);
        }
      }
    }
  }

  function connectTo(port: number): Client {
    const baseUrl = `http://127.0.0.1:${port}`;

    return {
      index(db: string, dir: string): Promise<void> {
        return sse(`${baseUrl}/index`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ db, dir }),
        });
      },

      async search(
        db: string,
        query: string,
        limit?: number,
      ): Promise<VSearchResult[]> {
        const response = await fetch(`${baseUrl}/search`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ db, query, limit }),
        });

        if (!response.ok) {
          throw new Error(`Server error: ${response.status}`);
        }

        return response.json() as Promise<VSearchResult[]>;
      },

      close() {
        // No persistent connection to close with HTTP
      },
    };
  }

  async function isServerRunning(port: number): Promise<boolean> {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }

  export async function connect(): Promise<Client> {
    const lock = readLock();
    if (lock) {
      if (await isServerRunning(lock.port)) {
        return connectTo(lock.port);
      }
      removeLock();
    }

    try {
      const { port } = await start();
      return connectTo(port);
    } catch {
      // Lost race - connect to winner
      const newLock = readLock();
      if (!newLock) throw new Error("No server available");
      return connectTo(newLock.port);
    }
  }
}
