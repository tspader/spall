import { db } from "@spall/tui/store";
import type { CommandDef } from "@spall/tui/cli/shared";

export const tui: CommandDef = {
  description: "Launch the interactive TUI",
  handler: async () => {
    db.init();

    await import("@opentui/solid/preload");
    const { tui } = await import("../../../App");
    await tui({ repoPath: process.cwd() });
  },
};
