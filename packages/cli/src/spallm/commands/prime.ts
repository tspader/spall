import type { CommandDef } from "@spall/cli/shared";

export const prime: CommandDef = {
  description: "Output LLM workflow context",
  handler: async () => {
    // TODO: detect workspace, summarize state, output compact prompt
  },
};
