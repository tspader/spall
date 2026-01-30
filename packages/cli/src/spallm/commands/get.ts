import type { CommandDef } from "@spall/cli/shared";

export const get: CommandDef = {
  description: "Get notes (JSON output for LLM consumption)",
  positionals: {
    path: { type: "string", description: "Path or glob", default: "*" },
  },
  options: {
    project: { alias: "p", type: "string", description: "Project name", default: "default" },
    max: { alias: "n", type: "number", description: "Max notes to return" },
  },
  handler: async () => {
    // TODO: mirror spall get but always JSON output
  },
};
