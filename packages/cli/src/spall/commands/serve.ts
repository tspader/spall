import { Config } from "@spall/core/config";
import type { CommandDef } from "@spall/cli/shared";

export const serve: CommandDef = {
  description: "Start the spall server",
  options: {
    kill: {
      type: "boolean",
      description:
        "Stop the running server (best-effort) and remove the lock file",
    },
    daemon: {
      alias: "d",
      type: "boolean",
      description: "Do not stop after last client disconnects",
    },
    timeout: {
      alias: "t",
      type: "number",
      description: "Seconds to wait after last client disconnects",
      default: Config.get().server.idleTimeout,
    },
    force: {
      alias: "f",
      type: "boolean",
      description: "Kill existing server if running",
    },
  },
  handler: async (argv) => {
    if (argv.kill) {
      const { Lock, checkHealth, isProcessAlive } =
        await import("@spall/sdk/server");
      const lock = Lock.read();

      try {
        let shutdownOk = false;

        if (lock?.port != null) {
          // Prefer a clean shutdown so the server can flush/cleanup.
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 500);
          try {
            const res = await fetch(`http://127.0.0.1:${lock.port}/shutdown`, {
              method: "POST",
              signal: controller.signal,
            });
            shutdownOk = res.ok;
          } catch {
            // ignore
          } finally {
            clearTimeout(timeout);
          }
        }

        // Give the server up to ~1s to exit on its own.
        if (shutdownOk) {
          const start = Date.now();
          while (Date.now() - start < 1000) {
            if (lock?.pid != null && !isProcessAlive(lock.pid)) {
              return;
            }
            if (lock?.port != null && !(await checkHealth(lock.port))) {
              return;
            }
            await Bun.sleep(50);
          }
        }

        // Fallback: kill by pid.
        if (lock?.pid != null) {
          try {
            process.kill(lock.pid, "SIGTERM");
          } catch {
            // ignore
          }
        }
      } finally {
        // Unconditionally remove lock file when done.
        Lock.remove();
      }
      return;
    }

    const { Server } = await import("@spall/sdk/server");
    const { port, stopped } = await Server.start({
      persist: argv.daemon,
      idleTimeoutMs: argv.timeout * 1000,
      force: argv.force,
    });

    await stopped;
  },
};
