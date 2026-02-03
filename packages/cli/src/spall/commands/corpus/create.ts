import pc from "picocolors";
import consola from "consola";
import { Client } from "@spall/sdk/client";
import type { CommandDef } from "@spall/cli/shared";

export const create: CommandDef = {
  description: "Create a new corpus",
  positionals: {
    name: {
      type: "string",
      description: "Corpus name",
      required: true,
    },
  },
  handler: async (argv) => {
    const client = await Client.connect();

    const result = await client.corpus
      .create({
        name: argv.name,
      })
      .then(Client.unwrap);

    consola.success(`Corpus ${pc.cyanBright(result.name)} (id: ${result.id})`);
  },
};
