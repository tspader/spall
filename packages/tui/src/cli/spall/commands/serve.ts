import { Config } from "@spall/core/config";
import type { CommandDef } from "@spall/tui/cli/shared";

export const serve: CommandDef = {
  description: "Start the spall server",
  options: {
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
    const { Server } = await import("@spall/sdk/server");
    const { port, stopped } = await Server.start({
      persist: argv.daemon,
      idleTimeoutMs: argv.timeout * 1000,
      force: argv.force,
    });

    await stopped;
  },
};
