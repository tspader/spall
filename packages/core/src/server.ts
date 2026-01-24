import {
  mkdirSync,
  existsSync,
  unlinkSync,
  readFileSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { streamSSE } from "hono/streaming";
import {
  describeRoute,
  generateSpecs,
  resolver,
  validator,
} from "hono-openapi";
import { z } from "zod";

import { Bus, type Event } from "./event";
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
  IndexResponse,
} from "./schema";

type LockData = { pid: number; port: number | null };

const SPALL_DIR = ".spall";
const DB_NAME = "spall.db";
const NOTES_DIR = "notes";

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

export const init = fn(InitInput, async (input): Promise<void> => {
  const { spallDir, dbPath, notesDir } = paths(input.directory);

  if (!existsSync(spallDir)) {
    mkdirSync(spallDir, { recursive: true });
    await Bus.emit({ tag: "init", action: "create_dir", path: spallDir });
  }

  if (!existsSync(notesDir)) {
    mkdirSync(notesDir, { recursive: true });
    await Bus.emit({ tag: "init", action: "create_dir", path: notesDir });
  }

  await Store.create(dbPath);
  Store.close();

  // Download model (global, in ~/.cache/spall/models/)
  Model.init();
  await Model.download();

  await Bus.emit({ tag: "init", action: "done" });
});

export const index = fn(IndexInput, async (input): Promise<void> => {
  const { dbPath, notesDir } = paths(input.directory);

  // TODO: Actually do indexing via Store
  // For now, send stub events to prove the pipeline works
  await Bus.emit({ tag: "scan", action: "start", total: 0 });
  await Bus.emit({ tag: "scan", action: "done" });
});

export const search = fn(
  SearchInput,
  async (input): Promise<z.infer<typeof SearchResult>[]> => {
    const { dbPath } = paths(input.directory);

    // TODO: Actually do search via Store + Model
    return [];
  },
);

const trackRequest = createMiddleware(async (c, next) => {
  Server.markRequest();
  try {
    await next();
  } finally {
    Server.unmarkRequest();
  }
});

