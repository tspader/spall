import { db } from "../../store";
import type { CommandDef } from "../yargs";

export const tui: CommandDef = {
  description: "Launch the interactive TUI",
  handler: async () => {
    db.init();

    await import("@opentui/solid/preload");
    const { tui } = await import("../../App");
    await tui({ repoPath: process.cwd() });
  },
};
