import consola from "consola";
import { Client } from "@spall/sdk/client";
import {
  type CommandDef,
  defaultTheme as theme,
  createEphemeralQuery,
  displayResults,
  highlightSnippet,
} from "@spall/cli/shared";

type Mode = "plain" | "fts";

export const search: CommandDef = {
  description: "Search note content (FTS)",
  positionals: {
    query: {
      type: "string",
      description: "Search corpus by keyword",
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
      description: "Output format: table | json | tree | list",
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

    const client = await Client.connect();

    const { query } = await createEphemeralQuery({
      client,
      project: argv.project,
      tracked: false,
    });

    const res = await client.query
      .search({
        id: String(query.id),
        q: argv.query,
        path: argv.path,
        limit: argv.limit,
        mode,
      })
      .then(Client.unwrap);

    displayResults(res.results, {
      output: out,
      empty: "(no matches)",
      path: (r: any) => r.path,
      id: (r: any) => String(r.id),
      preview: (r: any) => r.snippet,
      previewFormat: highlightSnippet,
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
