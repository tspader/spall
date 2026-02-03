#!/usr/bin/env bun
import { build, type CliDef } from "@spall/cli/shared";
import {
  corpus,
  review,
  add,
  commit,
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
    commit,
    get,
    list,
    search,
    vsearch,
    sync,
    serve,
    corpus,
    review,
    tui,
  },
};

build(cliDef).parse();
