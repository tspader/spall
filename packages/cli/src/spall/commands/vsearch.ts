import consola from "consola";
import { Client } from "@spall/sdk/client";
import { ProjectConfig } from "@spall/core";
import {
  type CommandDef,
  defaultTheme as theme,
  displayResults,
} from "@spall/cli/shared";

function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export const vsearch: CommandDef = {
  description: "Semantic search (vector)",
  positionals: {
    q: {
      type: "string",
      description: "Search query",
      required: true,
    },
  },
  options: {
    project: {
      alias: "p",
      type: "string",
      description: "Project name",
    },
    path: {
      type: "string",
      description: "Path glob filter (default: *)",
    },
    limit: {
      alias: "n",
      type: "number",
      description: "Maximum number of results (default: 20)",
    },
    output: {
      alias: "o",
      type: "string",
      description: "Output format: table | json | tree | list",
      default: "table",
    },
  },
  handler: async (argv) => {
    const out = String(argv.output ?? "table");

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

    const query = await client.query
      .create({ projects: projectIds })
      .then(Client.unwrap);

    const res = await client.query
      .vsearch({
        id: String(query.id),
        q: argv.q,
        path: argv.path,
        limit: argv.limit,
      })
      .then(Client.unwrap);

    displayResults(res.results, {
      output: out,
      empty: "(no matches)",
      path: (r: any) => r.path,
      id: (r: any) => String(r.id),
      preview: (r: any) => collapseWhitespace(r.chunk),
      extraColumns: [
        {
          header: "score",
          value: (r: any) => r.score.toFixed(3),
          flex: 0,
          noTruncate: true,
          format: (s) => theme.code(s),
        },
      ],
    });
  },
};
