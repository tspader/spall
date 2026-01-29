import pc from "picocolors";
import consola from "consola";
import { Client } from "@spall/sdk/client";
import { CLEAR } from "../layout";
import type { CommandDef } from "../yargs";
import { type Theme, defaultTheme } from '../theme'

const BAR_WIDTH = 20;
const theme = defaultTheme

function renderProgressBar(percent: number): string {
  const filled = Math.round((percent / 100) * BAR_WIDTH);
  const empty = BAR_WIDTH - filled;
  return theme.command("\u2588".repeat(filled) + "\u2591".repeat(empty));
}

export const add: CommandDef = {
  description: "Add a note to the corpus",
  positionals: {
    path: {
      type: "string",
      description: "Path/name for the note",
      required: true,
    },
  },
  options: {
    text: {
      alias: "t",
      type: "string",
      description: "Note content",
      required: true,
    },
    project: { alias: "p", type: "string", description: "Project name" },
    update: {
      alias: "u",
      type: "boolean",
      description: "Update if note exists (upsert)",
    },
  },
  handler: async (argv) => {
    const client = await Client.connect();

    const project = await client.project
      .get({ name: argv.project })
      .catch(() => {
        consola.error(`Failed to find project: ${pc.bgCyan(argv.project)}`);
        process.exit(1);
      })
      .then(Client.unwrap);

    const existing = await client.note
      .get({ id: project.id.toString(), path: argv.path })
      .then(Client.unwrap)
      .catch(() => null);

    if (existing && !argv.update) {
      consola.error(
        `Note already exists: ${theme.command(argv.path)}. Use --update to update it.`,
      );
      process.exit(1);
    }

    let model = ""
    const handleProgress = (event: any) => {
      switch (event.tag) {
        case "model.load":
          consola.info(`Loading model ${theme.command(event.info.name)}`);
          break;
        case "model.download":
          model = event.info.name
          consola.info(`Downloading model ${theme.command(event.info.name)}`);
          break;
        case "model.progress": {
          const percent = (event.downloaded / event.total) * 100;
          const bar = renderProgressBar(percent);
          const percentStr = percent.toFixed(0).padStart(3);
          process.stdout.write(
            `\r${bar} ${pc.bold(percentStr + "%")} ${theme.command(model)} ${CLEAR}`,
          );
          break;
        }
        case "model.downloaded":
          process.stdout.write(`\r${CLEAR}`);
          consola.success(`Downloaded ${theme.command(event.info.name)}`);
          break;
      }
    };

    if (existing) {
      const { stream } = await client.note.update({
        id: existing.id.toString(),
        content: argv.text,
      });

      const result = await Client.until(stream, "note.updated", handleProgress);

      consola.success(
        `Updated note ${theme.command(result.info.path)} (id: ${result.info.id}, project: ${result.info.project})`,
      );
    } else {
      const { stream } = await client.note.add({
        path: argv.path,
        content: argv.text,
        project: project.id,
      });

      const result = await Client.until(stream, "note.created", handleProgress);

      consola.success(
        `Added note ${theme.command(result.info.path)} (id: ${result.info.id}, project: ${result.info.project})`,
      );
    }
  },
};
