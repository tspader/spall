import { type Plugin, tool } from "@opencode-ai/plugin";

export const SpallPlugin: Plugin = async ({ $ }) => {
  return {
    tool: {
      spall_prime: tool({
        description: "Usage guide for spall (a fast, searchable document database and persistent LLM memory). You must call this tool before using spall.",
        args: {},
        async execute() {
          return await $`spallm prime`.text();
        },
      }),

    },
  };
};

export default SpallPlugin;
