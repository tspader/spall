#!/usr/bin/env bun
import { build, type CliDef } from "@spall/cli/shared";
import { vsearch } from "./commands/vsearch";
import { search } from "./commands/search";
import { list } from "./commands/list";
import { fetch } from "./commands/fetch";
import { add } from "./commands/add";

const cliDef: CliDef = {
  name: "spallm",
  description:
    "Spall CLI for LLM agents. Search notes, browse structure, fetch full content.",
  commands: { vsearch, search, list, fetch, add },
};

build(cliDef).parse();
