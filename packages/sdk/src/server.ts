import { consola } from "consola";
import pc from "picocolors";

import { type EventUnion } from "@spall/core";
import { Bus } from "@spall/core/event";
import { App } from "./app";
import { Lock } from "./lock";

export { Lock } from "./lock";
export { ensure } from "./lock";

export namespace Server {
  let server: Bun.Server;
  let persist = false;
  let activeRequests = 0;
  let activeSse = 0;
  let timer: Timer;
  let idleTimeoutMs = 1000;
  let resolved: () => void;

  export type StartOptions = {
    persist?: boolean;
    idleTimeout?: number;
    force?: boolean;
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
      case "store.create":
        return `Creating database at ${pc.cyanBright(event.path)}`;
      case "store.created":
        return `Created database at ${pc.cyanBright(event.path)}`;
    }

    return event.tag;
  }

  export async function start(options?: StartOptions): Promise<ServerResult> {
    persist = options?.persist ?? false;
    idleTimeoutMs = options?.idleTimeout ?? 1000;
    const force = options?.force ?? false;

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
      if (force) {
        consola.info(
          `Killing existing server (${pc.gray("pid")} ${pc.yellow(existing.pid)}, ${pc.gray("port")} ${pc.cyan(existing.port)})`,
        );
        try {
          process.kill(existing.pid, "SIGTERM");
          // Wait for it to die
          await new Promise((resolve) => setTimeout(resolve, 500));
          Lock.remove();
        } catch {
          // Process may have already died
          Lock.remove();
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

    Lock.setPort(port);

    process.once("SIGINT", () => {
      consola.info(`Received ${pc.gray("SIGINT")}`)
      stop();
    });
    process.once("SIGTERM", () => {
      consola.info(`Received ${pc.gray("SIGTERM")}`)
      stop();
    });

    resetShutdownTimer();

    const stopped = new Promise<void>((resolve) => {
      resolved = resolve;
    });

    Bus.subscribe((event: EventUnion) => {
      consola.info(`${pc.gray(event.tag)} ${render(event)}`);
    });

    return { port, stopped };
  }

  export function stop(): void {
    consola.info("Stopping server");
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
}
