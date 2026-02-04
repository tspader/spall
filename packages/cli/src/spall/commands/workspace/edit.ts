import * as prompts from "@clack/prompts";
import consola from "consola";

import { WorkspaceConfig } from "@spall/core";
import { Client } from "@spall/sdk/client";
import type { CommandDef } from "@spall/cli/shared";

export const edit: CommandDef = {
  description: "Interactively edit the workspace",
  handler: async () => {
    const located = WorkspaceConfig.locate(process.cwd());
    if (!located) {
      consola.error("No workspace config found. Run `spall workspace init`.");
      process.exit(1);
    }

    const cfg = WorkspaceConfig.load(located.root);
    const client = await Client.connect();
    const corpora = (await client.corpus.list().then(Client.unwrap)) as any[];

    const options = corpora
      .map((c) => {
        const name = c.name as string;
        const noteCount = typeof c.noteCount === "number" ? c.noteCount : null;
        return {
          label: name,
          value: name,
          hint: noteCount == null ? undefined : `${noteCount} notes`,
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));

    prompts.intro("Workspace include");

    const picked = await prompts.autocompleteMultiselect<string>({
      message: "Select corpora to include by default (type to filter)",
      options,
      placeholder: "Type to filter...",
      maxItems: 12,
      initialValues: cfg.include.filter((c) =>
        options.some((o) => o.value === c),
      ),
      required: true,
    });

    if (prompts.isCancel(picked)) {
      prompts.outro("Done");
      return;
    }

    if (
      !(Array.isArray(picked) && picked.every((x) => typeof x === "string"))
    ) {
      throw new Error("Unexpected autocompleteMultiselect result");
    }
    const include = picked;

    WorkspaceConfig.patch(located.root, { include });
    prompts.outro("Updated workspace include list");
  },
};
