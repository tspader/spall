#!/usr/bin/env bun
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { readFileSync } from "fs";

yargs(hideBin(process.argv))
  .command(
    "add <path>",
    "Add a note at the specified path",
    (yargs) => {
      return yargs
        .positional("path", {
          describe: "internal id for note",
          type: "string",
          demandOption: true,
        })
        .option("text", {
          alias: "t",
          type: "string",
          describe: "",
        })
        .option("file", {
          alias: "f",
          type: "string",
          describe: "add file content as note",
        })
        .check((argv) => {
          if (!argv.text && !argv.file) {
            throw new Error("You must specify either --text or --file");
          }
          if (argv.text && argv.file) {
            throw new Error("You cannot specify both --text and --file");
          }
          return true;
        });
    },
    (argv) => {
      const content = argv.text ?? readFileSync(argv.file!, "utf-8");
      console.log("Path:", argv.path);
      console.log("Content:", content);
    },
  )
  .demandCommand(1, "You must specify a command")
  .strict()
  .help()
  .parse();
