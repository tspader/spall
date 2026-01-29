#!/usr/bin/env bun
import { build, type CliDef } from "@spall/tui/cli/shared";
import { project, review, add, serve, get, index, tui } from "./commands";

const cliDef: CliDef = {
  name: "spall",
  description: "Local semantic note store with embeddings",
  commands: { add, get, index, serve, project, review, tui },
};

build(cliDef).parse();
