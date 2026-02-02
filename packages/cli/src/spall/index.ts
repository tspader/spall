#!/usr/bin/env bun
import { build, type CliDef } from "@spall/cli/shared";
import {
  project,
  review,
  add,
  serve,
  get,
  search,
  sync,
  tui,
} from "./commands";

const cliDef: CliDef = {
  name: "spall",
  description: "Local semantic note store with embeddings",
  commands: { add, get, search, sync, serve, project, review, tui },
};

build(cliDef).parse();
