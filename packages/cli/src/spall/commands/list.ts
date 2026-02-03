import { Client } from "@spall/sdk/client";
import {
  type CommandDef,
  createEphemeralQuery,
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

    const { query } = await createEphemeralQuery({
      client,
      project: argv.project,
      tracked: false,
    });

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
