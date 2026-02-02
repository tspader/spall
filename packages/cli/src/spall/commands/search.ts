import consola from "consola";
import { Client } from "@spall/sdk/client";
import { ProjectConfig } from "@spall/core";
import {
  table,
  type CommandDef,
  defaultTheme as theme,
  cleanEscapes,
} from "@spall/cli/shared";

type Mode = "plain" | "fts";

export const search: CommandDef = {
  description: "Search note content (FTS)",
  positionals: {
    q: {
      type: "string",
      description: "Search text (plain) or raw FTS query (fts mode)",
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
    mode: {
      alias: "m",
      type: "string",
      description: "Query mode: plain | fts (default: plain)",
      default: "plain",
    },
    output: {
      alias: "o",
      type: "string",
      description: "Output format: table | json",
      default: "table",
    },
  },
  handler: async (argv) => {
    const mode = String(argv.mode ?? "plain") as Mode;
    if (mode !== "plain" && mode !== "fts") {
      consola.error(`Invalid mode: ${theme.primary(String(argv.mode))}`);
      consola.info(`Use ${theme.option("--mode")} plain | fts`);
      process.exit(1);
    }

    const out = String(argv.output ?? "table");
    if (out !== "table" && out !== "json") {
      consola.error(`Invalid output: ${theme.primary(out)}`);
      consola.info(`Use ${theme.option("--output")} table | json`);
      process.exit(1);
    }

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
      .search({
        id: String(query.id),
        q: argv.q,
        path: argv.path,
        limit: argv.limit,
        mode,
      })
      .then(Client.unwrap);

    if (res.results.length === 0) {
      console.log(theme.dim("(no matches)"));
      return;
    }

    if (out === "json") {
      console.log(JSON.stringify(res, null, 2));
      return;
    }

    table(
      ["path", "rank", "snippet"],
      [
        res.results.map((r: any) => r.path),
        res.results.map((r: any) => r.rank.toFixed(3)),
        res.results.map((r: any) => cleanEscapes(r.snippet)),
      ],
      {
        flex: [1, 0, 2],
        noTruncate: [false, true, false],
        min: [0, 0, 3],
        truncate: ["start", "end", "middle"],
        format: [
          (s) => {
            const slash = s.lastIndexOf("/");
            if (slash === -1) return theme.primary(s);
            return (
              theme.dim(s.slice(0, slash + 1)) +
              theme.primary(s.slice(slash + 1))
            );
          },
          (s) => theme.code(s),
        ],
      },
    );
  },
};
