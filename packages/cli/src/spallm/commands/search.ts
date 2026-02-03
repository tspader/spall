import { Client } from "@spall/sdk/client";
import {
  type CommandDef,
  createEphemeralQuery,
  displayLlmSearch,
} from "@spall/cli/shared";

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

    const { query } = await createEphemeralQuery({
      client,
      project: argv.project,
      tracked: true,
    });

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
