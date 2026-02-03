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
        project: {
          alias: "p",
          type: "string",
          description: "Project name (default: from spall.json)",
        },
      },
      handler: async (argv) => {
        const client = await Client.connect();

        const { query: result, includeNames } = await createEphemeralQuery({
          client,
          project: argv.project,
          tracked: true,
        });

        console.log(
          JSON.stringify(
            {
              queryId: result.id,
              projects: includeNames,
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
