import consola from "consola";
import { Client } from "@spall/sdk/client";
import { table, type CommandDef } from "@spall/cli/shared";

export const list: CommandDef = {
  description: "List all corpora",
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

    type P = (typeof corpora)[number];
    const formatTime = (ts: number) =>
      new Date(ts).toISOString().slice(0, 19).replace("T", " ");

    table(
      ["name", "id", "notes", "created", "updated"],
      [
        corpora.map((p: P) => p.name),
        corpora.map((p: P) => String(p.id)),
        corpora.map((p: P) => String(p.noteCount)),
        corpora.map((p: P) => formatTime(p.createdAt)),
        corpora.map((p: P) => formatTime(p.updatedAt)),
      ],
    );
  },
};
