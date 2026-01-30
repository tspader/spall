#!/usr/bin/env bun
import { build, type CliDef } from "@spall/cli/shared";
import { prime } from "./commands/prime";
import { add } from "./commands/add";
import { get } from "./commands/get";
import { review } from "./commands/review";

const cliDef: CliDef = {
  name: "spallm",
  description: "Spall CLI for LLM agents",
  commands: { prime, add, get, review },
};

build(cliDef).parse();
