import consola from "consola";
import { Status, printHelp, type CommandDef } from "@spall/cli/shared";
import { prime as primeMd } from "@spall/integration";

export const prime: CommandDef = {
  description: "Basic usage guide for LLMs",
  handler: async () => {
    const statusResult = await Status.run();

    console.log(primeMd.trimEnd());
    console.log("");

    if ("error" in statusResult) {
      consola.error("Failed to list corpora:", statusResult.error);
    } else {
      Status.print(statusResult);
      console.log("");
    }

    printHelp();
  },
};
