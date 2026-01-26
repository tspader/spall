#!/usr/bin/env bun
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { existsSync, statSync } from "fs";

import pc from "picocolors";
import { Client } from "@spall/sdk/client";
import { Store, Review, ReviewComment } from "./lib/store";
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

  function hsv(h: number, s: number, v: number): (s: string) => string {
    const hNorm = h / 360;
    const sNorm = s / 100;
    const vNorm = v / 100;

    let r = vNorm,
      g = vNorm,
      b = vNorm;

    if (sNorm > 1e-6) {
      let h6 = hNorm * 6;
      if (h6 >= 6) h6 = 0;
      const sector = Math.floor(h6);
      const f = h6 - sector;

      const p = vNorm * (1 - sNorm);
      const q = vNorm * (1 - sNorm * f);
      const t = vNorm * (1 - sNorm * (1 - f));

      switch (sector) {
        case 0:
          r = vNorm;
          g = t;
          b = p;
          break;
        case 1:
          r = q;
          g = vNorm;
          b = p;
          break;
        case 2:
          r = p;
          g = vNorm;
          b = t;
          break;
        case 3:
          r = p;
          g = q;
          b = vNorm;
          break;
        case 4:
          r = t;
          g = p;
          b = vNorm;
          break;
        case 5:
          r = vNorm;
          g = p;          b = q;
          break;
      }
    }

    return rgb(Math.round(r * 255), Math.round(g * 255), Math.round(b * 255));
  }

  function dim(s: string): string {
    return `\x1b[2m${s}\x1b[22m`;
  }

  export const defaultTheme: Theme = {
    header: dim,
    command: hsv(153, 40, 63),
    arg: hsv(180, 45, 90),
    option: hsv(60, 45, 90),
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

  function usage(
    def: CommandDef | CliDef,
    commandPath: string[],
    theme: Theme,
  ): string {
    const parts: string[] = [];

    for (const part of commandPath) {
      parts.push(theme.command(part));
    }

    if ("positionals" in def && def.positionals) {
      for (const [posName, pos] of Object.entries(def.positionals)) {
        parts.push(pos.required ? `$${posName}` : `[$${posName}]`);
      }
    }

    if (def.options && Object.keys(def.options).length > 0) {
      parts.push(theme.dim("[options]"));
    }

    if (
      "commands" in def &&
      def.commands &&
      Object.keys(def.commands).length > 0
    ) {
      parts.push(theme.dim("$command"));
    }

    return parts.join(" ");
  }

  export function help(
    def: CommandDef | CliDef,
    name: string,
    commandPath: string[] = [],
    theme: Theme = defaultTheme,
  ): void {
    let hasPrevSection = false;

    if (def.description) {
      console.log(theme.description(def.description));
      hasPrevSection = true;
    }

    if (hasPrevSection) console.log("");
    const usageLine = usage(def, [name, ...commandPath], theme);
    console.log(`${theme.header("usage:")}`)
    console.log(`  ${usageLine}`);
    hasPrevSection = true;

    // Positionals section
    const positionals = "positionals" in def ? def.positionals : undefined;
    if (positionals && Object.keys(positionals).length > 0) {
      if (hasPrevSection) console.log("");
      console.log(theme.header("arguments"));
      hasPrevSection = true;

      const nameCol: string[] = [];
      const typeCol: string[] = [];
      const descCol: string[] = [];

      for (const [posName, pos] of Object.entries(positionals)) {
        nameCol.push(`  ${posName}`);
        typeCol.push(pos.type);
        let desc = pos.description;
        if (pos.default !== undefined) {
          desc += ` ${theme.dim(`(default: ${pos.default})`)}`;
        }
        if (pos.required) {
          desc += ` ${theme.dim("(required)")}`;
        }
        descCol.push(desc);
      }

      const nameWidth = Math.max(...nameCol.map((s) => s.length));
      const typeWidth = Math.max(...typeCol.map((s) => s.length));

      for (let i = 0; i < nameCol.length; i++) {
        console.log(
          [
            theme.arg(nameCol[i]!.padEnd(nameWidth)),
            theme.type(typeCol[i]!.padEnd(typeWidth)),
            theme.description(descCol[i]!),
          ].join(" "),
        );
      }
    }

    const opts = def.options ?? {};
    const helpOpt: OptionDef = {
      alias: "h",
      type: "boolean",
      description: "Show help",
    };
    const allOpts: Record<string, OptionDef> = { help: helpOpt, ...opts };

    if (Object.keys(allOpts).length > 0) {
      if (hasPrevSection) console.log("");
      console.log(theme.header("options"));
      hasPrevSection = true;

      const optCol: string[] = [];
      const typeCol: string[] = [];
      const descCol: string[] = [];

      for (const [optName, opt] of Object.entries(allOpts)) {
        const short = opt.alias ? `-${opt.alias} ` : "   ";
        const long = `--${optName}`;
        optCol.push(`  ${short}${long}`);
        typeCol.push(opt.type);

        let desc = opt.description;
        if (opt.default !== undefined && opt.type !== "boolean") {
          desc += ` ${theme.dim(`(default: ${opt.default})`)}`;
        }
        descCol.push(desc);
      }

      const optWidth = Math.max(...optCol.map((s) => s.length));
      const typeWidth = Math.max(...typeCol.map((s) => s.length));

      for (let i = 0; i < optCol.length; i++) {
        console.log(
          [
            theme.option(optCol[i]!.padEnd(optWidth)),
            theme.type(typeCol[i]!.padEnd(typeWidth)),
            theme.description(descCol[i]!),
          ].join(" "),
        );
      }
    }

    // Commands section
    const commands = "commands" in def ? def.commands : undefined;
    if (commands && Object.keys(commands).length > 0) {
      if (hasPrevSection) console.log("");
      console.log(theme.header("commands"));

      const nameCol: string[] = [];
      const argsCol: string[] = [];
      const descCol: string[] = [];

      for (const [cmdName, cmd] of Object.entries(commands)) {
        nameCol.push(`  ${cmdName}`);
        const args = cmd.positionals
          ? Object.keys(cmd.positionals).join(" ")
          : "";
        argsCol.push(args);
        descCol.push(cmd.description);
      }

      const nameWidth = Math.max(...nameCol.map((s) => s.length));
      const argsWidth = Math.max(...argsCol.map((s) => s.length), 0);

      for (let i = 0; i < nameCol.length; i++) {
        const parts = [theme.command(nameCol[i]!.padEnd(nameWidth))];
        if (argsWidth > 0) {
          parts.push(theme.arg(argsCol[i]!.padEnd(argsWidth)));
        }
        parts.push(theme.description(descCol[i]!));
        console.log(parts.join(" "));
      }
    }
  }

  function fail(
    def: CommandDef | CliDef,
    name: string,
    commandPath: string[] = [],
  ) {
    return (msg: string | null, _err: Error | undefined, _usage: any): void => {
      // Show help for --help flag
      if (process.argv.includes("--help") || process.argv.includes("-h")) {
        help(def, name, commandPath);
        process.exit(0);
      }
      // Show help for missing command/arguments
      if (
        msg?.includes("You must specify") ||
        msg?.includes("Not enough non-option arguments")
      ) {
        help(def, name, commandPath);
        process.exit(1);
      }
      console.error(pc.red(msg ?? "Unknown error"));
      process.exit(1);
    };
  }

  function check(
    def: CommandDef | CliDef,
    name: string,
    commandPath: string[] = [],
  ) {
    return (argv: any): boolean => {
      if (argv.help) {
        // Only show help if we're at the right command depth
        // argv._ contains the parsed command path
        const argvDepth = argv._.length;
        const expectedDepth = commandPath.length;
        if (argvDepth === expectedDepth) {
          help(def, name, commandPath);
          process.exit(0);
        }
      }
      return true;
    };
  }

  function configure(
    y: any,
    def: CommandDef | CliDef,
    rootName: string,
    path: string[],
  ): void {
    if ("positionals" in def && def.positionals) {
      for (const [name, pos] of Object.entries(def.positionals)) {
        y.positional(name, {
          type: pos.type,
          describe: pos.description,
          demandOption: pos.required,
          default: pos.default,
        });
      }
    }

    if (def.options) {
      for (const [name, opt] of Object.entries(def.options)) {
        y.option(name, {
          alias: opt.alias,
          type: opt.type,
          describe: opt.description,
          demandOption: opt.required,
          default: opt.default,
        });
      }
    }

    if ("commands" in def && def.commands) {
      for (const [name, sub] of Object.entries(def.commands)) {
        command(y, name, sub, rootName, path);
      }
      y.demandCommand(1, "You must specify a command");
    }

    y.help(false)
      .option("help", { alias: "h", type: "boolean", describe: "Show help" })
      .check(check(def, rootName, path))
      .fail(fail(def, rootName, path));
  }

  function command(
    y: any,
    name: string,
    def: CommandDef,
    rootName: string,
    path: string[],
  ): void {
    const fullPath = [...path, name];

    let cmdStr = name;
    if (def.positionals) {
      for (const [posName, pos] of Object.entries(def.positionals)) {
        cmdStr += pos.required ? ` <${posName}>` : ` [${posName}]`;
      }
    }

    y.command(
      cmdStr,
      def.description,
      (yargs: any) => configure(yargs, def, rootName, fullPath),
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
          description: "List reviews for a project",
          positionals: {
            project: {
              type: "number",
              description: "Project ID",
              required: true,
            },
          },
          handler: (argv) => {
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
        },
        create: {
          description: "Create a new review",
          positionals: {
            project: {
              type: "number",
              description: "Project ID",
              required: true,
            },
            commit: {
              type: "string",
              description: "Commit hash",
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
              projectId: argv.project,
              commit: argv.commit,
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
          description: "Get the latest review for a project",
          positionals: {
            project: {
              type: "number",
              description: "Project ID",
              required: true,
            },
          },
          handler: (argv) => {
            const review = Review.latest(argv.project);
            if (!review) {
              console.error(`No reviews found for project #${argv.project}.`);
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

        const { stream } = await client.note.add({
          path: argv.path,
          content: argv.text,
          project: project.id,
        });

        const result = await Client.until(stream, "note.created", (event) => {
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
        });

        consola.success(
          `Added note ${pc.cyanBright(result.info.path)} (id: ${result.info.id}, project: ${result.info.project})`,
        );
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
        Store.init();

        await import("@opentui/solid/preload");
        const { tui } = await import("./App");
        await tui({ repoPath: process.cwd() });
      },
    },
  },
};

Cli.build(cliDef).parse();
