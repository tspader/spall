import consola from "consola";
import { Client } from "@spall/sdk/client";
import { ProjectConfig } from "@spall/core";
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
    project: { alias: "p", type: "string", description: "Project name" },
    update: { alias: "u", type: "boolean", description: "Update if exists" },
    dupe: {
      alias: "d",
      type: "boolean",
      description: "Allow duplicate content",
    },
  },
  handler: async (argv) => {
    const client = await Client.connect();

    const projectName: string =
      argv.project ?? ProjectConfig.load(process.cwd()).projects[0];

    const project = await client.project
      .get({ name: projectName })
      .then(Client.unwrap)
      .catch(() => {
        consola.error(`Project not found: ${projectName}`);
        process.exit(1);
      });

    if (argv.update) {
      const existing = await client.note
        .get({ id: project.id.toString(), path: argv.path })
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

      for await (const event of stream as AsyncGenerator<any>) {
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
        project: project.id,
        dupe: argv.dupe,
      });

      for await (const event of stream as AsyncGenerator<any>) {
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
