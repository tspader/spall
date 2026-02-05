import consola from "consola";
import {
  type CommandDef,
  defaultTheme as theme,
  displayResults,
  highlightSnippet,
  Search,
} from "@spall/cli/shared";

type Mode = "plain" | "fts";

export const search: CommandDef = {
  description: `Full text keyword ${theme.search()} against note content`,
  positionals: Search.positionals,
  options: {
    output: {
      alias: "o",
      type: "string",
      description: "Output format (table, json, tree, list)",
      default: "table",
    },
    ...Search.options,
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

    const { results } = await Search.run({
      query: argv.query,
      corpus: (argv as any).corpus,
      path: argv.path,
      limit: argv.limit,
      tracked: false,
      mode,
    });

    displayResults(results, {
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
