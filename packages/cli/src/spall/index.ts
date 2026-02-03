#!/usr/bin/env bun
import { build, type CliDef } from "@spall/cli/shared";
import {
  project,
  review,
  add,
  serve,
  get,
  list,
  search,
  sync,
  tui,
  vsearch,
} from "./commands";

const cliDef: CliDef = {
  name: "spall",
  description: "Local semantic note store with embeddings",
  commands: {
    add,
    get,
    list,
    search,
    vsearch,
    sync,
    serve,
    project,
    review,
    tui,
  },
};

build(cliDef).parse();
