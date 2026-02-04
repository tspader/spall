import { Client } from "@spall/sdk/client";
import {
  type CommandDef,
  createEphemeralQuery,
  displayLlmSearch,
  defaultTheme as theme
} from "@spall/cli/shared";

export const vsearch: CommandDef = {
  summary: `Semantic vector ${theme.search()}`,
  description: `Semantic vector ${theme.search()} using embeddings. Returns truncated previews with note IDs.

Use \`fetch\` with the returned Query ID and note IDs to get full content.

Example:
  spallm ${theme.search({ prefix: "v" })} "how to configure r2 bindings"
`,
  positionals: {
    query: {
      type: "string",
      description: `Natural language ${theme.search()} query`,
      required: true,
    },
  },
  options: {
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
  },
  handler: async (argv) => {
    const client = await Client.connect();

    const { query } = await createEphemeralQuery({
      client,
      corpus: (argv as any).corpus,
      tracked: true,
    });

    const res = await client.query
      .vsearch({
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
      preview: (r: any) => r.chunk,
      queryId: query.id,
    });
  },
};
