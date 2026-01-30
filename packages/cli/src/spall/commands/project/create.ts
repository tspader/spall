import pc from "picocolors";
import consola from "consola";
import { Client } from "@spall/sdk/client";
import type { CommandDef } from "@spall/cli/shared";

export const create: CommandDef = {
  description: "Create a new project",
  positionals: {
    name: {
      type: "string",
      description: "Project name (defaults to directory name)",
    },
  },
  options: {
    dir: {
      alias: "d",
      type: "string",
      description: "Project directory",
      default: process.cwd(),
    },
  },
  handler: async (argv) => {
    const client = await Client.connect();

    const result = await client.project
      .create({
        dir: argv.dir,
        name: argv.name,
      })
      .then(Client.unwrap);

    consola.success(
      `Project ${pc.cyanBright(result.name)} (id: ${result.id})`,
    );
  },
};
