import pc from "picocolors";
import consola from "consola";
import { existsSync, statSync } from "fs";
import { Client } from "@spall/sdk/client";
import {
  CLEAR,
  type CommandDef,
  defaultTheme as theme,
  renderProgressBar,
  createModelProgressHandler,
} from "@spall/cli/shared";

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

    const handleModelEvent = createModelProgressHandler();

    let scanTotal = 0;
    const scanCounts = { added: 0, modified: 0, removed: 0, ok: 0 };
    let embedTotalBytes = 0;
    let embedTotalFiles = 0;
    let embedStartTime = 0;

    const { stream } = await client.sse.note.sync({
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

      handleModelEvent(event);

      switch (event?.tag) {
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
          embedStartTime = performance.now();
          const sizeStr = embedTotalBytes >= 1024 * 1024
            ? `${(embedTotalBytes / (1024 * 1024)).toFixed(1)} MB`
            : embedTotalBytes >= 1024
              ? `${(embedTotalBytes / 1024).toFixed(1)} KB`
              : `${embedTotalBytes} B`;
          consola.info(
            `Embedding ${event.numChunks} chunks from ${event.numFiles} files ${pc.dim(`(${sizeStr})`)}`,
          );
          break;
        case "embed.progress": {
          const percent = embedTotalBytes
            ? (event.numBytesProcessed / embedTotalBytes) * 100
            : 0;
          const bar = renderProgressBar(percent);
          const percentStr = percent.toFixed(0).padStart(3);
          const elapsed = (performance.now() - embedStartTime) / 1000;
          const bps = elapsed > 0 ? event.numBytesProcessed / elapsed : 0;
          const bpsStr = bps >= 1024 * 1024
            ? `${(bps / (1024 * 1024)).toFixed(1)} MB/s`
            : bps >= 1024
              ? `${(bps / 1024).toFixed(1)} KB/s`
              : `${bps.toFixed(0)} B/s`;
          process.stderr.write(
            `\r${bar} ${pc.bold(percentStr + "%")} files ${event.numFilesProcessed}/${embedTotalFiles} ${pc.dim(`(${bpsStr})`)} ${CLEAR}`,
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
