#!/usr/bin/env bun
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { existsSync, statSync } from "fs";

import pc from "picocolors";
import { Client } from "@spall/sdk/client";
import { db, Repo, Review, Patch, ReviewComment } from "./store";
import consola from "consola";

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

  export type Theme = {
    header: (s: string) => string;
    command: (s: string) => string;
    arg: (s: string) => string;
    option: (s: string) => string;
    type: (s: string) => string;
    description: (s: string) => string;
    dim: (s: string) => string;
  };

  function rgb(r: number, g: number, b: number): (s: string) => string {
    return (s: string) => `\x1b[38;2;${r};${g};${b}m${s}\x1b[39m`;
  }

  function dim(s: string): string {
    return `\x1b[2m${s}\x1b[22m`;
  }

  export const defaultTheme: Theme = {
    header: dim,
    command: rgb(96, 161, 127),
    arg: rgb(126, 230, 230),
    option: rgb(230, 230, 126),
    type: dim,
    description: (s) => s,
    dim,
  };

  export type OptionDef = {
    alias?: string;
    type: "string" | "number" | "boolean" | "array";
    description: string;
    required?: boolean;
    default?: unknown;
  };

  export type PositionalDef = {
    type: "string" | "number";
    description: string;
    required?: boolean;
    default?: unknown;
  };

  export type CommandDef = {
    description: string;
    positionals?: Record<string, PositionalDef>;
    options?: Record<string, OptionDef>;
    commands?: Record<string, CommandDef>;
    handler?: (argv: any) => void | Promise<void>;
  };

  export type CliDef = {
    name: string;
    description: string;
    options?: Record<string, OptionDef>;
    commands: Record<string, CommandDef>;
  };

  function cols(rows: string[][], colorFns?: ((s: string) => string)[]): void {
    if (rows.length === 0) return;
    const widths = rows[0]!.map((_, i) =>
      Math.max(...rows.map((r) => r[i]!.length)),
    );
    for (const row of rows) {
      const line = row.map((c, i) => {
        const padded = c.padEnd(widths[i]!);
        return colorFns?.[i] ? colorFns[i]!(padded) : padded;
      });
      console.log(line.join(" "));
    }
  }

  function usage(def: CommandDef | CliDef, path: string[], t: Theme): string {
    const parts: string[] = [];
    const last = path.length - 1;
    for (let i = 0; i < path.length; i++) {
      parts.push(i === last ? t.command(path[i]!) : path[i]!);
    }

    if ("positionals" in def && def.positionals) {
      for (const [k, v] of Object.entries(def.positionals)) {
        const name = t.arg(`$${k}`);
        parts.push(v.required ? name : `[${name}]`);
      }
    }

    if (def.options && Object.keys(def.options).length > 0) {
      parts.push(t.dim("[options]"));
    }

    if (
      "commands" in def &&
      def.commands &&
      Object.keys(def.commands).length > 0
    ) {
      parts.push(t.dim("$command"));
    }

    return parts.join(" ");
  }

  export function help(
    def: CommandDef | CliDef,
    name: string,
    path: string[] = [],
    t: Theme = defaultTheme,
  ): void {
    let prev = false;

    if (def.description) {
      console.log(t.description(def.description));
      prev = true;
    }

    if (prev) console.log("");
    console.log(t.header("usage:"));
    console.log(`  ${usage(def, [name, ...path], t)}`);
    prev = true;

    const pos = "positionals" in def ? def.positionals : undefined;
    if (pos && Object.keys(pos).length > 0) {
      if (prev) console.log("");
      console.log(t.header("arguments"));
      prev = true;

      const rows: string[][] = [];
      for (const [k, v] of Object.entries(pos)) {
        let desc = v.description;
        if (v.default !== undefined)
          desc += ` ${t.dim(`(default: ${v.default})`)}`;
        if (v.required) desc += ` ${t.dim("(required)")}`;
        rows.push([`  ${k}`, v.type, desc]);
      }
      cols(rows, [t.arg, t.type, t.description]);
    }

    const opts: Record<string, OptionDef> = {
      help: { alias: "h", type: "boolean", description: "Show help" },
      ...(def.options ?? {}),
    };

    if (Object.keys(opts).length > 0) {
      if (prev) console.log("");
      console.log(t.header("options"));
      prev = true;

      const rows: string[][] = [];
      for (const [k, v] of Object.entries(opts)) {
        const short = v.alias ? `-${v.alias} ` : "   ";
        let desc = v.description;
        if (v.default !== undefined && v.type !== "boolean") {
          desc += ` ${t.dim(`(default: ${v.default})`)}`;
        }
        rows.push([`  ${short}--${k}`, v.type, desc]);
      }
      cols(rows, [t.option, t.type, t.description]);
    }

    const cmds = "commands" in def ? def.commands : undefined;
    if (cmds && Object.keys(cmds).length > 0) {
      if (prev) console.log("");
      console.log(t.header("commands"));

      const rows: string[][] = [];
      for (const [k, v] of Object.entries(cmds)) {
        const args = v.positionals ? Object.keys(v.positionals).join(" ") : "";
        rows.push([`  ${k}`, args, v.description]);
      }
      cols(rows, [t.command, t.arg, t.description]);
    }
  }

  function fail(def: CommandDef | CliDef, name: string, path: string[] = []) {
    return (msg: string | null): void => {
      if (process.argv.includes("--help") || process.argv.includes("-h")) {
        help(def, name, path);
        process.exit(0);
      }
      if (
        msg?.includes("You must specify") ||
        msg?.includes("Not enough non-option arguments")
      ) {
        help(def, name, path);
        process.exit(1);
      }
      console.error(pc.red(msg ?? "Unknown error"));
      process.exit(1);
    };
  }

  function check(def: CommandDef | CliDef, name: string, path: string[] = []) {
    return (argv: any): boolean => {
      if (argv.help && argv._.length === path.length) {
        help(def, name, path);
        process.exit(0);
      }
      return true;
    };
  }

  function configure(
    y: any,
    def: CommandDef | CliDef,
    root: string,
    path: string[],
  ): void {
    if ("positionals" in def && def.positionals) {
      for (const [k, v] of Object.entries(def.positionals)) {
        y.positional(k, {
          type: v.type,
          describe: v.description,
          demandOption: v.required,
          default: v.default,
        });
      }
    }

    if (def.options) {
      for (const [k, v] of Object.entries(def.options)) {
        y.option(k, {
          alias: v.alias,
          type: v.type,
          describe: v.description,
          demandOption: v.required,
          default: v.default,
        });
      }
    }

    if ("commands" in def && def.commands) {
      for (const [k, v] of Object.entries(def.commands)) {
        command(y, k, v, root, path);
      }
      y.demandCommand(1, "You must specify a command");
    }

    y.help(false)
      .option("help", { alias: "h", type: "boolean", describe: "Show help" })
      .check(check(def, root, path))
      .fail(fail(def, root, path));
  }

  function command(
    y: any,
    name: string,
    def: CommandDef,
    root: string,
    path: string[],
  ): void {
    let cmd = name;
    if (def.positionals) {
      for (const [k, v] of Object.entries(def.positionals)) {
        cmd += v.required ? ` <${k}>` : ` [${k}]`;
      }
    }
    y.command(
      cmd,
      def.description,
      (yargs: any) => configure(yargs, def, root, [...path, name]),
      def.handler,
    );
  }

  export function build(def: CliDef): any {
    const y = yargs(hideBin(process.argv)).scriptName(def.name);
    configure(y, def, def.name, []);
    y.strict();
    return y;
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

// CLI definition - single source of truth
const cliDef: Cli.CliDef = {
  name: "spall",
  description: "Local semantic note store with embeddings",
  commands: {
    project: {
      description: "Manage projects",
      commands: {
        create: {
          description: "Create a new project",
          positionals: {
            name: {
              type: "string",
              description: "Project name (defaults to directory name)",
            },
          },
          options: {
            dir: {
              alias: "d",
              type: "string",
              description: "Project directory",
              default: process.cwd(),
            },
          },
          handler: async (argv) => {
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
                  process.stdout.write(`\r${Cli.CLEAR}`);
                  consola.success(
                    `Loaded ${pc.cyanBright(event.info.name)}${sizeStr}`,
                  );
                  break;
                }
                case "model.load":
                  consola.info(
                    `Model ready: ${pc.cyanBright(event.info.name)}`,
                  );
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
        },
        list: {
          description: "List all projects",
          handler: async () => {
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
        },
      },
    },
    review: {
      description: "Manage reviews",
      commands: {
        list: {
          description: "List reviews for a repo",
          positionals: {
            repo: {
              type: "number",
              description: "Repo ID",
              required: true,
            },
          },
          handler: (argv) => {
            const reviews = Review.list(argv.repo);
            if (reviews.length === 0) {
              console.log("No reviews found.");
              return;
            }
            for (const r of reviews) {
              const date = new Date(r.createdAt).toISOString();
              const name = r.name ? ` (${r.name})` : "";
              console.log(
                `#${r.id} ${r.commitSha.slice(0, 7)}${name} - ${date}`,
              );
            }
          },
        },
        create: {
          description: "Create a new review",
          positionals: {
            repo: {
              type: "number",
              description: "Repo ID",
              required: true,
            },
            commit: {
              type: "string",
              description: "Commit SHA",
              required: true,
            },
          },
          options: {
            name: {
              alias: "n",
              type: "string",
              description: "Optional name for the review",
            },
          },
          handler: (argv) => {
            const review = Review.create({
              repo: argv.repo,
              commitSha: argv.commit,
              name: argv.name,
            });
            console.log(`Created review #${review.id}`);
          },
        },
        get: {
          description: "Get a review by ID",
          positionals: {
            id: { type: "number", description: "Review ID", required: true },
          },
          handler: (argv) => {
            const review = Review.get(argv.id);
            if (!review) {
              console.error(`Review #${argv.id} not found.`);
              process.exit(1);
            }
            console.log(JSON.stringify(review, null, 2));
          },
        },
        latest: {
          description: "Get the latest review for a repo",
          positionals: {
            repo: {
              type: "number",
              description: "Repo ID",
              required: true,
            },
          },
          handler: (argv) => {
            const review = Review.latest(argv.repo);
            if (!review) {
              console.error(`No reviews found for repo #${argv.repo}.`);
              process.exit(1);
            }
            console.log(JSON.stringify(review, null, 2));
          },
        },
        comments: {
          description: "List comments for a review",
          positionals: {
            review: {
              type: "number",
              description: "Review ID",
              required: true,
            },
          },
          handler: (argv) => {
            const comments = ReviewComment.list(argv.review);
            if (comments.length === 0) {
              console.log("No comments found.");
              return;
            }
            for (const c of comments) {
              console.log(`#${c.id} -> note:${c.noteId}`);
            }
          },
        },
      },
    },
    add: {
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

        // Check if note already exists
        const existing = await client.note
          .get({ id: project.id.toString(), path: argv.path })
          .then(Client.unwrap)
          .catch(() => null);

        if (existing && !argv.update) {
          consola.error(
            `Note already exists: ${pc.cyanBright(argv.path)}. Use --update to update it.`,
          );
          process.exit(1);
        }

        const handleProgress = (event: any) => {
          switch (event.tag) {
            case "model.load":
              consola.info(`Loading model ${pc.cyanBright(event.info.name)}`);
              break;
            case "model.download":
              consola.info(
                `Downloading model ${pc.cyanBright(event.info.name)}`,
              );
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
            case "model.downloaded":
              process.stdout.write(`\r${Cli.CLEAR}`);
              consola.success(`Downloaded ${pc.cyanBright(event.info.name)}`);
              break;
          }
        };

        if (existing) {
          // Update existing note
          const { stream } = await client.note.update({
            id: existing.id.toString(),
            content: argv.text,
          });

          const result = await Client.until(
            stream,
            "note.updated",
            handleProgress,
          );

          consola.success(
            `Updated note ${pc.cyanBright(result.info.path)} (id: ${result.info.id}, project: ${result.info.project})`,
          );
        } else {
          // Create new note
          const { stream } = await client.note.add({
            path: argv.path,
            content: argv.text,
            project: project.id,
          });

          const result = await Client.until(
            stream,
            "note.created",
            handleProgress,
          );

          consola.success(
            `Added note ${pc.cyanBright(result.info.path)} (id: ${result.info.id}, project: ${result.info.project})`,
          );
        }
      },
    },
    serve: {
      description: "Start the spall server",
      options: {
        daemon: {
          alias: "d",
          type: "boolean",
          description: "Do not stop after last client disconnects",
        },
        timeout: {
          alias: "t",
          type: "number",
          description: "Seconds to wait after last client disconnects",
          default: 1,
        },
        force: {
          alias: "f",
          type: "boolean",
          description: "Kill existing server if running",
        },
      },
      handler: async (argv) => {
        const { Server } = await import("@spall/sdk/server");
        const { port, stopped } = await Server.start({
          persist: argv.daemon,
          idleTimeout: argv.timeout * 1000,
          force: argv.force,
        });

        await stopped;
      },
    },
    get: {
      description: "Get the content of a note",
      positionals: {
        path: {
          type: "string",
          description: "Path to the note",
          required: true,
        },
      },
      options: {
        project: {
          alias: "p",
          type: "string",
          description: "Project name",
          default: "default",
        },
      },
      handler: async (argv) => {
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
    },
    list: {
      description: "List notes in a project",
      positionals: {
        project: {
          type: "string",
          description: "Project name",
          default: "default",
        },
      },
      handler: async (argv) => {
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
    },
    tui: {
      description: "Launch the interactive TUI",
      handler: async () => {
        db.init();

        await import("@opentui/solid/preload");
        const { tui } = await import("./App");
        await tui({ repoPath: process.cwd() });
      },
    },
  },
};

Cli.build(cliDef).parse();
