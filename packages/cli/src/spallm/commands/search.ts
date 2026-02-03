import consola from "consola";
import { Client } from "@spall/sdk/client";
import { ProjectConfig } from "@spall/core";
import { type CommandDef, displayLlmSearch } from "@spall/cli/shared";

export const search: CommandDef = {
  summary: "Keyword search (FTS)",
  description: `Full-text keyword search. Returns truncated previews with note IDs.

Use \`fetch\` with the returned Query ID and note IDs to get full content.

Example:
  spallm search "R2Bucket"
`,
  positionals: {
    query: {
      type: "string",
      description: "Search keywords",
      required: true,
    },
  },
  options: {
    project: {
      alias: "p",
      type: "string",
      description: "Project name (default: from spall.json)",
    },
    path: {
      type: "string",
      description: "Path glob filter",
    },
    limit: {
      alias: "n",
      type: "number",
      description: "Max results (default: 20)",
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
        consola.error(`Project not found: ${name}`);
        process.exit(1);
      }
      return id;
    });

    const query = await client.query
      .create({ projects: projectIds })
      .then(Client.unwrap);

    const res = await client.query
      .search({
        id: String(query.id),
        q: argv.query,
        path: argv.path,
        limit: argv.limit,
      })
      .then(Client.unwrap);

    displayLlmSearch(res.results, {
      empty: "(no matches)",
      path: (r: any) => r.path,
      id: (r: any) => String(r.id),
      score: (r: any) => r.score,
      preview: (r: any) => r.snippet,
      queryId: query.id,
    });
  },
};
