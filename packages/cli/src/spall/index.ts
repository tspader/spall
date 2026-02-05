#!/usr/bin/env bun
import { build, setActiveCli, type CliDef } from "@spall/cli/shared";
import {
  corpus,
  workspace,
  review,
  add,
  commit,
  hook,
  integrate,
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
  description: "Fast, local, searchable memory for LLMs and humans",
  commands: {
    workspace,
    add,
    get,
    list,
    search,
    vsearch,
    sync,
    commit,
    integrate,
    corpus,
    serve,
    tui,
    hook,
  },
};

setActiveCli(cliDef);

build(cliDef).parse();
