import pc from "picocolors";
import consola from "consola";
import { Client } from "@spall/sdk";
import type { CommandDef } from "@spall/cli/shared";

export const remove: CommandDef = {
  description: "Delete a corpus by ID",
  positionals: {
    id: {
      type: "number",
      description: "Corpus ID",
    },
  },
  handler: async (argv) => {
    if (argv.id === undefined || isNaN(Number(argv.id))) {
      consola.error("Missing required argument: id");
      process.exit(1);
    }

    const client = await Client.connect();

    const result = await client.corpus.delete({ id: String(argv.id) });

    if (result.error) {
      consola.error(result.error.message);
      process.exit(1);
    }

    consola.success(`Deleted corpus ${pc.cyanBright(argv.id)}`);
  },
};
