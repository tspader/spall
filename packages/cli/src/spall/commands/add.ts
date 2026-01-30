import pc from "picocolors";
import consola from "consola";
import { Client } from "@spall/sdk/client";
import { CLEAR, type CommandDef, defaultTheme } from "@spall/cli/shared";

const BAR_WIDTH = 20;
const theme = defaultTheme;

function renderProgressBar(percent: number): string {
  const filled = Math.round((percent / 100) * BAR_WIDTH);
  const empty = BAR_WIDTH - filled;
  return theme.primary("\u2588".repeat(filled) + "\u2591".repeat(empty));
}

function formatStreamError(e: unknown, path: string): string {
  let code = "";
  let msg = "";

  if (e && typeof e === "object") {
    code = (e as any).code ?? "";
    msg = (e as any).message ?? String(e);
  } else {
    msg = String(e);
  }

  if (code === "note.exists") {
    return `Note already exists at ${theme.primary(path)}. Use ${theme.option("--update")} if you meant to update the note.`;
  }

  if (code === "note.duplicate") {
    return `Duplicate content detected for ${theme.primary(path)}. Use ${theme.option("--dupe")} to allow duplicates.`;
  }

  if (code) return `${code}: ${msg}`;
  return msg;
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
    project: {
      alias: "p",
      type: "string",
      description: "Project name",
    },
    update: {
      alias: "u",
      type: "boolean",
      description: "Update if note exists (upsert)",
    },
    dupe: {
      alias: "d",
      type: "boolean",
      description: "Allow duplicate content",
    },
  },
  handler: async (argv) => {
    const client = await Client.connect();

    const project = await client.project
      .get({ name: argv.project })
      .catch(() => {
        consola.error(`Failed to find project: ${theme.primary(argv.project)}`);
        process.exit(1);
      })
      .then(Client.unwrap);

    let model = "";
    const handleProgress = (event: any) => {
      switch (event.tag) {
        case "model.load":
          consola.info(`Loading model ${theme.primary(event.info.name)}`);
          break;
        case "model.download":
          model = event.info.name;
          consola.info(`Downloading model ${theme.primary(event.info.name)}`);
          break;
        case "model.progress": {
          const percent = (event.downloaded / event.total) * 100;
          const bar = renderProgressBar(percent);
          const percentStr = percent.toFixed(0).padStart(3);
          process.stdout.write(
            `\r${bar} ${pc.bold(percentStr + "%")} ${theme.primary(model)} ${CLEAR}`,
          );
          break;
        }
        case "model.downloaded":
          process.stdout.write(`\r${CLEAR}`);
          consola.success(`Downloaded ${theme.primary(event.info.name)}`);
          break;
      }
    };

    const handleStreamError = (event: any) => {
      if (event?.tag !== "error") return false;
      consola.error(formatStreamError(event.error, argv.path));
      process.exit(1);
    };

    if (argv.update) {
      const existing = await client.note
        .get({ id: project.id.toString(), path: argv.path })
        .then(Client.unwrap)
        .catch(() => null);

      if (!existing) {
        consola.error(`Note not found: ${theme.primary(argv.path)}`);
        process.exit(1);
      }

      const { stream } = await client.sse.note.update({
        id: existing.id.toString(),
        content: argv.text,
        dupe: argv.dupe,
      });

      let result: {
        tag: string;
        info: { path: string; id: number; project: number };
      } | null = null;

      for await (const event of stream as AsyncGenerator<any>) {
        handleProgress(event);
        handleStreamError(event);
        if (event.tag === "note.updated") {
          result = event;
          break;
        }
      }

      if (!result) {
        throw new Error("Note stream ended without result");
      }

      consola.success(
        `Updated note ${theme.primary(result.info.path)} (id: ${result.info.id}, project: ${result.info.project})`,
      );
    } else {
      const { stream } = await client.sse.note.add({
        path: argv.path,
        content: argv.text,
        project: project.id,
        dupe: argv.dupe,
      });

      let result: {
        tag: string;
        info: { path: string; id: number; project: number };
      } | null = null;

      for await (const event of stream as AsyncGenerator<any>) {
        handleProgress(event);
        handleStreamError(event);
        if (event.tag === "note.created") {
          result = event;
          break;
        }
      }

      if (!result) {
        throw new Error("Note stream ended without result");
      }

      consola.success(
        `Added note ${theme.primary(result.info.path)} (id: ${result.info.id}, project: ${result.info.project})`,
      );
    }
  },
};
