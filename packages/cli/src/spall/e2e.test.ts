import { describe, test, expect } from "bun:test";
import { mkdtempSync, rmSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

type RunResult = { stdout: string; stderr: string; exitCode: number };

async function runCli(
  args: string[],
  opts: { cwd: string; env: Record<string, string> },
): Promise<RunResult> {
  const entry = join(import.meta.dir, "..", "index.ts");
  const proc = Bun.spawn([process.execPath, entry, ...args], {
    cwd: opts.cwd,
    env: { ...process.env, ...opts.env },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { stdout, stderr, exitCode };
}

function readLock(
  lockPath: string,
): { pid: number; port: number | null } | null {
  try {
    return JSON.parse(readFileSync(lockPath, "utf-8"));
  } catch {
    return null;
  }
}

async function shutdownServer(lockPath: string): Promise<void> {
  const lock = readLock(lockPath);
  if (!lock) return;

  try {
    if (lock.port != null) {
      // best-effort clean shutdown
      await fetch(`http://127.0.0.1:${lock.port}/shutdown`, {
        method: "POST",
      }).catch(() => {});
    }
  } finally {
    try {
      process.kill(lock.pid, "SIGTERM");
    } catch {
      // ignore
    }
  }
}

describe("spall CLI (e2e)", () => {
  test(
    "add + get via real server startup",
    async () => {
      const root = mkdtempSync(join(tmpdir(), "spall-cli-e2e-"));
      const dataDir = join(root, "data");
      const cacheDir = join(root, "cache");

      try {
        const env = {
          SPALL_DATA_DIR: dataDir,
          SPALL_CACHE_DIR: cacheDir,
          // keep the server alive long enough for the test
          SPALL_SERVER_PERSIST: "1",
        };

        const add = await runCli(["add", "e2e.md", "-t", "hello e2e"], {
          cwd: root,
          env,
        });
        expect(add.exitCode).toBe(0);

        const get = await runCli(["get", "*", "-o", "json", "--all"], {
          cwd: root,
          env,
        });
        expect(get.exitCode).toBe(0);

        const notes = JSON.parse(get.stdout.trim()) as Array<{
          path: string;
          content: string;
        }>;
        expect(Array.isArray(notes)).toBe(true);
        expect(
          notes.some(
            (n) => n.path === "e2e.md" && n.content.includes("hello e2e"),
          ),
        ).toBe(true);
      } finally {
        await shutdownServer(join(dataDir, "server.lock"));
        rmSync(root, { recursive: true, force: true });
      }
    },
    { timeout: 30000 },
  );
});
