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
  description: `Full text ${theme.search()} against note content`,
  positionals: {
    query: {
      type: "string",
      description: "Keyword query, or FTS query if using FTS mode",
      required: true,
    },
  },
  options: {
    output: {
      alias: "o",
      type: "string",
      description: "Output format (table, json, tree, list)",
      default: "table",
    },
    corpus: {
      alias: "c",
      type: "string",
      description: `Corpus to ${theme.guide("search")}; overrides workspace setting`,
    },
    path: {
      type: "string",
      description: "Only include notes which pass this glob filter",
      default: "*"
    },
    limit: {
      alias: "n",
      type: "number",
      description: "Maximum number of results",
      default: 20
    },
    mode: {
      alias: "m",
      type: "string",
      description: "Query mode (plain, fts)",
      default: "plain",
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
      corpus: (argv as any).corpus,
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
