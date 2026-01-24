import {
  mkdirSync,
  existsSync,
  unlinkSync,
  readFileSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { consola } from "consola";
import pc from "picocolors";


import { Event } from "@spall/core";
import { Bus } from "@spall/core/src/event";
import { Config } from "@spall/core/src/config";
import { App } from "@spall/sdk";

type LockData = { pid: number; port: number | null };

export namespace Cache {
  export function ensure(): void {
    const dir = Config.get().cacheDir;
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}


export namespace Server {
  let server: Bun.Server;
  let persist = false;
  let activeRequests = 0;
  let activeSSE = 0;
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
      Cache.ensure();
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

  export function markSSE(): void {
    activeSSE++;
    clearTimeout(timer);
  }

  export function unmarkSSE(): void {
    activeSSE--;
    resetShutdownTimer();
  }

  function resetShutdownTimer(): void {
    if (persist) return;
    if (activeRequests > 0 || activeSSE > 0) return;

    timer = setTimeout(() => {
      if (activeRequests === 0 && activeSSE === 0) {
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

    // sanity check; this function should only be called when you have the
    // process lock, so we *can* unconditionally write our pid and port to
    // the lock.
    //
    // but we're nice and check if the current pid + port is a healthy server,
    // in case the user tried to spin up two daemons on accident
    const existing = Lock.read();
    if (
      existing &&
      existing.port !== null &&
      (await checkHealth(existing.port))
    ) {
      throw new Error(`Server is already running at port ${existing.port}`);
    }

    server = Bun.serve({
      port: 0,
      fetch: App.get().fetch,
    });

    const port = server.port;
    if (!port) {
      server.stop();
      throw new Error("Failed to start server");
    }

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

    Bus.listen((event: Event) => {
      consola.info(`${pc.gray(event.tag)} ${Bus.render(event)}`)
    })

    return { port, stopped };
  }

  export function stop(): void {
    consola.info('Killing server')
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

  const Role = {
    Leader: "leader",
    Follower: "follower",
  } as const;

  type AcquireResult =
    | { role: typeof Role.Leader }
    | { role: typeof Role.Follower; url: string };

  async function acquire(): Promise<AcquireResult> {
    while (true) {
      if (Lock.claim()) {
        return { role: Role.Leader };
      }

      const lock = Lock.read();

      // the claimant died after check but before read; narrow, but no big deal
      if (!lock) {
        continue;
      }

      // if the lock has a port, there should be a healthy server.
      //   - if we can connect, we're done
      //   - if we can't, it's a stale lock. remove it and start over.
      if (lock.port !== null) {
        if (await checkHealth(lock.port)) {
          return { role: Role.Follower, url: `http://127.0.0.1:${lock.port}` };
        }

        Lock.remove();
        continue;
      }

      // at this point, the lock file exists but has no port. another client
      // beat us. make sure they're alive (otherwise, it's stale)
      if (!isProcessAlive(lock.pid)) {
        Lock.remove();
        continue;
      }

      // give the other client time to start the server
      await Bun.sleep(50);
    }
  }

  // Atomically start a local server, or connect to an existing one.
  export async function ensure(): Promise<string> {
    const result = await acquire();

    if (result.role === Role.Follower) {
      return result.url;
    }

    Bun.spawn(["spall", "serve"], {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
      env: {
        ...process.env,
        SPALL_CACHE_DIR: Config.get().cacheDir,
      },
    }).unref();

    // spin, waiting for the server to write its port to the lock file
    for (let i = 0; i < 40; i++) {
      await Bun.sleep(50);
      const lock = Lock.read();
      if (lock && lock.port !== null) {
        return `http://127.0.0.1:${lock.port}`;
      }
    }

    throw new Error(
      "Claimed leader role, but timed out waiting for server to start",
    );
  }
}