const app = new Hono()
  .use(trackRequest)
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
    (context) => {
      const input = context.req.valid("json");
      return streamSSE(context, async (stream) => {
        const write = async (event: Event) => {
          await stream.writeSSE({ data: JSON.stringify(event) });
        };

        const unsubscribe = Bus.listen(write);

        try {
          await init(input);
        } catch (e) {
          const error = e instanceof Error ? e.message : "Unknown error";
          await stream.writeSSE({ data: JSON.stringify({ error }) });
        } finally {
          unsubscribe();
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
              schema: resolver(IndexResponse),
            },
          },
        },
      },
    }),
    validator("json", IndexInput),
    (c) => {
      const input = c.req.valid("json");
      return streamSSE(c, async (stream) => {
        const write = async (event: Event) => {
          await stream.writeSSE({ data: JSON.stringify(event) });
        };

        const unsubscribe = Bus.listen(write);

        try {
          await index(input);
        } catch (e) {
          const error = e instanceof Error ? e.message : "Unknown error";
          await stream.writeSSE({ data: JSON.stringify({ error }) });
        } finally {
          unsubscribe();
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
    (c) => {
      console.log("ok");
      return c.text("ok");
    },
  );

export async function buildOpenApiSpec() {
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
  let server: Bun.Server;
  let persist = false;
  let activeRequests = 0;
  let timer: Timer;
  let idleTimeoutMs = 1000;
  let resolved: () => void;

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

    export function claim(): boolean {
      Cache.ensure();
      try {
        writeFileSync(
          path(),
          JSON.stringify({ pid: process.pid, port: null }),
          { flag: "wx" },
        );
        return true;
      } catch {
        return false;
      }
    }

    export function setPort(port: number): void {
      writeFileSync(path(), JSON.stringify({ pid: process.pid, port }));
    }

    export function remove(): void {
      try {
        unlinkSync(path());
      } catch {
        // Ignore - may not exist
      }
    }
  }

  function isProcessAlive(pid: number): boolean {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  export type StartOptions = {
    persist?: boolean;
    idleTimeout?: number;
  };

  export function markRequest(): void {
    activeRequests++;
    clearTimeout(timer);
  }

  export function unmarkRequest(): void {
    activeRequests--;
    resetShutdownTimer();
  }

  function resetShutdownTimer(): void {
    if (persist) return;
    if (activeRequests > 0) return;

    console.log(`set it: ${idleTimeoutMs}`);
    timer = setTimeout(() => {
      if (activeRequests === 0) {
        stop();
      }
    }, idleTimeoutMs);
  }

  export interface ServerResult {
    port: number;
    stopped: Promise<void>;
  }

  export async function start(options?: StartOptions): Promise<ServerResult> {
    persist = options?.persist ?? false;
    idleTimeoutMs = options?.idleTimeout ?? 1000;

    // Clean up stale locks before attempting to claim
    const existing = Lock.read();
    if (existing) {
      if (existing.port !== null) {
        // Has port - check if healthy
        if (await checkHealth(existing.port)) {
          throw new Error("Server already running");
        }
        // Unhealthy - stale lock
        Lock.remove();
      } else {
        // port is null - someone claiming
        if (isProcessAlive(existing.pid)) {
          throw new Error("Another server is starting");
        }
        // Dead claimant - stale lock
        Lock.remove();
      }
    }

    // Now try to claim
    if (!Lock.claim()) {
      throw new Error("Failed to claim lock - race condition");
    }

    server = Bun.serve({
      port: 0,
      fetch: app.fetch,
    });

    const port = server.port;
    if (!port) {
      server.stop();
      Lock.remove();
      throw new Error("Failed to get server port");
    }

    // Update lock with actual port
    Lock.setPort(port);

    process.once("SIGINT", () => {
      stop();
    });
    process.once("SIGTERM", () => {
      stop();
    });

    resetShutdownTimer();

    const stopped = new Promise<void>((resolve) => {
      resolved = resolve;
    });

    return { port, stopped };
  }

  export function stop(): void {
    server.stop();
    Lock.remove();
    resolved();
  }

  async function checkHealth(port: number): Promise<boolean> {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }

  type AcquireResult = { role: "leader" } | { role: "follower"; url: string };

  async function acquire(): Promise<AcquireResult> {
    while (true) {
      // Try to claim the lock
      if (Lock.claim()) {
        return { role: "leader" };
      }

      // Someone else has the lock - read it
      const lock = Lock.read();

      if (!lock) {
        // Lock disappeared, retry
        continue;
      }

      if (lock.port !== null) {
        // Port written - health check it
        if (await checkHealth(lock.port)) {
          return { role: "follower", url: `http://127.0.0.1:${lock.port}` };
        }
        // Unhealthy - remove stale lock, retry
        Lock.remove();
        continue;
      }

      // port is null - someone is claiming, check if alive
      if (!isProcessAlive(lock.pid)) {
        // Dead claimant - remove stale lock, retry
        Lock.remove();
        continue;
      }

      // Alive, still starting - wait and retry
      await Bun.sleep(50);
    }
  }

  // Atomically start a local server, or connect to an existing one.
  export async function ensure(): Promise<string> {
    const result = await acquire();

    if (result.role === "follower") {
      return result.url;
    }

    // We're the leader - spawn server
    Bun.spawn(["spall", "serve"], {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
      env: {
        ...process.env,
        SPALL_CACHE_DIR: Config.get().cacheDir,
      },
    }).unref();

    // We claimed the lock but the spawned process will try to claim too.
    // Release our claim so the spawned process can take over.
    Lock.remove();

    // Wait for spawned server to write port
    for (let i = 0; i < 40; i++) {
      await Bun.sleep(50);
      const lock = Lock.read();
      if (lock && lock.port !== null) {
        return `http://127.0.0.1:${lock.port}`;
      }
    }

    throw new Error("Timeout waiting for server to start");
  }
}
