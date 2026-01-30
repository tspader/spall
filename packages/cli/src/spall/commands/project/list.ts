import consola from "consola";
import { Client } from "@spall/sdk/client";
import { table, type CommandDef } from "@spall/cli/shared";

export const list: CommandDef = {
  description: "List all projects",
  handler: async () => {
    const client = await Client.connect();
    const result = await client.project.list();

    if (result.error || !result.data) {
      consola.error("Failed to list projects:", result.error);
      process.exit(1);
    }

    const projects = result.data;
    if (projects.length === 0) {
      console.log("No projects found.");
      return;
    }

    type P = (typeof projects)[number];
    const formatTime = (ts: number) =>
      new Date(ts).toISOString().slice(0, 19).replace("T", " ");

    table(
      ["name", "id", "notes", "created", "updated"],
      [
        projects.map((p: P) => p.name),
        projects.map((p: P) => String(p.id)),
        projects.map((p: P) => String(p.noteCount)),
        projects.map((p: P) => formatTime(p.createdAt)),
        projects.map((p: P) => formatTime(p.updatedAt)),
      ],
    );
  },
};
