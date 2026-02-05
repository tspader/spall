import consola from "consola";
import { Client } from "@spall/sdk/client";
import { WorkspaceConfig } from "@spall/core";
import { table, type CommandDef } from "@spall/cli/shared";

export const status: CommandDef = {
  summary: "List available corpora and workspace status",
  description: `List available corpora, and which will be included by default in searches (i.e. included in workspace)`,
  handler: async () => {
    const client = await Client.connect();
    const result = await client.corpus.list();

    if (result.error || !result.data) {
      consola.error("Failed to list corpora:", result.error);
      process.exit(1);
    }

    const corpora = result.data;
    if (corpora.length === 0) {
      console.log("No corpora found.");
      return;
    }

    const config = WorkspaceConfig.load(process.cwd());
    const included = new Set(config.include);

    type P = (typeof corpora)[number];
    const formatTime = (ts: number) =>
      new Date(ts).toISOString().slice(0, 19).replace("T", " ");

    console.log(`Workspace: ${config.workspace.name}`);
    console.log("");

    table(
      ["name", "id", "notes", "workspace", "created", "updated"],
      [
        corpora.map((p: P) => p.name),
        corpora.map((p: P) => String(p.id)),
        corpora.map((p: P) => String(p.noteCount)),
        corpora.map((p: P) => (included.has(p.name) ? "yes" : "no")),
        corpora.map((p: P) => formatTime(p.createdAt)),
        corpora.map((p: P) => formatTime(p.updatedAt)),
      ],
    );
  },
};
