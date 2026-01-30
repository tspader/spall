import pc from "picocolors";
import consola from "consola";
import { Client } from "@spall/sdk";
import type { CommandDef } from "@spall/cli/shared";

export const remove: CommandDef = {
  description: "Delete a project by ID",
  positionals: {
    id: {
      type: "number",
      description: "Project ID",
    },
  },
  handler: async (argv) => {
    const client = await Client.connect();

    const result = await client.project.delete({ id: String(argv.id) });

    if (result.error) {
      consola.error(result.error.message);
      process.exit(1);
    }

    consola.success(`Deleted project ${pc.cyanBright(argv.id)}`);
  },
};
