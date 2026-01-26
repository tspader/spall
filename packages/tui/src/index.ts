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

  export type Theme = {
    header: (s: string) => string;
    command: (s: string) => string;
    arg: (s: string) => string;
    option: (s: string) => string;
    type: (s: string) => string;
    description: (s: string) => string;
    dim: (s: string) => string;
  };

  // Generate truecolor ANSI escape for RGB
  function rgb(r: number, g: number, b: number): (s: string) => string {
    return (s: string) => `\x1b[38;2;${r};${g};${b}m${s}\x1b[39m`;
  }

  // Convert HSV to RGB (h: 0-360, s: 0-100, v: 0-100)
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
          g = p;
          b = q;
          break;
      }
    }

    return rgb(Math.round(r * 255), Math.round(g * 255), Math.round(b * 255));
  }

  // Theme matching TUI colors with desaturated palette
  export const defaultTheme: Theme = {
    header: pc.dim,
    command: hsv(153, 40, 63), // desaturated zomp/teal
    arg: hsv(20, 45, 90), // desaturated orange
    option: hsv(60, 45, 90), // desaturated yellow
    type: pc.dim,
    description: hsv(0, 0, 75), // light gray
    dim: pc.dim,
  };

  // Simple ANSI theme for terminals without truecolor
  export const systemTheme: Theme = {
    header: pc.dim,
    command: pc.cyan,
    arg: pc.yellow,
    option: pc.yellow,
    type: pc.dim,
    description: (s) => s,
    dim: pc.dim,
  };

  type OptionInfo = {
    name: string;
    alias?: string;
    type: string;
    description: string;
    required?: boolean;
    default?: unknown;
  };

  type CommandInfo = {
    name: string;
    args: string[];
    description: string;
  };

  // Store yargs instance reference for help output
  let yargsInstance: any = null;

  export function setYargs(y: any): void {
    yargsInstance = y;
  }

  // Check handler for --help/-h interception (use with .check())
  export function helpCheck(argv: any): boolean {
    if (argv.help) {
      const usage = (yargsInstance as any)
        .getInternalMethods()
        .getUsageInstance();
      printHelp(usage);
      process.exit(0);
    }
    return true;
  }

  // Fail handler for missing commands and help fallback
  export function fail(
    msg: string | null,
    _err: Error | undefined,
    usage: any,
  ): void {
    if (process.argv.includes("--help") || process.argv.includes("-h")) {
      printHelp(usage);
      process.exit(0);
    }
    if (msg?.includes("You must specify")) {
      printHelp(usage);
      process.exit(0);
    }
    console.error(pc.red(msg ?? "Unknown error"));
    process.exit(1);
  }

  export function printHelp(usage: any, theme: Theme = defaultTheme): void {
    const descriptions = usage.getDescriptions();
    const commands: [string, string, boolean, string[], boolean][] =
      usage.getCommands();

    // Get description from usage if set
    const usages = usage.getUsage();
    const desc = usages.length > 0 ? usages[0][1] : "";

    // Track if we've printed anything (for spacing between sections)
    let hasPrevSection = false;

    if (desc) {
      console.log(theme.description(desc));
      hasPrevSection = true;
    }

    // Get options from yargs instance if available
    const options = yargsInstance?.getOptions() ?? {
      alias: {},
      string: [],
      number: [],
      boolean: [],
      array: [],
      count: [],
      default: {},
    };
    const demandedOptions = yargsInstance?.getDemandedOptions() ?? {};

    // Collect options
    const opts: OptionInfo[] = [];
    const seen = new Set<string>();

    // Add explicitly defined options
    for (const key of Object.keys(descriptions)) {
      if (seen.has(key) || key === "$0") continue;
      seen.add(key);

      const aliases = options.alias[key] || [];
      for (const a of aliases) seen.add(a);

      // Find short alias (single char)
      const shortAlias = aliases.find((a: string) => a.length === 1);

      let type = "boolean";
      if (options.string.includes(key)) type = "string";
      else if (options.number.includes(key)) type = "number";
      else if (options.array.includes(key)) type = "array";
      else if (options.count.includes(key)) type = "count";

      // Strip yargs i18n prefix
      let description = descriptions[key] || "";
      if (description.startsWith("__yargsString__:")) {
        description = description.slice("__yargsString__:".length);
      }

      opts.push({
        name: key,
        alias: shortAlias,
        type,
        description,
        required: demandedOptions[key] !== undefined,
        default: options.default[key],
      });
    }

    // Collect commands
    const cmds: CommandInfo[] = [];
    for (const [cmd, cmdDesc] of commands) {
      // Parse command string like "create [name]" or "add <path>"
      const parts = cmd.split(/\s+/);
      const name = (parts[0] ?? "").replace(/^\$0\s*/, "");
      const args = parts.slice(1).map((p) => {
        // Strip < > [ ] and keep the name
        return p.replace(/^[<\[]/, "").replace(/[>\]]$/, "");
      });
      cmds.push({ name, args, description: cmdDesc });
    }

    // Print options section
    if (opts.length > 0) {
      if (hasPrevSection) console.log();
      console.log(theme.header("options"));
      hasPrevSection = true;

      // Calculate column widths
      const optCol: string[] = [];
      const typeCol: string[] = [];
      const descCol: string[] = [];

      for (const opt of opts) {
        const short = opt.alias ? `-${opt.alias} ` : "   ";
        const long = `--${opt.name}`;
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

      for (let i = 0; i < opts.length; i++) {
        const line = [
          theme.option(optCol[i]!.padEnd(optWidth)),
          theme.type(typeCol[i]!.padEnd(typeWidth)),
          theme.description(descCol[i]!),
        ].join(" ");
        console.log(line);
      }
    }

    // Print commands section
    if (cmds.length > 0) {
      if (hasPrevSection) console.log();
      console.log(theme.header("commands"));

      const nameCol: string[] = [];
      const argsCol: string[] = [];
      const descCol: string[] = [];

      for (const cmd of cmds) {
        nameCol.push(`  ${cmd.name}`);
        argsCol.push(cmd.args.join(" "));
        descCol.push(cmd.description);
      }

      const nameWidth = Math.max(...nameCol.map((s) => s.length));
      const argsWidth = Math.max(...argsCol.map((s) => s.length), 0);

      for (let i = 0; i < cmds.length; i++) {
        const parts = [theme.command(nameCol[i]!.padEnd(nameWidth))];
        if (argsWidth > 0) {
          parts.push(theme.arg(argsCol[i]!.padEnd(argsWidth)));
        }
        parts.push(theme.description(descCol[i]!));
        console.log(parts.join(" "));
      }
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

const cli = yargs(hideBin(process.argv));
Cli.setYargs(cli);

cli
  .scriptName("spall")
  .command("project", "Manage projects", (yargs) => {
    Cli.setYargs(yargs);
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
      .demandCommand(1, "You must specify a subcommand")
      .fail(Cli.fail);
  })
  .command("review", "Manage reviews", (yargs) => {
    Cli.setYargs(yargs);
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
      .demandCommand(1, "You must specify a subcommand")
      .fail(Cli.fail);
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
            consola.info(`Downloading model ${pc.cyanBright(event.info.name)}`);
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
        })
        .option("force", {
          alias: "f",
          type: "boolean",
          default: false,
          describe: "Kill existing server if running",
        });
    },
    async (argv) => {
      const { Server } = await import("@spall/sdk/server");
      const { port, stopped } = await Server.start({
        persist: argv.daemon,
        idleTimeout: argv.timeout * 1000,
        force: argv.force,
      });

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
  .help(false)
  .option("help", {
    alias: "h",
    type: "boolean",
    describe: "Show help",
    global: true,
  })
  .check(Cli.helpCheck)
  .fail(Cli.fail)
  .parse();
