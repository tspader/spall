import { db } from "@spall/tui/store";
import type { CommandDef } from "@spall/cli/shared";

export const tui: CommandDef = {
  description: "Launch the interactive TUI",
  handler: async () => {
    db.init();

    await import("@opentui/solid/preload");
    const { tui } = await import("@spall/tui/app");
    await tui({ repoPath: process.cwd() });
  },
};
