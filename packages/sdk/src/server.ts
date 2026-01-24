import { existsSync, readFileSync, unlinkSync } from "fs";
import { join } from "path";

type LockData = { pid: number; port: number };

/**
 * Server discovery and auto-start for SDK clients.
 */
export namespace Server {
  /** Get the default cache directory */
  function cacheDir(): string {
    return (
      process.env.SPALL_CACHE_DIR ||
      join(
        process.env.HOME || process.env.USERPROFILE || ".",
        ".cache",
        "spall",
      )
    );
  }

  /** Lock file path */
  function lockPath(): string {
    return join(cacheDir(), "server.lock");
  }

  /** Read lock file if it exists */
  function readLock(): LockData | null {
    try {
      const content = readFileSync(lockPath(), "utf-8");
      return JSON.parse(content) as LockData;
    } catch {
      return null;
    }
  }

  /** Remove stale lock file */
  function removeLock(): void {
    try {
      unlinkSync(lockPath());
    } catch {
      // Ignore - may not exist
    }
  }

  /** Check if server is healthy */
  async function check(port: number): Promise<boolean> {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }

  /** Try to get URL from existing lock file */
  async function tryLock(): Promise<string | null> {
    const lock = readLock();
    if (!lock) return null;
    if (await check(lock.port)) {
      return `http://127.0.0.1:${lock.port}`;
    }
    removeLock();
    return null;
  }

  /**
   * Ensure a server is running and return its base URL.
   * If no server is running, spawns `spall serve` in the background.
   */
  export async function ensure(): Promise<string> {
    const existing = await tryLock();
    if (existing) return existing;

    // Spawn server in background
    Bun.spawn(["spall", "serve"], {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
      env: {
        ...process.env,
        SPALL_CACHE_DIR: cacheDir(),
      },
    }).unref();

    // Poll for server to start
    for (let i = 0; i < 40; i++) {
      await Bun.sleep(25);
      const url = await tryLock();
      if (url) return url;
    }

    throw new Error("Timeout waiting for server to start");
  }
}
