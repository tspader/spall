import type { CommandDef } from "@spall/tui/cli/shared";

export const prime: CommandDef = {
  description: "Output LLM workflow context",
  handler: async () => {
    // TODO: detect project, summarize state, output compact prompt
  },
};
