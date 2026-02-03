import consola from "consola";
import { Client } from "@spall/sdk/client";
import { ProjectConfig } from "@spall/core";
import {
  type CommandDef,
  defaultTheme as theme,
  displayPathTree,
} from "@spall/cli/shared";

export const list: CommandDef = {
  description: "List note paths as a tree",
  positionals: {
    path: {
      type: "string",
      description: "Path or glob to filter notes",
      default: "*",
    },
  },
  options: {
    project: {
      alias: "p",
      type: "string",
      description: "Project name",
    },
    all: {
      alias: "a",
      type: "boolean",
      description: "Show individual filenames instead of counts",
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

    // normalize path: if doesn't end with glob char, treat as prefix
    let path = argv.path;
    if (!/[*?\]]$/.test(path)) {
      path = path.replace(/\/?$/, "/*");
    }

    // fetch paths
    const result = await client.query
      .paths({ id: String(query.id), path })
      .then(Client.unwrap);

    // flatten all paths from all projects
    const allPaths: string[] = [];
    for (const item of result.paths) {
      allPaths.push(...item.paths);
    }

    // sort for consistent display
    allPaths.sort();

    displayPathTree(allPaths, {
      showAll: argv.all === true,
      empty: "(no notes matching pattern)",
    });
  },
};
