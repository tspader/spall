import consola from "consola";
import { Client } from "@spall/sdk/client";
import { WorkspaceConfig } from "@spall/core";
import type { CommandDef } from "@spall/cli/shared";

export const add: CommandDef = {
  summary: "Add a note to the corpus",
  description: `Add a note to the corpus. Returns JSON with the new note ID.

Example:
  spallm add "docs/my-note.md" -t "# My Note\\nContent here"
`,
  positionals: {
    path: { type: "string", description: "Note path", required: true },
  },
  options: {
    text: {
      alias: "t",
      type: "string",
      description: "Note content",
      required: true,
    },
    corpus: { alias: "c", type: "string", description: "Corpus name" },
    update: { alias: "u", type: "boolean", description: "Update if exists" },
    dupe: {
      alias: "d",
      type: "boolean",
      description: "Allow duplicate content",
    },
  },
  handler: async (argv) => {
    const client = await Client.connect();

    const corpusName: string =
      (argv as any).corpus ?? WorkspaceConfig.load(process.cwd()).include[0];

    const corpus = await client.corpus
      .get({ name: corpusName })
      .then(Client.unwrap)
      .catch(() => {
        consola.error(`Corpus not found: ${corpusName}`);
        process.exit(1);
      });

    if (argv.update) {
      const existing = await client.note
        .get({ id: corpus.id.toString(), path: argv.path })
        .then(Client.unwrap)
        .catch(() => null);

      if (!existing) {
        consola.error(`Note not found: ${argv.path}`);
        process.exit(1);
      }

      const { stream } = await client.sse.note.update({
        id: existing.id.toString(),
        content: argv.text,
        dupe: argv.dupe,
      });

      for await (const event of stream) {
        if (event.tag === "error") {
          console.log(JSON.stringify({ error: event.error }));
          process.exit(1);
        }
        if (event.tag === "note.updated") {
          console.log(JSON.stringify({ ok: true, ...event.info }));
          break;
        }
      }
    } else {
      const { stream } = await client.sse.note.add({
        path: argv.path,
        content: argv.text,
        corpus: corpus.id,
        dupe: argv.dupe,
      });

      for await (const event of stream) {
        if (event.tag === "error") {
          console.log(JSON.stringify({ error: event.error }));
          process.exit(1);
        }
        if (event.tag === "note.created") {
          console.log(JSON.stringify({ ok: true, ...event.info }));
          break;
        }
      }
    }
  },
};
