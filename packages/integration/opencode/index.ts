import { type Plugin, tool } from "@opencode-ai/plugin";

export const SpallPlugin: Plugin = async ({ $ }) => {
  return {
    tool: {
      spall_prime: tool({
        description: "spall usage primer. Always run before using spall.",
        args: {},
        async execute() {
          return await $`spallm prime`.text();
        },
      }),

    },
  };
};

export default SpallPlugin;
