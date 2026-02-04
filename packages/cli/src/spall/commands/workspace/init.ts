import { existsSync } from "fs";
import { basename } from "path";

import * as prompts from "@clack/prompts";
import consola from "consola";

import { WorkspaceConfig, type WorkspaceConfigSchema } from "@spall/core";
import { Client } from "@spall/sdk/client";

import { gitRoot, type CommandDef } from "@spall/cli/shared";

export const init: CommandDef = {
  description: "Initialize workspace config in this repo",
  options: {
    path: {
      alias: "p",
      type: "string",
      description: "Directory to initialize (defaults to git root or cwd)",
    },
    force: {
      alias: "f",
      type: "boolean",
      description: "Overwrite existing .spall/spall.json",
      default: false,
    },
  },
  handler: async (argv) => {
    const cwd = process.cwd();
    const root =
      (argv.path as string | undefined) ?? (await gitRoot(cwd)) ?? cwd;
    const configPath = WorkspaceConfig.path(root);

    prompts.intro("Workspace init");

    if (existsSync(configPath) && !argv.force) {
      const overwrite = await prompts.confirm({
        message: "Workspace config already exists. Overwrite?",
        initialValue: false,
      });
      if (prompts.isCancel(overwrite) || !overwrite) {
        prompts.outro("Done");
        return;
      }
    }

    const defaultName = basename(root) || "default";
    const workspaceName = await prompts.text({
      message: "Workspace name",
      initialValue: defaultName,
      validate: (s) => (s && s.trim().length > 0 ? undefined : "Required"),
    });
    if (prompts.isCancel(workspaceName)) {
      prompts.outro("Done");
      return;
    }

    const createCorpus = await prompts.confirm({
      message: "Create a corpus for this repo?",
      initialValue: true,
    });
    if (prompts.isCancel(createCorpus)) {
      prompts.outro("Done");
      return;
    }

    let corpusName: string | null = null;
    if (createCorpus) {
      const name = await prompts.text({
        message: "Corpus name",
        initialValue: defaultName,
        validate: (s) => (s && s.trim().length > 0 ? undefined : "Required"),
      });
      if (prompts.isCancel(name)) {
        prompts.outro("Done");
        return;
      }
      corpusName = String(name).trim();
    }

    const spinner = prompts.spinner();
    spinner.start("Creating workspace");

    try {
      const client = await Client.connect();

      const ws = await client.workspace
        .create({ name: String(workspaceName).trim() })
        .then(Client.unwrap);

      if (corpusName) {
        spinner.message("Creating corpus");
        await client.corpus.create({ name: corpusName }).then(Client.unwrap);
      }

      spinner.message("Loading corpora");
      const corpora = await client.corpus.list().then(Client.unwrap);
      const options = (corpora as any[])
        .map((c) => {
          const name = c.name as string;
          const noteCount =
            typeof c.noteCount === "number" ? c.noteCount : null;
          return {
            label: name,
            value: name,
            hint: noteCount == null ? undefined : `${noteCount} notes`,
          };
        })
        .sort((a, b) => a.label.localeCompare(b.label));

      const defaults = new Set<string>(["default"]);
      if (corpusName) defaults.add(corpusName);

      spinner.stop("Workspace created");

      const picked = await prompts.autocompleteMultiselect<string>({
        message: "Select corpora to include by default (type to filter)",
        options,
        placeholder: "Type to filter...",
        maxItems: 12,
        initialValues: Array.from(defaults),
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

      const next: WorkspaceConfigSchema = {
        workspace: { name: ws.name, id: ws.id },
        include,
      };

      WorkspaceConfig.write(root, next);
      prompts.outro(`Wrote ${configPath}`);
    } catch (e: any) {
      spinner.stop("Failed");
      consola.error(e?.message ?? String(e));
      prompts.outro("Done");
      process.exit(1);
    }
  },
};
