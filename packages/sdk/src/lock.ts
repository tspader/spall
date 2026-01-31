import { mkdirSync, existsSync, readFileSync, writeFileSync, rmSync } from "fs";
import { join } from "path";

import { Config } from "@spall/core/config";

type LockData = { pid: number; port: number | null };

export namespace Cache {
  export function ensure(): void {
    const dir = Config.get().dirs.data;
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}

export namespace Lock {
  export function path(): string {
    return join(Config.get().dirs.data, "server.lock");
  }

  export function read(): LockData | null {
    try {
      const content = readFileSync(path(), "utf-8");
      return JSON.parse(content) as LockData;
    } catch {
      return null;
    }
  }

  export function create(): boolean {
    Cache.ensure();
    try {
      writeFileSync(path(), JSON.stringify({ pid: process.pid, port: null }), {
        flag: "wx",
      });
      return true;
    } catch {
      return false;
    }
  }

  export function update(port: number): void {
    Cache.ensure();
    writeFileSync(path(), JSON.stringify({ pid: process.pid, port }));
  }

  export function takeover(): void {
    Cache.ensure();
    writeFileSync(path(), JSON.stringify({ pid: process.pid, port: null }));
  }

  export function remove(): void {
    rmSync(path(), { force: true });
  }
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function checkHealth(port: number): Promise<boolean> {
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
    if (Lock.create()) {
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

    // at this point, the lock file exists but has no port.
    //   - if its pid is running, assume the server is starting
    //   - if it isn't, it's a stale lock.
    if (!isProcessAlive(lock.pid)) {
      Lock.remove();
      continue;
    }

    // give the other client time to start the server
    await Bun.sleep(50);
  }
}

// atomically start a local server, or connect to an existing one.
export async function ensure(): Promise<string> {
  const result = await acquire();

  if (result.role === Role.Follower) {
    return result.url;
  }

  // do our best to invoke the server regardless of how we're installed
  const script = join(import.meta.dir, "serve.ts");
  Bun.spawn([process.execPath, script], {
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
    env: {
      ...process.env,
      SPALL_CACHE_DIR: Config.get().dirs.cache,
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
