import consola from "consola";
import pc from "picocolors";
import { existsSync, statSync } from "fs";
import { Client } from "@spall/sdk/client";
import {
  CLEAR,
  type CommandDef,
  defaultTheme as theme,
} from "@spall/tui/cli/shared";

const BAR_WIDTH = 20;

function renderProgressBar(percent: number): string {
  const filled = Math.round((percent / 100) * BAR_WIDTH);
  const empty = BAR_WIDTH - filled;
  return theme.primary("\u2588".repeat(filled) + "\u2591".repeat(empty));
}

export const sync: CommandDef = {
  description: "Sync a directory to a path in the database",
  positionals: {
    directory: {
      type: "string",
      description: "Directory to scan recursively",
      required: true,
    },
  },
  options: {
    glob: {
      alias: "g",
      type: "string",
      description: "Glob pattern to match (default: **/*.md)",
    },
    project: {
      alias: "p",
      type: "string",
      description: "Project name",
      default: "default",
    },
  },
  handler: async (argv) => {
    const dir = argv.directory as string;
    if (!existsSync(dir) || !statSync(dir).isDirectory()) {
      consola.error(`Not a directory: ${theme.primary(dir)}`);
      process.exit(1);
    }

    const client = await Client.connect();

    const project = await client.project
      .get({ name: argv.project })
      .catch(() => {
        consola.error(`Project not found: ${theme.command(argv.project)}`);
        process.exit(1);
      })
      .then(Client.unwrap);

    let model = "";
    let scanTotal = 0;
    const scanCounts = { added: 0, modified: 0, removed: 0, ok: 0 };
    let embedTotalBytes = 0;
    let embedTotalFiles = 0;

    const { stream } = await client.sse.note.index({
      directory: dir,
      glob: argv.glob,
      project: project.id,
    });

    for await (const event of stream as AsyncGenerator<any>) {
      if (event?.tag === "error") {
        const e = event.error;
        const msg = e?.message ?? String(e ?? "unknown error");
        const code = e?.code ? `${e.code}: ` : "";
        consola.error(code + msg);
        process.exit(1);
      }

      switch (event?.tag) {
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
          process.stderr.write(
            `\r${bar} ${pc.bold(percentStr + "%")} ${theme.primary(model)} ${CLEAR}`,
          );
          await Bun.sleep(10)
          break;
        }
        case "model.downloaded":
          process.stderr.write(`\r${CLEAR}`);
          consola.success(`Downloaded ${theme.primary(event.info.name)}`);
          break;
        case "scan.start":
          scanTotal = event.numFiles;
          consola.info(
            `Scanning ${theme.primary(dir)} (${theme.primary(String(scanTotal))} files)`,
          );
          break;
        case "scan.progress": {
          const status = event.status as keyof typeof scanCounts;
          if (status in scanCounts) scanCounts[status]++;

          const scanned = scanCounts.added + scanCounts.modified + scanCounts.removed + scanCounts.ok;
          process.stderr.write(
            `\rScanning... ${scanned}/${scanTotal} (added: ${scanCounts.added}, modified: ${scanCounts.modified}, removed: ${scanCounts.removed}, ok: ${scanCounts.ok}) ${CLEAR}`,
          );
          await Bun.sleep(10)

          break;
        }
        case "scan.done":
          process.stderr.write(`\r${CLEAR}`);
          consola.success(
            `Scan done (added: ${scanCounts.added}, modified: ${scanCounts.modified}, removed: ${scanCounts.removed}, ok: ${scanCounts.ok})`,
          );
          break;
        case "embed.start":
          embedTotalFiles = event.numFiles;
          embedTotalBytes = event.numBytes;
          consola.info(
            `Embedding ${event.numChunks} chunks from ${event.numFiles} files`,
          );
          break;
        case "embed.progress": {
          const percent = embedTotalBytes
            ? (event.numBytesProcessed / embedTotalBytes) * 100
            : 0;
          const bar = renderProgressBar(percent);
          const percentStr = percent.toFixed(0).padStart(3);
          process.stderr.write(
            `\r${bar} ${pc.bold(percentStr + "%")} files ${event.numFilesProcessed}/${embedTotalFiles} ${CLEAR}`,
          );
          break;
        }
        case "embed.done":
          process.stderr.write(`\r${CLEAR}`);
          consola.success("Index complete");
          break;
      }
    }
  },
};
