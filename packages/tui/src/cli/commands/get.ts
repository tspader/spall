import pc from "picocolors";
import consola from "consola";
import { Client } from "@spall/sdk/client";
import { table } from "../layout";
import type { CommandDef } from "../yargs";

export const get: CommandDef = {
  description: "Get the content of a note (supports glob patterns)",
  positionals: {
    path: {
      type: "string",
      description: "Path to the note (glob patterns like 'foo/*' supported)",
      required: true,
    },
  },
  options: {
    project: {
      alias: "p",
      type: "string",
      description: "Project name",
      default: "default",
    },
    max: {
      alias: "n",
      type: "number",
      description: "Maximum number of notes to return",
    },
    output: {
      alias: "o",
      type: "string",
      description: "Output format: list, table, json",
      default: "list",
    },
  },
  handler: async (argv) => {
    const client = await Client.connect();

    const project = await client.project
      .get({ name: argv.project })
      .then(Client.unwrap)
      .catch(() => {
        consola.error(`Project not found: ${pc.cyan(argv.project)}`);
        process.exit(1);
      });

    type NoteInfo = {
      id: number;
      project: number;
      path: string;
      content: string;
      contentHash: string;
    };
    type Page = { notes: NoteInfo[]; nextCursor: string | null };
    const notes: NoteInfo[] = [];
    let cursor: string | undefined = undefined;
    const limit = argv.max ?? Infinity;

    while (notes.length < limit) {
      const page: Page = await client.note
        .listByPath({
          id: String(project.id),
          path: argv.path,
          limit: Math.min(100, limit - notes.length),
          after: cursor,
        })
        .then(Client.unwrap);

      notes.push(...page.notes);

      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }

    if (notes.length === 0) {
      console.log(pc.dim("(no notes matching pattern)"));
      return;
    }

    switch (argv.output) {
      case "json":
        console.log(JSON.stringify(notes, null, 2));
        break;
      case "table": {
        const oneLine = (s: string) => s.replace(/\n/g, " ");
        table(
          ["path", "id", "content"],
          [
            notes.map((n) => n.path),
            notes.map((n) => String(n.id)),
            notes.map((n) => oneLine(n.content)),
          ],
          { flex: [1, 0, 2] },
        );
        break;
      }
      default:
        for (let i = 0; i < notes.length; i++) {
          const note = notes[i]!;
          if (notes.length > 1) {
            console.log(pc.cyan(note.path));
          }
          console.log(note.content);
          if (i < notes.length - 1) console.log("");
        }
    }
  },
};
