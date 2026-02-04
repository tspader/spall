#!/usr/bin/env bun
import { build, type CliDef } from "@spall/cli/shared";
import {
  corpus,
  workspace,
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
    workspace,
    add,
    get,
    list,
    search,
    vsearch,
    sync,
    commit,
    serve,
    corpus,
    tui,
  },
};

build(cliDef).parse();
