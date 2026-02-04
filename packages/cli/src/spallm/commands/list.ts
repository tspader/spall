import { Client } from "@spall/sdk/client";
import {
  type CommandDef,
  createEphemeralQuery,
  noteTreeEntries,
  printQueryId,
} from "@spall/cli/shared";

export const list: CommandDef = {
  summary: "Browse notes as a directory tree",
  description: `List notes as a directory tree. Shows paths and IDs, no content.

Use a path glob to drill into subtrees. Use \`fetch\` to get full content.

Example:
  spallm list "docs/cloudflare/*"
`,
  positionals: {
    path: {
      type: "string",
      description: "Path glob filter (default: *)",
    },
  },
  options: {
    corpus: {
      alias: "c",
      type: "string",
      description: "Corpus name (default: from spall.json)",
    },
  },
  handler: async (argv) => {
    const client = await Client.connect();

    const { query } = await createEphemeralQuery({
      client,
      corpus: (argv as any).corpus,
      tracked: true,
    });

    const path = String(argv.path ?? "*");

    type NoteInfo = { id: number; path: string };
    type Page = { notes: NoteInfo[]; nextCursor: string | null };
    const notes: NoteInfo[] = [];
    let cursor: string | undefined = undefined;

    while (true) {
      const page: Page = await client.query
        .notes({ id: String(query.id), path, limit: 100, after: cursor })
        .then(Client.unwrap);

      for (const n of page.notes) notes.push({ id: n.id, path: n.path });
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }

    notes.sort((a, b) => a.path.localeCompare(b.path));

    if (notes.length === 0) {
      console.log("(no notes)");
      printQueryId(query.id);
      return;
    }

    const entries = noteTreeEntries(notes);
    for (const e of entries) {
      const indent = "  ".repeat(e.depth);
      if (e.type === "dir") {
        console.log(`${indent}${e.name}`);
      } else {
        console.log(`${indent}${e.name} (id: ${e.id})`);
      }
    }

    printQueryId(query.id);
  },
};
