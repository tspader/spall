import { hooks, supportedShells, type Shell } from "@spall/integration";
import type { CommandDef } from "@spall/cli/shared";

export const hook: CommandDef = {
  description: "Print shell hook for completion support",
  hidden: true,
  positionals: {
    shell: {
      type: "string",
      description: `Shell to generate hook for (${supportedShells.join(", ")})`,
      required: true,
    },
  },
  handler: async (argv) => {
    const shell = argv.shell as string;

    if (!supportedShells.includes(shell as Shell)) {
      console.error(
        `Unknown shell: ${shell}. Supported: ${supportedShells.join(", ")}`,
      );
      process.exit(1);
    }

    process.stdout.write(hooks[shell as Shell]);
  },
};
