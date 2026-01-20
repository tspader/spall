#!/usr/bin/env bun
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { readFileSync } from "fs";
import { join } from "path";
import pc from "picocolors";
import { Store, Model, Event } from "@spall/core";

const SPALL_DIR = ".spall";
const DB_NAME = "spall.db";

const TAG_WIDTH = 8;

function setupEventHandler(): void {
  Event.on((event) => {
    const tag = pc.gray(event.tag.padEnd(TAG_WIDTH));
    switch (event.action) {
      case "create_db":
        console.log(`${tag} creating database at ${event.path}`);
        break;
      case "download":
        console.log(`${tag} downloading ${event.model}`);
        break;
      case "ready":
        console.log(`${tag} ${event.model} ready`);
        break;
      case "done":
        console.log(`${tag} ${pc.green("ok")}`);
        break;
    }
  });
}

function getDbPath(): string {
  return join(process.cwd(), SPALL_DIR, DB_NAME);
}

yargs(hideBin(process.argv))
  .scriptName("spall")
  .command(
    "init",
    "Initialize spall in the current directory",
    () => {},
    async () => {
      setupEventHandler();
      const dbPath = getDbPath();

      Store.create(dbPath);

      await Model.ensureEmbedding();
      await Model.ensureReranker();

      Event.emit({ tag: "init", action: "done" });
      Store.close();
    },
  )
  .command(
    "add <path>",
    "Add a note at the specified path",
    (yargs) => {
      return yargs
        .positional("path", {
          describe: "Internal path to the note (e.g. style/indentation)",
          type: "string",
          demandOption: true,
        })
        .option("text", {
          alias: "t",
          type: "string",
          describe: "Text content for the note",
        })
        .option("file", {
          alias: "f",
          type: "string",
          describe: "File path to read content from",
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
    async (argv) => {
      setupEventHandler();
      const content = argv.text ?? readFileSync(argv.file!, "utf-8");

      const dbPath = getDbPath();
      Store.open(dbPath);

      console.log("Path:", argv.path);
      console.log("Content:", content);

      console.log("\nGenerating embedding...");
      const embedding = await Model.embed(content);
      console.log(
        `Embedding (${embedding.length} dimensions):`,
        embedding.slice(0, 5),
        "...",
      );

      await Model.dispose();
      Store.close();
    },
  )
  .demandCommand(1, "You must specify a command")
  .strict()
  .help()
  .parse();
