#!/usr/bin/env bun
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { mkdirSync, writeFileSync, existsSync, statSync } from "fs";
import { join, dirname } from "path";
import { Glob } from "bun";
import pc from "picocolors";
import { Store, Model, Event, Io, type IndexEvent } from "@spall/core";

const SPALL_DIR = ".spall";
const DB_NAME = "spall.db";
const NOTES_DIR = "notes";

const TAG_WIDTH = 8;
const BAR_WIDTH = 20;

function renderProgressBar(percent: number): string {
  const filled = Math.round((percent / 100) * BAR_WIDTH);
  const empty = BAR_WIDTH - filled;
  return pc.cyan("\u2588".repeat(filled) + "\u2591".repeat(empty));
}

function formatETA(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600)
    return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function setupEventHandler(): void {
  Event.on((event) => {
    const tag = pc.gray(event.tag.padEnd(TAG_WIDTH));
    switch (event.action) {
      case "create_db":
        console.log(`${tag} creating database at ${event.path}`);
        break;
      case "download":
        console.log(`${tag} downloading ${event.model}`);
        break;
      case "ready":
        console.log(`${tag} ${event.model} ready`);
        break;
      case "done":
        console.log(`${tag} ${pc.green("ok")}`);
        break;
    }
  });
}

function getDbPath(): string {
  return join(process.cwd(), SPALL_DIR, DB_NAME);
}

function getNotesDir(): string {
  return join(process.cwd(), SPALL_DIR, NOTES_DIR);
}

