import consola from "consola";

import { WorkspaceConfig } from "@spall/core";
import type { CommandDef } from "@spall/cli/shared";

export const remove: CommandDef = {
  description: "Remove a corpus from the workspace include list",
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
    const include = cfg.include.filter((c) => c !== name);
    WorkspaceConfig.patch(located.root, { include });
    consola.success(`Removed corpus: ${name}`);
  },
};
