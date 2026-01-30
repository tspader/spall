import type { CommandDef } from "@spall/cli/shared";

export const add: CommandDef = {
  description: "Add a note (JSON output for LLM consumption)",
  positionals: {
    path: { type: "string", description: "Note path", required: true },
  },
  options: {
    text: { alias: "t", type: "string", description: "Note content", required: true },
    project: { alias: "p", type: "string", description: "Project name" },
    update: { alias: "u", type: "boolean", description: "Update if exists" },
    dupe: { alias: "d", type: "boolean", description: "Allow duplicate content" },
  },
  handler: async () => {
    // TODO: mirror spall add but with JSON output, no progress bars
  },
};
