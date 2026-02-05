import { Client } from "@spall/sdk/client";
import {
  type CommandDef,
  createQuery,
} from "@spall/cli/shared";

export const query: CommandDef = {
  description: "Manage query scopes",
  commands: {
    create: {
      description: "Create a query scope for searching",
      options: {
        corpus: {
          alias: "c",
          type: "string",
          description: "Corpus name (default: from spall.json)",
        },
      },
      handler: async (argv) => {
        const client = await Client.connect();

        const { query, names } = await createQuery({
          client,
          corpus: argv.corpus,
          tracked: true,
        });

        console.log(
          JSON.stringify(
            {
              queryId: query.id,
              corpora: names,
              hint: `Use --query ${query.id} with vsearch and fetch commands.`,
            },
            null,
            2,
          ),
        );
      },
    },
  },
};
