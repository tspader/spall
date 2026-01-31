import consola from "consola";
import { Client } from "@spall/sdk/client";
import { ProjectConfig } from "@spall/core";
import {
  table,
  type CommandDef,
  defaultTheme as theme,
  cleanEscapes,
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

    const rowBudget = showAll
      ? Infinity
      : output === "table" || output === "list"
        ? Math.max(1, (process.stdout.rows ?? 24) - 3)
        : Infinity;

    const limit = Math.min(argv.max ?? Infinity, rowBudget);

    while (notes.length < limit) {
      const page: Page = await client.query
        .notes({
          id: String(query.id),
          path: argv.path,
          limit: Math.min(100, limit - notes.length),
          after: cursor,
        })
        .then(Client.unwrap);

      notes.push(...page.notes);

      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }

    if (notes.length === 0) {
      console.log(theme.dim("(no notes matching pattern)"));
      return;
    }

    switch (output) {
      case "json":
        console.log(JSON.stringify(notes, null, 2));
        break;
      case "tree": {
        type TreeNode = {
          name: string;
          isDir: boolean;
          children: Map<string, TreeNode>;
          notes: NoteInfo[]; // For leaf nodes, store the actual notes
        };
        const root: TreeNode = {
          name: "",
          isDir: true,
          children: new Map(),
          notes: [],
        };

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
                notes: [],
              });
            }
            current = current.children.get(part)!;
            if (isLast) {
              current.notes.push(note);
            }
          }
        }

        const MAX_NOTES_PER_LEAF = 3;

        function printTree(node: TreeNode, indent: string = ""): void {
          const sorted = Array.from(node.children.entries()).sort((a, b) => {
            if (a[1].isDir !== b[1].isDir) return a[1].isDir ? -1 : 1;
            return a[0].localeCompare(b[0]);
          });

          for (const [name, child] of sorted) {
            if (child.isDir) {
              console.log(`${theme.dim(indent)}${theme.dim(name + "/")}`);
              printTree(child, indent + " ");
            } else {
              // This is a leaf node (file), display notes at this path
              const notesToShow = showAll
                ? child.notes
                : child.notes.slice(0, MAX_NOTES_PER_LEAF);

              for (let i = 0; i < notesToShow.length; i++) {
                const note = notesToShow[i]!;

                if (notesToShow.length > 1 || child.notes.length > 1) {
                  // Multiple notes at this path, show index
                  const index = theme.dim(`[${i + 1}/${child.notes.length}] `);
                  const prefix = indent + index + name;
                  console.log(theme.dim(prefix));
                } else {
                  console.log(`${theme.dim(indent)}${name}`);
                }

                // Print truncated content preview
                const contentIndent = indent + "  ";
                const content = cleanEscapes(note.content);
                console.log(`${theme.dim(contentIndent)}${theme.dim(content)}`);
              }

              // Show ellipsis if there are more notes
              if (!showAll && child.notes.length > MAX_NOTES_PER_LEAF) {
                const remaining = child.notes.length - MAX_NOTES_PER_LEAF;
                console.log(
                  `${theme.dim(indent)}  ${theme.dim(`( ... ${remaining} more note${remaining > 1 ? "s" : ""} )`)}`,
                );
              }
            }
          }
        }

        printTree(root);
        break;
      }
      case "table": {
        const maxRows = showAll
          ? notes.length
          : Math.max(1, (process.stdout.rows ?? 24) - 3);

        table(
          ["path", "id", "content"],
          [
            notes.map((n) => n.path),
            notes.map((n) => String(n.id)),
            notes.map((n) => n.content),
          ],
          {
            // id stays intact; content gets guaranteed room; path truncates from the start.
            flex: [1, 0, 2],
            noTruncate: [false, true, false],
            min: [0, 0, 3],
            truncate: ["start", "end", "middle"],
            format: [
              (s) => {
                const bodyLen = s.trimEnd().length;
                const body = s.slice(0, bodyLen);
                const pad = s.slice(bodyLen);

                const slash = body.lastIndexOf("/");
                if (slash === -1) return theme.primary(body) + pad;

                const prefix = body.slice(0, slash + 1);
                const name = body.slice(slash + 1);
                return theme.dim(prefix) + theme.primary(name) + pad;
              },
              (s) => theme.code(s),
            ],
            maxRows,
          },
        );
        break;
      }
      default: {
        const maxNotes = showAll
          ? notes.length
          : Math.max(1, (process.stdout.rows ?? 24) - 3);

        for (let i = 0; i < Math.min(notes.length, maxNotes); i++) {
          const note = notes[i]!;
          if (notes.length > 1) {
            console.log(theme.command(note.path));
          }
          console.log(note.content);
          if (i < Math.min(notes.length, maxNotes) - 1) console.log("");
        }

        if (notes.length > maxNotes && !showAll) {
          const remaining = notes.length - maxNotes;
          console.log(
            theme.dim(
              `( ... ${remaining} more note${remaining > 1 ? "s" : ""} )`,
            ),
          );
        }
        break;
      }
    }
  },
};
