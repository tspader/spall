import { consola } from "consola";
import pc from "picocolors";

import { type EventUnion } from "@spall/core";
import { Bus } from "@spall/core/event";
import { Config } from "@spall/core/config";
import { Model } from "@spall/core/model";
import { App } from "./app";
import { Lock } from "./lock";
import { Store } from "@spall/core";

export { Lock } from "./lock";
export { ensure } from "./lock";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (!value) return undefined;
  if (value === "1" || value === "true") return true;
  if (value === "0" || value === "false") return false;
  return undefined;
}

function parseNumberEnv(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export namespace Server {
  let server: Bun.Server;
  let persist = false;
  let activeRequests = 0;
  let activeSse = 0;
  let timer: Timer;
  let idleTimeoutMs = 1000;
  let resolved: () => void;

  const MAX_POLL_DURATION = 2000;
  const POLL_TIME = 50;

  export type Options = {
    persist: boolean;
    idleTimeoutMs: number;
    force: boolean;
  };

  export function increment(): void {
    activeRequests++;
    clearTimeout(timer);
  }

  export function decrement(): void {
    activeRequests--;
    resetShutdownTimer();
  }

  export function incrementSse(): void {
    activeSse++;
    clearTimeout(timer);
  }

  export function decrementSse(): void {
    activeSse--;
    resetShutdownTimer();
  }

  function resetShutdownTimer(): void {
    if (persist) return;
    if (activeRequests > 0 || activeSse > 0) return;

    timer = setTimeout(() => {
      if (activeRequests === 0 && activeSse === 0) {
        stop();
      }
    }, idleTimeoutMs);
  }

  export interface ServerResult {
    port: number;
    stopped: Promise<void>;
  }

  export function render(event: EventUnion): string {
    switch (event.tag) {
      case "model.download":
        return `Downloading ${pc.cyan(event.info.name)}`;
      case "model.downloaded":
        return `Finished downloading ${pc.cyanBright(event.info.name)}`;
      case "model.progress": {
        const percent = (event.downloaded / event.total) * 100;
        const percentStr = percent.toFixed(0).padStart(3);

        return `${pc.cyan(event.info.name)} ${pc.bold(percentStr + "%")}`;
      }
      case "model.load":
        return `Loaded ${pc.cyanBright(event.info.name)}`;
      case "model.failed":
        return `${pc.red("Failed to load model:")} ${event.error}`;
      case "store.create":
        return `Creating database at ${pc.cyanBright(event.path)}`;
      case "store.created":
        return `Created database at ${pc.cyanBright(event.path)}`;
      case "note.created":
        return `${pc.cyanBright(event.info.path)} (${formatBytes(event.info.content.length)}, hash: ${event.info.contentHash})`;
      case "note.updated":
        return `${pc.cyanBright(event.info.path)} (${formatBytes(event.info.content.length)}, hash: ${event.info.contentHash})`;
    }

    return event.tag;
  }

  export async function start(
    request?: Partial<Options>,
  ): Promise<ServerResult> {
    const env: Partial<Options> = {
      persist: parseBooleanEnv(process.env.SPALL_SERVER_PERSIST),
      force: parseBooleanEnv(process.env.SPALL_SERVER_FORCE),
      idleTimeoutMs: parseNumberEnv(process.env.SPALL_SERVER_IDLE_TIMEOUT_MS),
    };
    const config: Partial<Options> = {
      idleTimeoutMs: Config.get().server.idleTimeout * 1000,
    };

    const options: Options = {
      persist: request?.persist ?? env.persist ?? false,
      idleTimeoutMs:
        request?.idleTimeoutMs ??
        env.idleTimeoutMs ??
        config.idleTimeoutMs ??
        1000,
      force: request?.force ?? env.force ?? false,
    };

    // initialize core store before serving requests
    Store.ensure();

    // set module level fields
    persist = options.persist;
    idleTimeoutMs = options.idleTimeoutMs;

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
      if (options.force) {
        const pid = `${pc.gray("pid")} ${pc.yellow(existing.pid)}`;
        const port = `${pc.gray("port")} ${pc.cyan(existing.port)}`;
        consola.info(`Killing existing server (${pid}, ${port})`);

        // claim lock before killing so there's no window where lock doesn't exist
        Lock.takeover();

        try {
          process.kill(existing.pid, "SIGTERM");

          for (let i = 0; i < 40; i++) {
            if (!isProcessAlive(existing.pid)) break;
            await Bun.sleep(50);
          }
        } catch {
          // the process is already dead
        }
      } else {
        throw new Error(`Server is already running at port ${existing.port}`);
      }
    }

    server = Bun.serve({
      port: 0,
      fetch: App.get().fetch,
      idleTimeout: 0,
    });

    const port = server.port;
    if (!port) {
      server.stop();
      throw new Error("Failed to start server");
    }

    consola.log(`Listening on port ${pc.cyanBright(String(port))}`);

    Lock.update(port);

    process.once("SIGINT", () => {
      consola.info(`Received ${pc.gray("SIGINT")}`);
      stop();
    });
    process.once("SIGTERM", () => {
      consola.info(`Received ${pc.gray("SIGTERM")}`);
      stop();
    });

    resetShutdownTimer();

    const stopped = new Promise<void>((resolve) => {
      resolved = resolve;
    });

    Bus.subscribe((event: EventUnion) => {
      consola.info(`${pc.gray(event.tag)} ${render(event)}`);
    });

    // Kick off model download/load in background (errors published as model.failed event)
    Model.load().catch(() => {});

    return { port, stopped };
  }

  export function stop(): void {
    consola.info("Stopping server");
    server.stop();
    // Only remove lock if we still own it (--force may have overwritten it)
    const lock = Lock.read();
    if (lock && lock.pid === process.pid) {
      Lock.remove();
    }
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
}
