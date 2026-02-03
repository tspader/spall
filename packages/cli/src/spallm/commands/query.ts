import { Client } from "@spall/sdk/client";
import {
  type CommandDef,
  createEphemeralQuery,
  defaultTheme as theme,
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

        const { query: result, includeNames } = await createEphemeralQuery({
          client,
          corpus: (argv as any).corpus,
          tracked: true,
        });

        console.log(
          JSON.stringify(
            {
              queryId: result.id,
              corpora: includeNames,
              hint: `Use --query ${result.id} with vsearch and fetch commands.`,
            },
            null,
            2,
          ),
        );
      },
    },
  },
};
