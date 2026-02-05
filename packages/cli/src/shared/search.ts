import { Client } from "@spall/sdk/client";
import { createQuery } from "./workspace";
import { defaultTheme as theme } from "./theme";
import type { Positionals, Options } from "./yargs";

export namespace Search {
  export const summary = `Keyword ${theme.search()} (FTS)`;

  export function description(cliName: string): string {
    return `Full-text keyword ${theme.search()}. Returns truncated previews with note IDs.

Use \`fetch\` with the returned Query ID and note IDs to get full content.

Example:
  ${cliName} ${theme.search()} "R2Bucket"
`;
  }

  export const positionals: Positionals = {
    query: {
      type: "string",
      description: "Search keywords",
      required: true,
    },
  };

  export const options: Options = {
    corpus: {
      alias: "c",
      type: "string",
      description: "Corpus name (default: from spall.json)",
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
  };

  export async function run(argv: {
    query: string;
    corpus?: string;
    path?: string;
    limit?: number;
    tracked: boolean;
    mode?: "plain" | "fts";
  }) {
    const client = await Client.connect();

    const { query } = await createQuery({
      client,
      corpus: argv.corpus,
      tracked: argv.tracked,
    });

    const res = await client.query
      .search({
        id: String(query.id),
        q: argv.query,
        path: argv.path,
        limit: argv.limit,
        ...(argv.mode ? { mode: argv.mode } : {}),
      })
      .then(Client.unwrap);

    return { client, query, results: res.results };
  }
}
