import type { CommandDef } from "@spall/cli/shared";
import { init } from "./init";
import { add } from "./add";
import { remove } from "./remove";
import { edit } from "./edit";

export const workspace: CommandDef = {
  description: "Manage the current workspace",
  commands: { init, add, remove, edit },
};
