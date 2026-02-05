import { printHelp, type CommandDef } from "@spall/cli/shared";
import { prime as primeMd } from "@spall/integration";

export const prime: CommandDef = {
  description: "Basic usage guide for LLMs",
  handler: async () => {
    console.log(primeMd.trimEnd());
    console.log("");
    printHelp();
  },
};
