import consola from "consola";
import {
  table,
  defaultTheme as theme,
  type CommandDef,
  Status,
} from "@spall/cli/shared";

export const status: CommandDef = {
  summary: Status.summary,
  description: Status.description,
  handler: async () => {
    const result = await Status.run();

    if ("error" in result) {
      consola.error("Failed to list corpora:", result.error);
      process.exit(1);
    }

    const { corpora, included } = result;
    if (corpora.length === 0) {
      console.log("No corpora found.");
      return;
    }

    table(
      ["name", "id", "notes", "workspace", "created", "updated"],
      [
        corpora.map((p) => p.name),
        corpora.map((p) => String(p.id)),
        corpora.map((p) => String(p.noteCount)),
        corpora.map((p) => (included.has(p.name) ? "yes" : "no")),
        corpora.map((p) => Status.formatTime(p.createdAt)),
        corpora.map((p) => Status.formatTime(p.updatedAt)),
      ],
      {
        format: [
          undefined!,
          undefined!,
          undefined!,
          (s: string) => {
            const trimmed = s.trimEnd();
            const pad = s.slice(trimmed.length);
            return trimmed === "yes" ? theme.primary("yes") + pad : "no" + pad;
          },
          undefined!,
          undefined!,
        ],
      },
    );
  },
};
