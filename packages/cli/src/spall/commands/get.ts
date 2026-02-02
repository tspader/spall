import consola from "consola";
import { Client } from "@spall/sdk/client";
import { ProjectConfig } from "@spall/core";
import {
  type CommandDef,
  defaultTheme as theme,
  displayResults,
} from "@spall/cli/shared";

export const get: CommandDef = {
  description: "Get note(s) by path or glob",
  positionals: {
    path: {
      type: "string",
      description: "Path or glob to notes",
      default: "*",
    },
  },
  options: {
    project: {
      alias: "p",
      type: "string",
      description: "Project name",
    },
    max: {
      alias: "n",
      type: "number",
      description: "Maximum number of notes to return",
    },
    output: {
      alias: "o",
      type: "string",
      description: "Output format: list, tree, table, json",
    },
    all: {
      alias: "a",
      type: "boolean",
      description: "Print all results without limiting output",
    },
  },
  handler: async (argv) => {
    const client = await Client.connect();

    // resolve project names to IDs
    const projectNames: string[] = argv.project
      ? [argv.project]
      : ProjectConfig.load(process.cwd()).projects;

    const projects = await client.project.list().then(Client.unwrap);
    const byName = new Map(projects.map((p) => [p.name, p.id]));

    const projectIds = projectNames.map((name) => {
      const id = byName.get(name);
      if (id === undefined) {
        consola.error(`Project not found: ${theme.command(name)}`);
        process.exit(1);
      }
      return id;
    });

    const output = argv.output ?? (argv.path === "*" ? "tree" : "list");

    const showAll = argv.all === true;

    // create query
    const query = await client.query
      .create({ projects: projectIds })
      .then(Client.unwrap);

    type NoteInfo = {
      id: number;
      project: number;
      path: string;
      content: string;
      contentHash: string;
    };
    type Page = { notes: NoteInfo[]; nextCursor: string | null };
    const notes: NoteInfo[] = [];
    let cursor: string | undefined = undefined;

    // Limit fetching to roughly what we'd display, to avoid over-fetching.
    const termRows = process.stdout.rows ?? 24;
    const displayRows = showAll ? Infinity : Math.max(1, termRows - 4);
    const fetchLimit = Math.min(argv.max ?? Infinity, displayRows + 1);

    while (notes.length < fetchLimit) {
      const page: Page = await client.query
        .notes({
          id: String(query.id),
          path: argv.path,
          limit: Math.min(100, fetchLimit - notes.length),
          after: cursor,
        })
        .then(Client.unwrap);

      notes.push(...page.notes);

      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }

    displayResults(notes, {
      output,
      showAll,
      empty: "(no notes matching pattern)",
      path: (n) => n.path,
      id: (n) => String(n.id),
      preview: (n) => n.content,
    });
  },
};
