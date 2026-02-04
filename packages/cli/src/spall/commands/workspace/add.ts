import * as prompts from "@clack/prompts";
import consola from "consola";

import { WorkspaceConfig } from "@spall/core";
import { Client } from "@spall/sdk/client";
import type { CommandDef } from "@spall/cli/shared";

export const add: CommandDef = {
  description: "Add a corpus to the workspace include list",
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

    const client = await Client.connect();

    // Ensure corpus exists (get-or-create).
    await client.corpus.create({ name }).then(Client.unwrap);
    const cfg = WorkspaceConfig.load(located.root);
    const include = cfg.include.includes(name)
      ? cfg.include
      : [...cfg.include, name];
    WorkspaceConfig.patch(located.root, { include });

    consola.success(`Included corpus: ${name}`);
  },
};
