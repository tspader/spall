import { Client } from "@spall/sdk/client";
import { createQuery } from "./workspace";
import { defaultTheme as theme } from "./theme";
import type { Positionals, Options } from "./yargs";

export namespace Vsearch {
  export const summary = `Semantic vector ${theme.search()}`;

  export function description(cliName: string): string {
    return `Semantic vector ${theme.search()} using embeddings. Returns truncated previews with note IDs.

Use \`fetch\` with the returned Query ID and note IDs to get full content.

Example:
  ${cliName} ${theme.search({ prefix: "v" })} "how to configure r2 bindings"
`;
  }

  export const positionals: Positionals = {
    query: {
      type: "string",
      description: `Natural language ${theme.search()} query`,
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
      description: "Max results",
      default: 10,
    },
  };

  export function collapseWhitespace(s: string): string {
    return s.replace(/\s+/g, " ").trim();
  }

  export async function run(argv: {
    query: string;
    corpus?: string;
    path?: string;
    limit?: number;
    tracked: boolean;
  }) {
    const client = await Client.connect();

    const { query } = await createQuery({
      client,
      corpus: argv.corpus,
      tracked: argv.tracked,
    });

    const res = await client.query
      .vsearch({
        id: String(query.id),
        q: argv.query,
        path: argv.path,
        limit: argv.limit,
      })
      .then(Client.unwrap);

    return { client, query, results: res.results };
  }
}
