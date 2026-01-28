#!/usr/bin/env bun
import { build, type CliDef } from "./yargs";
import { project, review, add, serve, get, list, tui } from "./commands";

const cliDef: CliDef = {
  name: "spall",
  description: "Local semantic note store with embeddings",
  commands: { project, review, add, serve, get, list, tui },
};

build(cliDef).parse();
