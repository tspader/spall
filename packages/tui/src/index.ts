#!/usr/bin/env bun
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { existsSync, statSync } from "fs";

import pc from "picocolors";
import { Client } from "@spall/sdk/client";
import { Store, Review, ReviewComment } from "./lib/store";
import consola from "consola";

// Initialize review store
Store.init();

const BAR_WIDTH = 20;

namespace Cli {
  export const CLEAR = "\x1b[K";

  export function table(headers: string[], columns: string[][]): void {
    const numCols = headers.length;
    const widths: number[] = [];

    for (let i = 0; i < numCols; i++) {
      const col = columns[i] ?? [];
      widths[i] = Math.max(headers[i]!.length, ...col.map((v) => v.length));
    }

    const header = headers.map((h, i) => h.padEnd(widths[i]!)).join("  ");
    console.log(pc.dim(header));

    const numRows = Math.max(...columns.map((c) => c.length));
    for (let row = 0; row < numRows; row++) {
      const line = columns
        .map((col, i) => (col[row] ?? "").padEnd(widths[i]!))
        .join("  ");
      console.log(line);
    }
  }
}

function renderProgressBar(percent: number): string {
  const filled = Math.round((percent / 100) * BAR_WIDTH);
  const empty = BAR_WIDTH - filled;
  return pc.cyan("\u2588".repeat(filled) + "\u2591".repeat(empty));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

yargs(hideBin(process.argv))
  .scriptName("spall")
  .command("project", "Manage projects", (yargs) => {
    return yargs
      .command(
        "create [name]",
        "Create a new project",
        (yargs) => {
          return yargs
            .positional("name", {
              describe: "Project name (defaults to directory name)",
              type: "string",
            })
            .option("dir", {
              alias: "d",
              type: "string",
              describe: "Project directory",
              default: process.cwd(),
            });
        },
        async (argv) => {
          const t0 = Bun.nanoseconds();
          const client = await Client.connect();
          const t1 = Bun.nanoseconds();
          consola.debug(`Client.connect: ${((t1 - t0) / 1e6).toFixed(2)}ms`);

          const { stream } = await client.project.create({
            dir: argv.dir,
            name: argv.name,
          });
          const t2 = Bun.nanoseconds();
          consola.debug(
            `project.create (start stream): ${((t2 - t1) / 1e6).toFixed(2)}ms`,
          );

          for await (const event of stream) {
            switch (event.tag) {
              case "store.create":
                consola.info(
                  `Creating database at ${pc.cyanBright(event.path)}`,
                );
                break;
              case "store.created":
                consola.info(
                  `Created database at ${pc.cyanBright(event.path)}`,
                );
                break;
              case "model.download":
                consola.info(`Downloading ${pc.cyanBright(event.info.name)}`);
                break;
              case "model.progress": {
                const percent = (event.downloaded / event.total) * 100;
                const bar = renderProgressBar(percent);
                const percentStr = percent.toFixed(0).padStart(3);
                process.stdout.write(
                  `\r${bar} ${pc.bold(percentStr + "%")} ${Cli.CLEAR}`,
                );
                break;
              }
              case "model.downloaded": {
                let sizeStr = "";
                if (existsSync(event.info.path)) {
                  const size = statSync(event.info.path).size;
                  sizeStr = ` ${pc.dim(`(${formatBytes(size)})`)}`;
                }
                // Overwrite progress bar line
                process.stdout.write(`\r${Cli.CLEAR}`);
                consola.success(
                  `Loaded ${pc.cyanBright(event.info.name)}${sizeStr}`,
                );
                break;
              }
              case "model.load":
                consola.info(`Model ready: ${pc.cyanBright(event.info.name)}`);
                break;
              case "project.created":
                consola.success(
                  `Created project ${pc.cyanBright(event.info.name)} (id: ${event.info.id})`,
                );
                break;
            }
          }
          const t3 = Bun.nanoseconds();
          consola.debug(
            `stream consumption: ${((t3 - t2) / 1e6).toFixed(2)}ms`,
          );
          consola.debug(`total: ${((t3 - t0) / 1e6).toFixed(2)}ms`);
        },
      )
      .command(
        "list",
        "List all projects",
        () => {},
        async () => {
          const client = await Client.connect();
          const result = await client.project.list();

          if (result.error || !result.data) {
            consola.error("Failed to list projects:", result.error);
            process.exit(1);
          }

          const projects = result.data;
          if (projects.length === 0) {
            console.log("No projects found.");
            return;
          }

          type P = (typeof projects)[number];
          const formatTime = (ts: number) =>
            new Date(ts).toISOString().slice(0, 19).replace("T", " ");

          Cli.table(
            ["name", "id", "notes", "created", "updated"],
            [
              projects.map((p: P) => p.name),
              projects.map((p: P) => String(p.id)),
              projects.map((p: P) => String(p.noteCount)),
              projects.map((p: P) => formatTime(p.createdAt)),
              projects.map((p: P) => formatTime(p.updatedAt)),
            ],
          );
        },
      )
      .demandCommand(1, "You must specify a subcommand");
  })
  .command("review", "Manage reviews", (yargs) => {
    return yargs
      .command(
        "list <project>",
        "List reviews for a project",
        (yargs) => {
          return yargs.positional("project", {
            describe: "Project ID",
            type: "number",
            demandOption: true,
          });
        },
        (argv) => {
          const reviews = Review.list(argv.project);
          if (reviews.length === 0) {
            console.log("No reviews found.");
            return;
          }
          for (const r of reviews) {
            const date = new Date(r.createdAt).toISOString();
            const name = r.name ? ` (${r.name})` : "";
            console.log(`#${r.id} ${r.commit.slice(0, 7)}${name} - ${date}`);
          }
        },
      )
      .command(
        "create <project> <commit>",
        "Create a new review",
        (yargs) => {
          return yargs
            .positional("project", {
              describe: "Project ID",
              type: "number",
              demandOption: true,
            })
            .positional("commit", {
              describe: "Commit hash",
              type: "string",
              demandOption: true,
            })
            .option("name", {
              alias: "n",
              type: "string",
              describe: "Optional name for the review",
            });
        },
        (argv) => {
          const review = Review.create({
            projectId: argv.project,
            commit: argv.commit,
            name: argv.name,
          });
          console.log(`Created review #${review.id}`);
        },
      )
      .command(
        "get <id>",
        "Get a review by ID",
        (yargs) => {
          return yargs.positional("id", {
            describe: "Review ID",
            type: "number",
            demandOption: true,
          });
        },
        (argv) => {
          const review = Review.get(argv.id);
          if (!review) {
            console.error(`Review #${argv.id} not found.`);
            process.exit(1);
          }
          console.log(JSON.stringify(review, null, 2));
        },
      )
      .command(
        "latest <project>",
        "Get the latest review for a project",
        (yargs) => {
          return yargs.positional("project", {
            describe: "Project ID",
            type: "number",
            demandOption: true,
          });
        },
        (argv) => {
          const review = Review.latest(argv.project);
          if (!review) {
            console.error(`No reviews found for project #${argv.project}.`);
            process.exit(1);
          }
          console.log(JSON.stringify(review, null, 2));
        },
      )
      .command(
        "comments <review>",
        "List comments for a review",
        (yargs) => {
          return yargs.positional("review", {
            describe: "Review ID",
            type: "number",
            demandOption: true,
          });
        },
        (argv) => {
          const comments = ReviewComment.list(argv.review);
          if (comments.length === 0) {
            console.log("No comments found.");
            return;
          }
          for (const c of comments) {
            console.log(`#${c.id} -> note:${c.noteId}`);
          }
        },
      )
      .demandCommand(1, "You must specify a subcommand");
  })
  .command(
    "add <path>",
    "Add a note to the corpus",
    (yargs) => {
      return yargs
        .positional("path", {
          describe: "Path/name for the note",
          type: "string",
          demandOption: true,
        })
        .option("text", {
          alias: "t",
          type: "string",
          describe: "Note content",
          demandOption: true,
        })
        .option("project", {
          alias: "p",
          type: "string",
          describe: "Project name (defaults to 'default')",
        });
    },
    async (argv) => {
      const client = await Client.connect();

      const project = await client.project
        .get({ name: argv.project })
        .catch(() => {
          consola.error(`Failed to find project: ${pc.bgCyan(argv.project)}`);
          process.exit(1);
        })
        .then(Client.unwrap);

      const result = await client.note
        .add({
          path: argv.path,
          content: argv.text,
          project: project.id,
        })
        .catch((error: any) => {
          consola.error(`Failed to add note: ${error}`);
          process.exit(1);
        })
        .then(Client.unwrap);

      consola.success(
        `Added note ${pc.cyanBright(result.path)} (id: ${result.id}, project: ${result.project})`,
      );
    },
  )
  .command(
    "serve",
    "Start the spall server",
    (yargs) => {
      return yargs
        .option("daemon", {
          alias: "d",
          type: "boolean",
          default: false,
          describe: "Do not stop after last client disconnects",
        })
        .option("timeout", {
          alias: "t",
          type: "number",
          default: 1,
          describe: "Seconds to wait after last client disconnects",
        });
    },
    async (argv) => {
      const { Server } = await import("@spall/sdk/server");
      const { port, stopped } = await Server.start({
        persist: argv.daemon,
        idleTimeout: argv.timeout * 1000,
      });
      console.log(
        `${pc.gray("server")}  Listening on port ${pc.cyanBright(String(port))}`,
      );

      await stopped;
    },
  )
  .command(
    "get <path>",
    "Get the content of a note",
    (yargs) => {
      return yargs
        .positional("path", {
          describe: "Path to the note",
          type: "string",
          demandOption: true,
        })
        .option("project", {
          alias: "p",
          type: "string",
          describe: "Project name (defaults to 'default')",
          default: "default",
        });
    },
    async (argv) => {
      const client = await Client.connect();

      const project = await client.project
        .get({ name: argv.project })
        .then(Client.unwrap)
        .catch(() => {
          consola.error(`Project not found: ${pc.cyan(argv.project)}`);
          process.exit(1);
        });

      const note = await client.note
        .get({ id: String(project.id), path: argv.path })
        .then(Client.unwrap)
        .catch(() => {
          consola.error(`Note not found: ${pc.cyan(argv.path)}`);
          process.exit(1);
        });

      console.log(note.content);
    },
  )
  .command(
    "list [project]",
    "List notes in a project",
    (yargs) => {
      return yargs.positional("project", {
        describe: "Project name (defaults to 'default')",
        type: "string",
        default: "default",
      });
    },
    async (argv) => {
      const client = await Client.connect();

      const project = await client.project
        .get({ name: argv.project })
        .then(Client.unwrap)
        .catch(() => {
          consola.error(`Project not found: ${pc.cyan(argv.project)}`);
          process.exit(1);
        });

      const notes = await client.note
        .list({ id: String(project.id) })
        .then(Client.unwrap);

      if (notes.length === 0) {
        console.log(pc.dim("(no notes)"));
        return;
      }

      // Build tree
      type TreeNode = {
        name: string;
        isDir: boolean;
        children: Map<string, TreeNode>;
      };
      const root: TreeNode = { name: "", isDir: true, children: new Map() };

      for (const note of notes) {
        const parts = note.path.split("/");
        let current = root;
        for (let i = 0; i < parts.length; i++) {
          const part = parts[i]!;
          const isLast = i === parts.length - 1;
          if (!current.children.has(part)) {
            current.children.set(part, {
              name: part,
              isDir: !isLast,
              children: new Map(),
            });
          }
          current = current.children.get(part)!;
        }
      }

      // Print tree
      function printTree(node: TreeNode, indent: string = ""): void {
        const sorted = Array.from(node.children.entries()).sort((a, b) => {
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
  .command(
    "tui",
    "Launch the interactive TUI",
    () => {},
    async () => {
      // Load the Solid JSX transform plugin before importing TUI
      await import("@opentui/solid/preload");
      const { tui } = await import("./App");
      await tui({ repoPath: process.cwd() });
    },
  )
  .demandCommand(1, "You must specify a command")
  .strict()
  .help()
  .parse();
