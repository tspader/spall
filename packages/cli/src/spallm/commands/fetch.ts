import consola from "consola";
import { Client } from "@spall/sdk/client";
import { type CommandDef, displayLlmFetch } from "@spall/cli/shared";

export const fetch: CommandDef = {
  summary: "Fetch full note content by ID",

  description:`Fetch full note content by ID. Generally used after a broad search operation (e.g. list, search, vsearch) to retrieve full documents

Example:
  spallm fetch --query 175 --ids 547 548`,
  options: {
    query: {
      alias: "q",
      type: "string",
      description: "Query ID",
      required: true,
    },
    ids: {
      type: "array",
      description: "Note IDs to fetch, in a space separated list",
      required: true,
    },
  },
  handler: async (argv) => {
    // Accept both `--ids 1 2 3` and `--ids 1,2,3`
    const raw: string[] = (argv.ids as string[]).flatMap((s: string) =>
      String(s).split(","),
    );
    const ids = raw.map((s) => {
      const n = Number(s.trim());
      if (!Number.isFinite(n)) {
        consola.error(`Invalid note ID: ${s.trim()}`);
        process.exit(1);
      }
      return n;
    });

    const client = await Client.connect();

    const res = await client.query
      .fetch({
        id: String(argv.query),
        ids,
      })
      .then(Client.unwrap);

    displayLlmFetch(res.notes, {
      empty: "(no notes found)",
      path: (n: any) => n.path,
      id: (n: any) => String(n.id),
      content: (n: any) => n.content,
    });
  },
};
