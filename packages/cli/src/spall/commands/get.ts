import { Client } from "@spall/sdk/client";
import {
  type CommandDef,
  createEphemeralQuery,
  displayResults,
} from "@spall/cli/shared";

export const get: CommandDef = {
  description: "Get note(s) by path or glob",
  positionals: {
    path: {
      type: "string",
      description: "Path or glob to notes",
      default: "*",
    },
  },
  options: {
    corpus: {
      alias: "c",
      type: "string",
      description: "Corpus name",
    },
    max: {
      alias: "n",
      type: "number",
      description: "Maximum number of notes to return",
    },
    output: {
      alias: "o",
      type: "string",
      description: "Output format: list, tree, table, json",
    },
    all: {
      alias: "a",
      type: "boolean",
      description: "Print all results without limiting output",
    },
  },
  handler: async (argv) => {
    const client = await Client.connect();

    const { query } = await createEphemeralQuery({
      client,
      corpus: (argv as any).corpus,
      tracked: false,
    });

    const output = argv.output ?? (argv.path === "*" ? "tree" : "list");

    const showAll = argv.all === true;

    // query already created

    type NoteInfo = {
      id: number;
      corpus: number;
      path: string;
      content: string;
      contentHash: string;
    };
    type Page = { notes: NoteInfo[]; nextCursor: string | null };
    const notes: NoteInfo[] = [];
    let cursor: string | undefined = undefined;

    // Limit fetching to roughly what we'd display, to avoid over-fetching.
    // Keep this aligned with the renderer's own row budgets.
    const termRows = process.stdout.rows ?? 24;
    const displayRows =
      showAll || output === "json"
        ? Infinity
        : Math.max(1, termRows - (output === "table" ? 4 : 3));
    const fetchLimit = Math.min(argv.max ?? Infinity, displayRows + 1);

    while (notes.length < fetchLimit) {
      const page: Page = await client.query
        .notes({
          id: String(query.id),
          path: argv.path,
          limit: Math.min(100, fetchLimit - notes.length),
          after: cursor,
        })
        .then(Client.unwrap);

      notes.push(...page.notes);

      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }

    displayResults(notes, {
      output,
      showAll,
      empty: "(no notes matching pattern)",
      path: (n) => n.path,
      id: (n) => String(n.id),
      preview: (n) => n.content,
    });
  },
};
