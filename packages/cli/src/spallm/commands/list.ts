import {
  type CommandDef,
  List,
  noteDirEntries,
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
    ...List.options,
    corpus: {
      alias: "c",
      type: "string",
      description: "Corpus name (default: from spall.json)",
    },
  },
  handler: async (argv) => {
    const { query, notes } = await List.run({
      path: argv.path,
      corpus: (argv as any).corpus,
      tracked: true,
    });

    if (notes.length === 0) {
      console.log("(no notes)");
      printQueryId(query.id);
      return;
    }

    const showAll = Boolean((argv as any).all);
    const entries = showAll ? noteTreeEntries(notes) : noteDirEntries(notes);
    for (const e of entries) {
      const indent = "  ".repeat(e.depth);
      if (e.type === "dir") {
        const suffix =
          typeof e.noteCount === "number"
            ? ` (${e.noteCount} note${e.noteCount === 1 ? "" : "s"})`
            : "";
        console.log(`${indent}${e.name}${suffix}`);
      } else {
        console.log(`${indent}${e.name} (id: ${e.id})`);
      }
    }

    printQueryId(query.id);
  },
};
