import consola from "consola";
import { Client } from "@spall/sdk/client";
import { ProjectConfig } from "@spall/core";
import { table, type CommandDef, defaultTheme as theme } from "@spall/cli/shared";

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
      description: "Project name(s), comma-separated",
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
    const limit = argv.max ?? Infinity;

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

    const output = argv.output ?? (argv.path === "*" ? "tree" : "list");
    switch (output) {
      case "json":
        console.log(JSON.stringify(notes, null, 2));
        break;
      case "tree": {
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
              console.log(`${theme.dim(indent)}${name}`);
            }
          }
        }

        printTree(root);
        break;
      }
      case "table": {
        const oneLine = (s: string) => s.replace(/\n/g, " ");
        table(
          ["path", "id", "content"],
          [
            notes.map((n) => n.path),
            notes.map((n) => String(n.id)),
            notes.map((n) => oneLine(n.content)),
          ],
          { flex: [1, 0, 2] },
        );
        break;
      }
      default:
        for (let i = 0; i < notes.length; i++) {
          const note = notes[i]!;
          if (notes.length > 1) {
            console.log(theme.command(note.path));
          }
          console.log(note.content);
          if (i < notes.length - 1) console.log("");
        }
    }
  },
};
