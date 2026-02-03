import consola from "consola";
import { Client } from "@spall/sdk/client";
import { ProjectConfig } from "@spall/core";
import { type CommandDef, defaultTheme as theme } from "@spall/cli/shared";

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

        const projectNames: string[] = argv.project
          ? [argv.project]
          : ProjectConfig.load(process.cwd()).projects;

        const projects = await client.project.list().then(Client.unwrap);
        const byName = new Map(projects.map((p) => [p.name, p.id]));

        const projectIds = projectNames.map((name) => {
          const id = byName.get(name);
          if (id === undefined) {
            consola.error(`Project not found: ${theme.command(name)}`);
            process.exit(1);
          }
          return id;
        });

        const result = await client.query
          .create({ projects: projectIds })
          .then(Client.unwrap);

        console.log(
          JSON.stringify(
            {
              queryId: result.id,
              projects: projectNames,
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
