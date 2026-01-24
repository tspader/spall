import {
  mkdirSync,
  existsSync,
  unlinkSync,
  readFileSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import type { Server as BunServer } from "bun";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import {
  describeRoute,
  generateSpecs,
  resolver,
  validator,
} from "hono-openapi";
import { z } from "zod";

import { Event, type Event as EventType } from "./event";
import { Config } from "./config";
import { Store } from "./store";
import { Model } from "./model";
import {
  fn,
  InitInput,
  InitResponse,
  IndexInput,
  SearchInput,
  SearchResult,
  IndexEvent,
} from "./schema";

type LockData = { pid: number; port: number };

const SPALL_DIR = ".spall";
const DB_NAME = "spall.db";
const NOTES_DIR = "notes";

/** Derive paths from a project directory */
function paths(directory: string) {
  const spallDir = join(directory, SPALL_DIR);
  return {
    spallDir,
    dbPath: join(spallDir, DB_NAME),
    notesDir: join(spallDir, NOTES_DIR),
  };
}

export namespace Cache {
  export function ensure(): void {
    const dir = Config.get().cacheDir;
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}

// ============================================
// Domain Functions
// ============================================

export const init = fn(InitInput, async (input): Promise<void> => {
  const { spallDir, dbPath, notesDir } = paths(input.directory);

  // Create .spall directory
  if (!existsSync(spallDir)) {
    mkdirSync(spallDir, { recursive: true });
    Event.emit({ tag: "init", action: "create_dir", path: spallDir });
  }

  // Create notes directory
  if (!existsSync(notesDir)) {
    mkdirSync(notesDir, { recursive: true });
    Event.emit({ tag: "init", action: "create_dir", path: notesDir });
  }

  // Create database (Store.create emits create_db event)
  Store.create(dbPath);
  Store.close();

  // Download model (global, in ~/.cache/spall/models/)
  Model.init();
  await Model.download();

  Event.emit({ tag: "init", action: "done" });
});

export const index = fn(IndexInput, async (input): Promise<void> => {
  const { dbPath, notesDir } = paths(input.directory);

  // TODO: Actually do indexing via Store
  // For now, send stub events to prove the pipeline works
  Event.emit({ tag: "scan", action: "start", total: 0 });
  Event.emit({ tag: "scan", action: "done" });
});

export const search = fn(
  SearchInput,
  async (input): Promise<z.infer<typeof SearchResult>[]> => {
    const { dbPath } = paths(input.directory);

    // TODO: Actually do search via Store + Model
    return [];
  },
);

// Re-export types for convenience
export type {
  InitInput,
  SearchResult,
  IndexInput,
  SearchInput,
} from "./schema";

// ============================================
// Hono App with OpenAPI
// ============================================

const app = new Hono()
  .post(
    "/init",
    describeRoute({
      summary: "Initialize project",
      description:
        "Initialize a spall project in a directory, creating the database and downloading models. Emits progress events via SSE.",
      operationId: "init",
      responses: {
        200: {
          description: "Initialization events stream",
          content: {
            "text/event-stream": {
              schema: resolver(InitResponse),
            },
          },
        },
      },
    }),
    validator("json", InitInput),
    (c) => {
      const input = c.req.valid("json");
      return streamSSE(c, async (stream) => {
        const pending: Promise<void>[] = [];
        const write = (event: EventType) => {
          pending.push(stream.writeSSE({ data: JSON.stringify(event) }));
        };

        const unsubscribe = Event.listen(write);
        try {
          await init(input);
        } catch (e) {
          const error = e instanceof Error ? e.message : "Unknown error";
          pending.push(stream.writeSSE({ data: JSON.stringify({ error }) }));
        } finally {
          unsubscribe();
          await Promise.all(pending);
        }
      });
    },
  )
  .post(
    "/index",
    describeRoute({
      summary: "Index files",
      description:
        "Index files in a project directory, emitting progress events via SSE",
      operationId: "index",
      responses: {
        200: {
          description: "Indexing events stream",
          content: {
            "text/event-stream": {
              schema: resolver(IndexEvent),
            },
          },
        },
      },
    }),
    validator("json", IndexInput),
    (c) => {
      const input = c.req.valid("json");
      return streamSSE(c, async (stream) => {
        const pending: Promise<void>[] = [];
        const write = (event: EventType) => {
          pending.push(stream.writeSSE({ data: JSON.stringify(event) }));
        };

        const unsubscribe = Event.listen(write);
        try {
          await index(input);
        } catch (e) {
          const error = e instanceof Error ? e.message : "Unknown error";
          pending.push(stream.writeSSE({ data: JSON.stringify({ error }) }));
        } finally {
          unsubscribe();
          await Promise.all(pending);
        }
      });
    },
  )
  .post(
    "/search",
    describeRoute({
      summary: "Search",
      description: "Search for similar content using embeddings",
      operationId: "search",
      responses: {
        200: {
          description: "Search results",
          content: {
            "application/json": {
              schema: resolver(SearchResult.array()),
            },
          },
        },
      },
    }),
    validator("json", SearchInput),
    async (c) => {
      const input = c.req.valid("json");
      const results = await search(input);
      return c.json(results);
    },
  )
  .get(
    "/health",
    describeRoute({
      summary: "Health check",
      description: "Check if the server is running",
      operationId: "health",
      responses: {
        200: {
          description: "Server is healthy",
          content: {
            "text/plain": {
              schema: resolver(z.string()),
            },
          },
        },
      },
    }),
    (c) => c.text("ok"),
  );

/**
 * Generate OpenAPI spec from the Hono app.
 * Used by SDK build script.
 */
export async function openapi() {
  return generateSpecs(app, {
    documentation: {
      info: {
        title: "spall",
        version: "0.0.1",
        description: "Local semantic note store with embeddings",
      },
      openapi: "3.1.1",
    },
  });
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

  // ============================================
  // Server Lifecycle
  // ============================================

  export type StartOptions = {
    persist?: boolean;
    onShutdown?: () => void;
  };

  function maybeScheduleShutdown(onShutdown?: () => void): void {
    if (!persist && activeRequests === 0) {
      shutdownTimer = setTimeout(() => {
        if (activeRequests === 0) {
          stop();
          if (onShutdown) onShutdown();
        }
      }, 100);
    }
  }

  export async function start(
    options?: StartOptions,
  ): Promise<{ port: number }> {
    persist = options?.persist ?? false;
    const onShutdown = options?.onShutdown;

    server = Bun.serve({
      port: 0,
      async fetch(req) {
        activeRequests++;
        if (shutdownTimer) {
          clearTimeout(shutdownTimer);
          shutdownTimer = null;
        }

        const response = await app.fetch(req);

        // For streaming responses (SSE), we need to track when the body is fully consumed
        // not when the Response object is returned
        if (response.body) {
          const reader = response.body.getReader();
          let streamDone = false;

          const wrappedBody = new ReadableStream({
            async pull(controller) {
              if (streamDone) return;
              try {
                const { done, value } = await reader.read();
                if (done) {
                  streamDone = true;
                  controller.close();
                  activeRequests--;
                  maybeScheduleShutdown(onShutdown);
                } else {
                  controller.enqueue(value);
                }
              } catch (e) {
                streamDone = true;
                controller.error(e);
                activeRequests--;
                maybeScheduleShutdown(onShutdown);
              }
            },
            cancel() {
              reader.cancel();
              if (!streamDone) {
                streamDone = true;
                activeRequests--;
                maybeScheduleShutdown(onShutdown);
              }
            },
          });

          return new Response(wrappedBody, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          });
        }

        // Non-streaming response - decrement immediately
        activeRequests--;
        maybeScheduleShutdown(onShutdown);
        return response;
      },
    });

    const port = server.port;
    if (!port) {
      server.stop();
      throw new Error("Failed to get server port");
    }

    if (!Lock.write(port)) {
      server.stop();
      throw new Error("");
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

  async function check(port: number): Promise<boolean> {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }

  async function tryLock(): Promise<string | null> {
    const lock = Lock.read();
    if (!lock) return null;
    if (await check(lock.port)) {
      return `http://127.0.0.1:${lock.port}`;
    }
    Lock.remove();
    return null;
  }

  // Atomically start a local server, or connect to an existing one.
  export async function ensure(): Promise<string> {
    const existing = await tryLock();
    if (existing) return existing;

    Bun.spawn(["spall", "serve"], {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
      env: {
        ...process.env,
        SPALL_CACHE_DIR: Config.get().cacheDir,
      },
    }).unref();

    for (let i = 0; i < 40; i++) {
      await Bun.sleep(25);
      const url = await tryLock();
      if (url) return url;
    }

    throw new Error("Timeout waiting for server to start");
  }
}
