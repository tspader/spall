import {
  mkdirSync,
  existsSync,
  unlinkSync,
  readFileSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import type { Server as BunServer, ServerWebSocket } from "bun";
import type { Event as EventType } from "./event";
import { Config } from "./config";

// Message types
export type ClientMessage =
  | { id: string; cmd: "index"; db: string; dir: string }
  | { id: string; cmd: "search"; db: string; query: string; limit?: number };

export type ServerMessage =
  | { id: string; ok: true; result: unknown }
  | { id: string; ok: false; error: string }
  | { id: string; event: EventType };

type LockData = { pid: number; port: number };

export namespace Server {
  let server: BunServer | null = null;
  let persist = false;
  let clientCount = 0;
  let shutdownTimer: ReturnType<typeof setTimeout> | null = null;
  let eventCallback: ((event: EventType) => void) | null = null;

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

  function emitEvent(event: EventType): void {
    eventCallback?.(event);
  }

  function checkShutdown(): void {
    if (persist) return;
    if (clientCount === 0) {
      // Small delay to allow quick reconnects
      shutdownTimer = setTimeout(() => {
        if (clientCount === 0) {
          stop();
          process.exit(0);
        }
      }, 100);
    }
  }

  function cancelShutdown(): void {
    if (shutdownTimer) {
      clearTimeout(shutdownTimer);
      shutdownTimer = null;
    }
  }

  async function handleMessage(
    ws: ServerWebSocket<unknown>,
    msg: ClientMessage,
  ): Promise<void> {
    const send = (m: ServerMessage) => ws.send(JSON.stringify(m));

    switch (msg.cmd) {
      case "index": {
        // TODO: Actually do indexing via Store
        // For now, emit stub events to prove the pipeline works
        const startEvent: EventType = {
          tag: "scan",
          action: "start",
          total: 0,
        };
        const doneEvent: EventType = { tag: "scan", action: "done" };

        send({ id: msg.id, event: startEvent });
        emitEvent(startEvent);

        send({ id: msg.id, event: doneEvent });
        emitEvent(doneEvent);

        send({
          id: msg.id,
          ok: true,
          result: { added: [], modified: [], removed: [], unembedded: [] },
        });
        break;
      }
      case "search": {
        // TODO: Actually do search via Store + Model
        send({ id: msg.id, ok: true, result: [] });
        break;
      }
    }
  }

  export type StartOptions = {
    persist?: boolean;
    onEvent?: (event: EventType) => void;
  };

  export async function start(
    options?: StartOptions,
  ): Promise<{ port: number }> {
    persist = options?.persist ?? false;
    eventCallback = options?.onEvent ?? null;

    // Try to find a free port by letting OS assign one
    // Bun.serve with port 0 gets a random available port
    server = Bun.serve({
      port: 0,
      fetch(req, server) {
        // Upgrade HTTP requests to WebSocket
        if (server.upgrade(req)) {
          return;
        }
        return new Response("WebSocket only", { status: 400 });
      },
      websocket: {
        open(_ws) {
          clientCount++;
          cancelShutdown();
          emitEvent({ tag: "server", action: "connect", clients: clientCount });
        },
        close(_ws) {
          clientCount--;
          emitEvent({
            tag: "server",
            action: "disconnect",
            clients: clientCount,
          });
          checkShutdown();
        },
        async message(ws, message) {
          try {
            const msg = JSON.parse(message.toString()) as ClientMessage;
            await handleMessage(ws, msg);
          } catch (e) {
            ws.send(
              JSON.stringify({
                id: "error",
                ok: false,
                error: e instanceof Error ? e.message : "Unknown error",
              }),
            );
          }
        },
      },
    });

    const port = server.port;
    if (!port) {
      server.stop();
      throw new Error("Failed to get server port");
    }

    // Try to acquire lock
    if (!writeLock(port)) {
      // Someone else has the lock - we shouldn't have gotten here
      // but handle gracefully
      server.stop();
      throw new Error("Failed to acquire lock - another server may be running");
    }

    // Cleanup on exit
    process.on("SIGINT", () => {
      stop();
      process.exit(0);
    });
    process.on("SIGTERM", () => {
      stop();
      process.exit(0);
    });

    emitEvent({ tag: "server", action: "listening", port });

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
    index(db: string, dir: string): AsyncIterable<EventType>;
    search(db: string, query: string, limit?: number): Promise<VSearchResult[]>;
    close(): void;
  };

  type VSearchResult = { key: string; distance: number };

  type PendingRequest = {
    resolve: (result: unknown) => void;
    reject: (error: Error) => void;
    onEvent?: (event: EventType) => void;
  };

  export async function connect(port: number): Promise<Client> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}`);
      const pending = new Map<string, PendingRequest>();
      let idCounter = 0;

      ws.onopen = () => {
        const client: Client = {
          async *index(db: string, dir: string): AsyncIterable<EventType> {
            const id = String(++idCounter);
            const events: EventType[] = [];
            let done = false;
            let resolveWait: (() => void) | null = null;
            let rejectWait: ((e: Error) => void) | null = null;

            pending.set(id, {
              resolve: () => {
                done = true;
                resolveWait?.();
              },
              reject: (e) => {
                done = true;
                rejectWait?.(e);
              },
              onEvent: (event) => {
                events.push(event);
                resolveWait?.();
              },
            });

            ws.send(JSON.stringify({ id, cmd: "index", db, dir }));

            while (!done || events.length > 0) {
              if (events.length > 0) {
                yield events.shift()!;
              } else if (!done) {
                await new Promise<void>((res, rej) => {
                  resolveWait = res;
                  rejectWait = rej;
                });
              }
            }

            pending.delete(id);
          },

          async search(
            db: string,
            query: string,
            limit?: number,
          ): Promise<VSearchResult[]> {
            const id = String(++idCounter);
            return new Promise((res, rej) => {
              pending.set(id, {
                resolve: (result) => {
                  pending.delete(id);
                  res(result as VSearchResult[]);
                },
                reject: (e) => {
                  pending.delete(id);
                  rej(e);
                },
              });
              ws.send(JSON.stringify({ id, cmd: "search", db, query, limit }));
            });
          },

          close() {
            ws.close();
          },
        };

        resolve(client);
      };

      ws.onerror = () => {
        reject(new Error("WebSocket connection failed"));
      };

      ws.onmessage = (msgEvent) => {
        try {
          const msg = JSON.parse(msgEvent.data.toString()) as ServerMessage;
          const req = pending.get(msg.id);
          if (!req) return;

          if ("event" in msg) {
            req.onEvent?.(msg.event);
          } else if (msg.ok) {
            req.resolve(msg.result);
          } else {
            req.reject(new Error(msg.error));
          }
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onclose = () => {
        for (const req of pending.values()) {
          req.reject(new Error("Connection closed"));
        }
        pending.clear();
      };
    });
  }

  export async function ensureServer(): Promise<Client> {
    const lock = readLock();
    if (lock) {
      try {
        return await connect(lock.port);
      } catch {
        removeLock();
      }
    }

    try {
      const { port } = await start();
      return await connect(port);
    } catch {
      // Lost race - connect to winner
      const newLock = readLock();
      if (!newLock) throw new Error("No server available");
      return await connect(newLock.port);
    }
  }
}
