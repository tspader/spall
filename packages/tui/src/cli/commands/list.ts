import pc from "picocolors";
import consola from "consola";
import { Client } from "@spall/sdk/client";
import type { CommandDef } from "../yargs";

export const list: CommandDef = {
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
          console.log(`${indent}${pc.cyan(name + "/")}`);
          printTree(child, indent + "  ");
        } else {
          console.log(`${indent}${name}`);
        }
      }
    }

    printTree(root);
  },
};