yargs(hideBin(process.argv))
  .scriptName("spall")
  .command(
    "init",
    "Initialize spall in the current directory",
    () => {},
    async () => {
      setupEventHandler();
      const dbPath = getDbPath();
      const notesDir = getNotesDir();

      // Create notes directory
      if (!existsSync(notesDir)) {
        mkdirSync(notesDir, { recursive: true });
      }

      Store.create(dbPath);

      Model.init();
      await Model.download();

      Event.emit({ tag: "init", action: "done" });
      Store.close();
    },
  )
  .command(
    "index",
    "Index all notes in .spall/notes",
    () => {},
    async () => {
      setupEventHandler();
      const dbPath = getDbPath();
      const notesDir = getNotesDir();

      Store.open(dbPath);
      Model.init();
      await Model.download();

      const tag = pc.gray("index".padEnd(TAG_WIDTH));

      // Scan for changes
      const scanResult = await Store.scan(notesDir, (event) => {
        switch (event.type) {
          case "file_add":
            console.log(`${tag} ${pc.green("+")} ${event.path}`);
            break;
          case "file_modify":
            console.log(`${tag} ${pc.yellow("~")} ${event.path}`);
            break;
          case "file_remove":
            console.log(`${tag} ${pc.red("-")} ${event.path}`);
            break;
          case "scan_done":
            if (
              event.added === 0 &&
              event.modified === 0 &&
              event.removed === 0
            ) {
              console.log(`${tag} up to date`);
            }
            break;
        }
      });

      // Embed files that need it
      let startTimeNs = 0;
      let totalBytes = 0;

      await Store.embedFiles(notesDir, scanResult.unembedded, (event) => {
        switch (event.type) {
          case "embed_start":
            startTimeNs = Bun.nanoseconds();
            totalBytes = event.totalBytes;
            break;
          case "embed_progress": {
            const percent = (event.bytesProcessed / event.totalBytes) * 100;
            const bar = renderProgressBar(percent);
            const percentStr = percent.toFixed(0).padStart(3);

            const elapsedSec = (Bun.nanoseconds() - startTimeNs) / 1e9;
            const bytesPerSec = event.bytesProcessed / elapsedSec;
            const remainingBytes = event.totalBytes - event.bytesProcessed;
            const etaSec = remainingBytes / bytesPerSec;

            const throughput = `${formatBytes(bytesPerSec)}/s`;
            const eta = elapsedSec > 2 ? formatETA(etaSec) : "...";

            process.stdout.write(
              `\r${bar} ${pc.bold(percentStr + "%")} ${pc.dim(`${event.current}/${event.total}`)} ${pc.dim(throughput)} ${pc.dim("ETA " + eta)}\x1b[K`,
            );
            break;
          }
          case "embed_done": {
            const totalTimeSec = (Bun.nanoseconds() - startTimeNs) / 1e9;
            const avgThroughput = formatBytes(totalBytes / totalTimeSec);
            console.log(`\r${renderProgressBar(100)} ${pc.bold("100%")}\x1b[K`);
            console.log(
              `${pc.green("done")} in ${pc.bold(formatETA(totalTimeSec))} ${pc.dim(`(${avgThroughput}/s)`)}`,
            );
            break;
          }
        }
      });

      await Model.dispose();
      Store.close();
    },
  )
  .command(
    "get <path>",
    "Get the content of a note",
    (yargs) => {
      return yargs.positional("path", {
        describe: "Path to the note",
        type: "string",
        demandOption: true,
      });
    },
    (argv) => {
      const content = Io.read(getNotesDir(), argv.path);
      console.log(content);
    },
  )
  .command(
    "new <path>",
    "Create a new note",
    (yargs) => {
      return yargs
        .positional("path", {
          describe: "Path for the note (e.g. style/indentation.md)",
          type: "string",
          demandOption: true,
        })
        .option("content", {
          alias: "c",
          type: "string",
          describe: "Content for the note",
          default: "",
        });
    },
    (argv) => {
      const notesDir = getNotesDir();
      let notePath = argv.path;
      if (!notePath.endsWith(".md")) {
        notePath += ".md";
      }
      const filepath = join(notesDir, notePath);
      const dir = dirname(filepath);

      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      if (existsSync(filepath)) {
        console.log(
          `${pc.gray("new".padEnd(TAG_WIDTH))} ${pc.red("exists")} ${notePath}`,
        );
        return;
      }

      writeFileSync(filepath, argv.content);
      console.log(`${pc.gray("new".padEnd(TAG_WIDTH))} created ${notePath}`);
      console.log(
        `${pc.gray("".padEnd(TAG_WIDTH))} run 'spall index' to index`,
      );
    },
  )
  .command(
    "search <query>",
    "Search for similar notes",
    (yargs) => {
      return yargs
        .positional("query", {
          describe: "Search query text",
          type: "string",
          demandOption: true,
        })
        .option("limit", {
          alias: "n",
          type: "number",
          describe: "Maximum number of results",
          default: 10,
        });
    },
    async (argv) => {
      setupEventHandler();
      const dbPath = getDbPath();
      Store.open(dbPath);
      Model.init();
      await Model.download();
      await Model.load();

      const queryEmbedding = await Model.embed(argv.query);

      // Search
      const results = Store.vsearch(queryEmbedding, argv.limit);

      if (results.length === 0) {
        console.log("No results found.");
      } else {
        // Dedupe by key (multiple chunks may match)
        const seen = new Set<string>();
        for (const result of results) {
          if (seen.has(result.key)) continue;
          seen.add(result.key);

          const similarity = (1 - result.distance).toFixed(3);
          const content = Io.read(getNotesDir(), result.key);
          const preview = content
            ? content.slice(0, 80).replace(/\n/g, " ") +
              (content.length > 80 ? "..." : "")
            : "(no content)";

          console.log(
            `${pc.green(similarity)} ${pc.cyan(result.key)} ${pc.gray(preview)}`,
          );
        }
      }

      await Model.dispose();
      Store.close();
    },
  )
  .command(
    "list [path]",
    "List notes in .spall/notes",
    (yargs) => {
      return yargs.positional("path", {
        describe: "Path to list (default: root)",
        type: "string",
        default: "",
      });
    },
    async (argv) => {
      const notesDir = getNotesDir();
      const targetDir = argv.path ? join(notesDir, argv.path) : notesDir;

      if (!existsSync(targetDir)) {
        console.log(pc.gray("(directory not found)"));
        return;
      }

      const glob = new Glob("**/*");
      const entries: { path: string; isDir: boolean }[] = [];

      for await (const path of glob.scan({ cwd: targetDir, absolute: false })) {
        const fullPath = join(targetDir, path);
        const stat = statSync(fullPath);
        entries.push({ path, isDir: stat.isDirectory() });
      }

      if (entries.length === 0) {
        console.log(pc.gray("(empty)"));
        return;
      }

      // Build tree
      type TreeNode = {
        name: string;
        isDir: boolean;
        children: Map<string, TreeNode>;
      };
      const root: TreeNode = { name: "", isDir: true, children: new Map() };

      for (const { path, isDir } of entries) {
        const parts = path.split("/");
        let current = root;
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i]!;
          const isLast = i === parts.length - 1;
          if (!current.children.has(part)) {
            current.children.set(part, {
              name: part,
              isDir: isLast ? isDir : true,
              children: new Map(),
            });
          }
          current = current.children.get(part)!;
        }
      }

      // Print tree
      function printTree(node: TreeNode, indent: string = ""): void {
        const sorted = Array.from(node.children.entries()).sort((a, b) => {
          // Directories first
          if (a[1].isDir !== b[1].isDir) return a[1].isDir ? -1 : 1;
          return a[0].localeCompare(b[0]);
        });

        for (const [name, child] of sorted) {
          if (child.isDir) {
            console.log(`${indent}${pc.cyan(name + "/")}`);
            printTree(child, indent + "  ");
          } else {
            console.log(`${indent}${name}`);
          }
        }
      }

      printTree(root);
    },
  )
  .demandCommand(1, "You must specify a command")
  .strict()
  .help()
  .parse();
