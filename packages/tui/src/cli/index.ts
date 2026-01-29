#!/usr/bin/env bun
import { build, type CliDef } from "./yargs";
import { project, review, add, serve, get, tui } from "./commands";

const cliDef: CliDef = {
  name: "spall",
  description: "Local semantic note store with embeddings",
  commands: { add, get, serve, project, review, tui },
};

build(cliDef).parse();

