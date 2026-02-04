import pc from "picocolors";
import consola from "consola";
import { existsSync, statSync } from "fs";
import { basename, resolve } from "path";
import * as prompts from "@clack/prompts";
import { Glob } from "bun";
import { Client } from "@spall/sdk/client";
import {
  type CommandDef,
  defaultTheme as theme,
  createModelProgressHandler,
} from "@spall/cli/shared";

function keepServerAlive(client: any, signal: AbortSignal): void {
  // Fire-and-forget: keep SSE connection open; ignore errors.
  (async () => {
    try {
      const { stream } = await client.events({ signal });
      for await (const _ev of stream) {
        // keep-alive; ignore
      }
    } catch {
      // ignore
    }
  })();
}

function canonicalize(path: string): string {
  let p = path.replace(/\\/g, "/");
  p = p.replace(/\/+$/, "");
  p = p.replace(/^\.\//, "");
  p = p.replace(/^\//, "");
  p = p.replace(/\/+/g, "/");
  if (p === ".") return "";
  return p;
}

async function countFiles(
  dir: string,
  globPattern: string,
): Promise<{
  count: number;
  first: string | null;
}> {
  const glob = new Glob(globPattern);
  let count = 0;
  let first: string | null = null;
  for await (const file of glob.scan({ cwd: dir, absolute: false })) {
    count++;
    if (!first) first = file;
  }
  return { count, first };
}

async function extensionCounts(dir: string): Promise<Map<string, number>> {
  const glob = new Glob("**/*");
  const counts = new Map<string, number>();
  for await (const file of glob.scan({ cwd: dir, absolute: false })) {
    const base = file.split("/").pop() ?? file;
    const dot = base.lastIndexOf(".");
    if (dot <= 0 || dot === base.length - 1) continue;
    const ext = base.slice(dot + 1);
    counts.set(ext, (counts.get(ext) ?? 0) + 1);
  }
  return counts;
}

function pickDefaultMask(counts: Map<string, number>): string {
  let bestExt: string | null = null;
  let bestCount = 0;
  for (const [ext, count] of counts) {
    if (count > bestCount) {
      bestExt = ext;
      bestCount = count;
    }
  }
  return bestExt ? `*.${bestExt}` : "*";
}

export const sync: CommandDef = {
  description: "Sync a directory under a path in a corpus",
  positionals: {
    dir: {
      type: "string",
      description: "Directory to scan, recursively",
      required: true,
    },
  },
  options: {
    glob: {
      alias: "g",
      type: "string",
      description: "Glob pattern to match (default: **/*.md)",
    },
    mask: {
      alias: "m",
      type: "string",
      description: "File mask to match (default: *.md)",
    },
    corpus: {
      alias: "c",
      type: "string",
      description: "Corpus name",
      default: "default",
    },
    path: {
      alias: "p",
      type: "string",
      description: "Destination path prefix in corpus",
    },
    interactive: {
      type: "boolean",
      description:
        "Enable interactive prompts (use --no-interactive to disable)",
      default: true,
    },
  },
  handler: async (argv) => {
    let onSigint: (() => void) | null = null;
    const controller = new AbortController();
    try {
      const inputDir = argv.dir as string;
      const dir = resolve(inputDir);
      if (!existsSync(dir) || !statSync(dir).isDirectory()) {
        consola.error(`Not a directory: ${theme.primary(inputDir)}`);
        process.exit(1);
      }

      // First Ctrl-C should terminate quickly. We still abort to stop SSE streams.
      let interrupted = false;
      onSigint = () => {
        if (interrupted) process.exit(130);
        interrupted = true;
        controller.abort();
        process.exit(130);
      };
      process.on("SIGINT", onSigint);

      const client = await Client.connect(controller.signal);

      keepServerAlive(client, controller.signal);

      const interactive =
        (argv as any).interactive !== false &&
        process.stdin.isTTY &&
        process.stdout.isTTY;

      const corpora = await client.corpus.list().then(Client.unwrap);
      const corpusOptions = (corpora as any[])
        .map((c) => {
          const name = c.name as string;
          const noteCount =
            typeof c.noteCount === "number" ? c.noteCount : null;
          return {
            label: name,
            value: name,
            hint: noteCount == null ? undefined : `${noteCount} notes`,
          };
        })
        .sort((a, b) => a.label.localeCompare(b.label));

      const CREATE = "__create_corpus__";
      const corpusPickerOptions = [
        ...corpusOptions,
        { label: "Create new corpus...", value: CREATE, hint: "new" },
      ];

      const defaultCorpusName = String((argv as any).corpus ?? "default");
      const initialCorpus = corpusOptions.some(
        (o) => o.value === defaultCorpusName,
      )
        ? defaultCorpusName
        : corpusOptions[0]?.value;

      // Defaults from CLI flags
      const cliPath =
        typeof (argv as any).path === "string" ? (argv as any).path : "";
      const cliGlob =
        typeof (argv as any).glob === "string" ? (argv as any).glob : undefined;
      const cliMask =
        typeof (argv as any).mask === "string" ? (argv as any).mask : undefined;

      let corpusName = initialCorpus ?? "default";
      const defaultDestPrefix = cliPath || basename(inputDir) || inputDir;
      let destPrefix = defaultDestPrefix;

      let mask = cliMask ?? (cliGlob ? cliGlob.replace(/^\*\*\//, "") : "");
      if (!mask) {
        const counts = await extensionCounts(dir);
        mask = pickDefaultMask(counts);
      }

      if (interactive) {
        prompts.intro(`${theme.dim("spall")} ${theme.primary("sync")}`);

        const pickedCorpus = await prompts.autocomplete<string>({
          message: "Select a corpus",
          options: corpusPickerOptions,
          placeholder: "Type to filter...",
          maxItems: 12,
          initialValue: corpusName,
        });
        if (prompts.isCancel(pickedCorpus)) {
          controller.abort();
          prompts.outro("Cancelled");
          return;
        }
        if (String(pickedCorpus) === CREATE) {
          const name = await prompts.text({
            message: "New corpus name",
            initialValue: basename(inputDir) || "docs",
            validate: (s) =>
              s && s.trim().length > 0 ? undefined : "Required",
          });
          if (prompts.isCancel(name)) {
            controller.abort();
            prompts.outro("Cancelled");
            return;
          }
          corpusName = String(name).trim();
          await client.corpus.create({ name: corpusName }).then(Client.unwrap);
        } else {
          corpusName = String(pickedCorpus);
        }

        const pickedPath = await prompts.text({
          message: "Destination path prefix",
          placeholder: "(e.g. ai-gateway)",
          initialValue: destPrefix,
        });
        if (prompts.isCancel(pickedPath)) {
          controller.abort();
          prompts.outro("Cancelled");
          return;
        }
        destPrefix = String(pickedPath ?? "");

        const pickedMask = await prompts.text({
          message: "File mask",
          placeholder: "(e.g. *.mdx)",
          initialValue: mask,
        });
        if (prompts.isCancel(pickedMask)) {
          controller.abort();
          prompts.outro("Cancelled");
          return;
        }
        mask = String(pickedMask ?? "");
      }

      const corpus = await client.corpus
        .get({ name: corpusName })
        .catch(() => {
          consola.error(
            `Corpus not found: ${theme.command(String(corpusName))}`,
          );
          process.exit(1);
        })
        .then(Client.unwrap);

      const globPattern = cliGlob ?? `**/${mask || "*.md"}`;
      const { count: fileCount, first: firstFile } = await countFiles(
        dir,
        globPattern,
      );

      if (interactive) {
        const prefixLabel = canonicalize(destPrefix) || "(root)";
        const msg = `Syncing ${theme.code(String(fileCount))} files under ${theme.dim(prefixLabel)}${theme.dim("/")} in corpus ${theme.primary(corpusName)}`;

        const ok = await prompts.confirm({ message: msg, initialValue: true });
        if (prompts.isCancel(ok) || ok === false) {
          controller.abort();
          prompts.outro("Cancelled");
          return;
        }
      }

      const handleModelEvent = (() => {
        const base = createModelProgressHandler();
        return (event: any) => {
          switch (event?.tag) {
            case "model.load":
              prompts.log.info(
                `Loading model ${theme.primary(event.info.name)}`,
              );
              return;
            case "model.download":
              prompts.log.info(
                `Downloading model ${theme.primary(event.info.name)}`,
              );
              return;
            case "model.downloaded":
              prompts.log.success(
                `Downloaded ${theme.primary(event.info.name)}`,
              );
              return;
            case "model.progress":
              return;
            default:
              return base(event);
          }
        };
      })();

      let scanTotal = 0;
      const scanCounts = { added: 0, modified: 0, removed: 0, ok: 0 };
      let scanProgress: prompts.ProgressResult | null = null;
      let embedTotalBytes = 0;
      let embedTotalFiles = 0;
      let embedStartTime = 0;
      let embedBytesProcessed = 0;
      let embedProgress: prompts.ProgressResult | null = null;
      let ftsSpinner: ReturnType<typeof prompts.spinner> | null = null;
      let ftsActive = false;

      const { stream } = await (client.sse.note.sync as any)(
        {
          directory: dir,
          glob: globPattern,
          corpus: corpus.id,
          path: destPrefix,
        },
        { signal: controller.signal },
      );

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
            scanProgress = prompts.progress({
              max: Math.max(1, scanTotal),
              indicator: "timer",
            });
            scanProgress.start(
              `Scanning ${theme.primary(dir)} (${theme.primary(String(scanTotal))} files)`,
            );
            break;
          case "scan.progress": {
            const status = event.status as keyof typeof scanCounts;
            if (status in scanCounts) scanCounts[status]++;

            const scanned =
              scanCounts.added +
              scanCounts.modified +
              scanCounts.removed +
              scanCounts.ok;
            scanProgress?.advance(1, `Scanning ${scanned}/${scanTotal}`);

            break;
          }
          case "scan.done":
            scanProgress?.stop(
              `Scan done (added: ${scanCounts.added}, modified: ${scanCounts.modified}, removed: ${scanCounts.removed}, ok: ${scanCounts.ok})`,
            );
            scanProgress = null;
            break;
          case "embed.start":
            embedTotalFiles = event.numFiles;
            embedTotalBytes = event.numBytes;
            embedStartTime = performance.now();
            embedBytesProcessed = 0;
            const sizeStr =
              embedTotalBytes >= 1024 * 1024
                ? `${(embedTotalBytes / (1024 * 1024)).toFixed(1)} MB`
                : embedTotalBytes >= 1024
                  ? `${(embedTotalBytes / 1024).toFixed(1)} KB`
                  : `${embedTotalBytes} B`;
            embedProgress = prompts.progress({
              max: Math.max(1, embedTotalBytes),
              indicator: "timer",
            });
            embedProgress.start(
              `Embedding ${event.numChunks} chunks from ${event.numFiles} files ${pc.dim(`(${sizeStr})`)}`,
            );
            break;
          case "embed.progress": {
            const delta = Math.max(
              0,
              event.numBytesProcessed - embedBytesProcessed,
            );
            embedBytesProcessed = event.numBytesProcessed;

            const percent = embedTotalBytes
              ? (event.numBytesProcessed / embedTotalBytes) * 100
              : 0;
            const percentStr = percent.toFixed(0).padStart(3);
            const elapsed = (performance.now() - embedStartTime) / 1000;
            const bps = elapsed > 0 ? event.numBytesProcessed / elapsed : 0;
            const bpsStr =
              bps >= 1024 * 1024
                ? `${(bps / (1024 * 1024)).toFixed(1)} MB/s`
                : bps >= 1024
                  ? `${(bps / 1024).toFixed(1)} KB/s`
                  : `${bps.toFixed(0)} B/s`;

            embedProgress?.advance(
              delta,
              `${pc.bold(percentStr + "%")} ${event.numFilesProcessed}/${embedTotalFiles} ${pc.dim(`(${bpsStr})`)}`,
            );
            break;
          }
          case "embed.cancel": {
            embedProgress?.stop(
              `CANCELLED ${event.numFilesProcessed}/${embedTotalFiles}`,
            );
            embedProgress = null;
            prompts.log.warn("Index cancelled");
            break;
          }
          case "embed.done":
            embedProgress?.stop("Index complete");
            embedProgress = null;
            break;
          case "fts.start":
            ftsActive = true;
            ftsSpinner = prompts.spinner({ indicator: "timer" });
            ftsSpinner.start("Indexing text (FTS)");
            break;
          case "fts.done":
            if (ftsActive) {
              ftsActive = false;
              ftsSpinner?.stop("FTS index updated");
              ftsSpinner = null;
            }
            break;
        }
      }
      if (onSigint) process.off("SIGINT", onSigint);
    } catch (e: any) {
      if (onSigint) process.off("SIGINT", onSigint);
      const msg = e?.message ?? String(e ?? "Unknown error");
      if (process.stdin.isTTY && process.stdout.isTTY) {
        prompts.log.error(msg);
        prompts.outro("Done");
      } else {
        consola.error(msg);
      }
      process.exit(1);
    } finally {
      // Ensure background /events stream is cancelled so we can exit.
      controller.abort();
    }
  },
};
