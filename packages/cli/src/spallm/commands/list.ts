import { Client } from "@spall/sdk/client";
import {
  type CommandDef,
  createEphemeralQuery,
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
    limit: {
      alias: "n",
      type: "number",
      description: "Max notes to list (default: 50)",
    },
  },
  handler: async (argv) => {
    const client = await Client.connect();

    const { query } = await createEphemeralQuery({
      client,
      corpus: (argv as any).corpus,
      tracked: true,
    });

    const limit = Number(argv.limit ?? 50);
    const path = String(argv.path ?? "*");

    const page = await client.query
      .notes({ id: String(query.id), path, limit })
      .then(Client.unwrap);

    const notes = (page.notes as Array<{ id: number; path: string }>).slice();
    notes.sort((a, b) => a.path.localeCompare(b.path));

    if (notes.length === 0) {
      console.log("(no notes)");
      printQueryId(query.id);
      return;
    }

    // Simple tree printer: directories once, then files as "name (id: N)".
    const seenDirs = new Set<string>();
    for (const note of notes) {
      const parts = note.path.split("/");
      let prefix = "";
      for (let i = 0; i < parts.length - 1; i++) {
        prefix = prefix ? `${prefix}/${parts[i]}` : parts[i]!;
        if (!seenDirs.has(prefix)) {
          seenDirs.add(prefix);
          console.log(`${" ".repeat(i)}${parts[i]}/`);
        }
      }
      const fileIndent = Math.max(0, parts.length - 1);
      console.log(
        `${" ".repeat(fileIndent)}${parts[parts.length - 1]} (id: ${note.id})`,
      );
    }

    printQueryId(query.id);
  },
};
