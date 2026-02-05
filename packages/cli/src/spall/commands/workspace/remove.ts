import consola from "consola";

import { WorkspaceConfig } from "@spall/core";
import type { CommandDef } from "@spall/cli/shared";

export const remove: CommandDef = {
  description: "Remove a corpus from the workspace read scope",
  positionals: {
    corpus: {
      type: "string",
      description: "Corpus name",
      required: true,
    },
  },
  handler: async (argv) => {
    const located = WorkspaceConfig.locate(process.cwd());
    if (!located) {
      consola.error("No workspace config found. Run `spall workspace init`.");
      process.exit(1);
    }

    const name = String(argv.corpus ?? "").trim();
    if (!name) {
      consola.error("Missing required argument: corpus");
      process.exit(1);
    }

    const cfg = WorkspaceConfig.load(located.root);
    const read = cfg.scope.read.filter((c) => c !== name);
    const write =
      cfg.scope.write === name ? (read[0] ?? "default") : cfg.scope.write;
    WorkspaceConfig.patch(located.root, { scope: { read, write } });
    consola.success(`Removed corpus: ${name}`);
  },
};
