#!/usr/bin/env bun
import { setColorEnabled } from "@spall/cli/shared";

setColorEnabled(false);

import { build, type CliDef } from "@spall/cli/shared";
import { setActiveCli } from "@spall/cli/shared";
import { vsearch } from "./commands/vsearch";
import { search } from "./commands/search";
import { list } from "./commands/list";
import { fetch } from "./commands/fetch";
import { add } from "./commands/add";
import { status } from "./commands/status";
import { prime } from "./commands/prime";

const cliDef: CliDef = {
  name: "spallm",
  description: "Fast, local, searchable memory for LLMs",
  commands: { vsearch, search, list, fetch, add, status, prime },
};

setActiveCli(cliDef);

build(cliDef).parse();
