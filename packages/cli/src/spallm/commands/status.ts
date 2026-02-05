import consola from "consola";
import { type CommandDef, Status } from "@spall/cli/shared";

export const status: CommandDef = {
  summary: Status.summary,
  description: Status.description,
  handler: async () => {
    const result = await Status.run();

    if ("error" in result) {
      consola.error("Failed to list corpora:", result.error);
      process.exit(1);
    }

    Status.print(result);
  },
};
