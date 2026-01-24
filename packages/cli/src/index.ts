#!/usr/bin/env bun
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { writeFileSync, existsSync, statSync } from "fs";
import { join, dirname } from "path";
import { mkdirSync } from "fs";
import { Glob } from "bun";
import pc from "picocolors";
import { Io, Server as CoreServer } from "@spall/core";
import {
  createSpallClient,
  Client,
  Server,
  type InitResponse,
  type IndexResponse,
  type SearchResult,
} from "@spall/sdk";

const SPALL_DIR = ".spall";
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

function getDirectory(): string {
  return process.cwd();
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
      const directory = getDirectory();
      const tag = pc.gray("init".padEnd(TAG_WIDTH));

      const client = await Client.connect();

      const { stream } = await client.init({ directory });

      for await (const event of stream) {
        if (event.tag === "init") {
          switch (event.action) {
            case "create_dir":
              console.log(
                `${tag} Creating directory ${pc.cyanBright(event.path)}`,
              );
              break;
            case "create_db":
              console.log(
                `${tag} Creating database ${pc.cyanBright(event.path)}`,
              );
              break;
            case "done":
              console.log(`${tag} Done`);
              break;
          }
        } else if (event.tag === "model") {
          const modelTag = pc.gray("model".padEnd(TAG_WIDTH));
          switch (event.action) {
            case "download":
              console.log(
                `${modelTag} Downloading ${pc.cyanBright(event.model)}`,
              );
              break;
            case "load": {
              const size = statSync(event.path).size;
              console.log(
                `${modelTag} Loading ${pc.cyanBright(event.model)} ${pc.dim(`(${formatBytes(size)})`)}`,
              );
              break;
            }
            case "ready":
              console.log(`${modelTag} Ready`);
              break;
          }
        }
      }
    },
  )
  .command(
    "serve",
    "Start the spall server",
    (yargs) => {
      return yargs.option("daemon", {
        alias: "d",
        type: "boolean",
        default: false,
        describe: "Run indefinitely (don't exit after last client disconnects)",
      });
    },
    async (argv) => {
      const tag = pc.gray("server".padEnd(TAG_WIDTH));

      const { port, stopped } = await CoreServer.start({
        persist: argv.daemon,
      });
      console.log(`${tag} Listening on port ${pc.cyanBright(String(port))}`);

      await stopped;
    },
  )
  .command(
    "index",
    "Index all notes in .spall/notes",
    () => {},
    async () => {
      const directory = getDirectory();
      const tag = pc.gray("index".padEnd(TAG_WIDTH));
      const clear = "\x1b[K";

      // Set up index event handler
      let startTimeNs = 0;
      let totalFiles = 0;
      let totalBytes = 0;

      const handleEvent = (event: IndexResponse) => {
        if (event.tag === "scan") {
          switch (event.action) {
            case "start":
              console.log(`${tag} Scanning ${event.total} files`);
              break;
            case "progress":
              // Could show per-file progress here if desired
              break;
            case "done":
              console.log(`${tag} Scan complete`);
              break;
          }
        } else if (event.tag === "embed") {
          switch (event.action) {
            case "start":
              startTimeNs = Bun.nanoseconds();
              totalFiles = event.totalDocs;
              totalBytes = event.totalBytes;
              console.log(
                `${tag} Embedding ${event.totalDocs} files (${event.totalChunks} chunks, ${formatBytes(event.totalBytes)})`,
              );
              break;
            case "progress": {
              const percent = (event.bytesProcessed / totalBytes) * 100;
              const bar = renderProgressBar(percent);
              const percentStr = percent.toFixed(0).padStart(3);

              const elapsedSec = (Bun.nanoseconds() - startTimeNs) / 1e9;
              const bytesPerSec = event.bytesProcessed / elapsedSec;
              const remainingBytes = totalBytes - event.bytesProcessed;
              const etaSec = remainingBytes / bytesPerSec;

              const throughput = `${formatBytes(bytesPerSec)}/s`;
              const eta = elapsedSec > 2 ? formatETA(etaSec) : "...";
              const fileProgress = `${event.filesProcessed}/${totalFiles}`;

              process.stdout.write(
                `\r${bar} ${pc.bold(percentStr + "%")} ${pc.dim(fileProgress)} ${pc.dim(throughput)} ${pc.dim("ETA " + eta)}${clear}`,
              );
              break;
            }
            case "done": {
              const totalTimeSec = (Bun.nanoseconds() - startTimeNs) / 1e9;
              console.log(`\r${renderProgressBar(100)} 100%${clear}`);
              console.log(
                `Finished in ${pc.bold(totalTimeSec.toPrecision(3))}s`,
              );
              break;
            }
          }
        }
      };

      // Connect to server (auto-start if needed)
      const baseUrl = await Server.ensure();
      const client = createSpallClient({ baseUrl });

      // Call index endpoint and consume SSE stream
      const { stream } = await client.index({ directory });

      for await (const event of stream) {
        handleEvent(event);
      }
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
      const directory = getDirectory();

      // Connect to server (auto-start if needed)
      const baseUrl = await Server.ensure();
      const client = createSpallClient({ baseUrl });

      const result = await client.search({
        directory,
        query: argv.query,
        limit: argv.limit,
      });

      if (result.error || !result.data) {
        console.error("Search failed:", result.error);
        process.exit(1);
      }

      const results = result.data;

      if (results.length === 0) {
        console.log("No results found.");
      } else {
        // Dedupe by key (multiple chunks may match)
        const seen = new Set<string>();
        for (const r of results) {
          if (seen.has(r.key)) continue;
          seen.add(r.key);

          const similarity = (1 - r.distance).toFixed(3);
          const content = Io.read(getNotesDir(), r.key);
          const preview = content
            ? content.slice(0, 80).replace(/\n/g, " ") +
              (content.length > 80 ? "..." : "")
            : "(no content)";

          console.log(
            `${pc.green(similarity)} ${pc.cyan(r.key)} ${pc.gray(preview)}`,
          );
        }
      }
    },
  )
  .command(
    "list [path]",
    "List notes in .spall/notes",
    (yargs) => {
      return yargs
        .positional("path", {
          describe: "Path to list (default: root)",
          type: "string",
          default: "",
        })
        .option("all", {
          alias: "a",
          describe: "Show all files without truncation",
          type: "boolean",
          default: false,
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

        const dirs = sorted.filter(([, child]) => child.isDir);
        const files = sorted.filter(([, child]) => !child.isDir);

        for (const [name, child] of dirs) {
          console.log(`${indent}${pc.cyan(name + "/")}`);
          printTree(child, indent + "  ");
        }

        const maxFiles = argv.all ? files.length : 3;
        for (let i = 0; i < Math.min(files.length, maxFiles); i++) {
          console.log(`${indent}${files[i]![0]}`);
        }

        if (!argv.all && files.length > maxFiles) {
          console.log(
            `${indent}${pc.dim(`...${files.length - maxFiles} more`)}`,
          );
        }
      }

      printTree(root);
    },
  )
  .command(
    "review",
    "Launch the interactive diff review TUI",
    () => {},
    async () => {
      const { spawn } = await import("child_process");
      const tuiPath = require.resolve("@spall/tui");
      const child = spawn("bun", ["run", tuiPath], {
        stdio: "inherit",
        cwd: process.cwd(),
      });
      await new Promise<void>((resolve, reject) => {
        child.on("close", (code) => {
          if (code === 0) resolve();
          else reject(new Error(`TUI exited with code ${code}`));
        });
        child.on("error", reject);
      });
    },
  )
  .demandCommand(1, "You must specify a command")
  .strict()
  .help()
  .parse();
