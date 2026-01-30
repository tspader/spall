import type { CommandDef } from "@spall/cli/shared";
import { create } from "./create";
import { list } from "./list";

export const project: CommandDef = {
  description: "Manage projects",
  commands: { create, list },
};
