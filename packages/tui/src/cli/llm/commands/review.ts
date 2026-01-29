import type { CommandDef } from "@spall/tui/cli/shared";

export const review: CommandDef = {
  description: "Review commands (JSON output for LLM consumption)",
  commands: {
    list: {
      description: "List reviews",
      options: {
        path: { alias: "p", type: "string", description: "Path to git repo", default: "." },
        commit: { alias: "c", type: "string", description: "Commit SHA" },
      },
      handler: async () => {
        // TODO
      },
    },
    create: {
      description: "Create a review",
      options: {
        path: { alias: "p", type: "string", description: "Path to git repo", default: "." },
        commit: { alias: "c", type: "string", description: "Commit SHA" },
        name: { alias: "n", type: "string", description: "Review name" },
      },
      handler: async () => {
        // TODO
      },
    },
    comments: {
      description: "List comments with content",
      options: {
        path: { alias: "p", type: "string", description: "Path to git repo", default: "." },
        commit: { alias: "c", type: "string", description: "Commit SHA" },
        review: { alias: "r", type: "number", description: "Review ID" },
      },
      handler: async () => {
        // TODO
      },
    },
    patches: {
      description: "List or show patches",
      positionals: {
        seq: { type: "number", description: "Patch seq to display" },
      },
      options: {
        path: { alias: "p", type: "string", description: "Path to git repo", default: "." },
        commit: { alias: "c", type: "string", description: "Commit SHA" },
        review: { alias: "r", type: "number", description: "Review ID" },
      },
      handler: async () => {
        // TODO
      },
    },
  },
};
