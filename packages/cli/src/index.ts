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
      const key = argv.path;

      const dbPath = getDbPath();
      Store.open(dbPath);

      // Store the note
      Store.addNote(key, content);
      console.log(`${pc.gray("note".padEnd(TAG_WIDTH))} added ${key}`);

      // Chunk and embed
      const chunks = Store.chunk(content);
      console.log(
        `${pc.gray("chunk".padEnd(TAG_WIDTH))} ${chunks.length} chunk(s)`,
      );

      for (let seq = 0; seq < chunks.length; seq++) {
        const chunk = chunks[seq]!;
        const embedding = await Model.embed(chunk.text);
        Store.embed(key, seq, chunk.pos, embedding);
      }
      console.log(`${pc.gray("embed".padEnd(TAG_WIDTH))} ${pc.green("ok")}`);

      await Model.dispose();
      Store.close();
    },
  )
  .command(
    "search <query>",
    "Search for similar notes",
    (yargs) => {
      return yargs
        .positional("query", {
          describe: "Search query text",
          type: "string",
          demandOption: true,
        })
        .option("limit", {
          alias: "n",
          type: "number",
          describe: "Maximum number of results",
          default: 10,
        });
    },
    async (argv) => {
      setupEventHandler();
      const dbPath = getDbPath();
      Store.open(dbPath);

      // Embed the query
      const queryEmbedding = await Model.embed(argv.query);

      // Search
      const results = Store.vsearch(queryEmbedding, argv.limit);

      if (results.length === 0) {
        console.log("No results found.");
      } else {
        // Dedupe by key (multiple chunks may match)
        const seen = new Set<string>();
        for (const result of results) {
          if (seen.has(result.key)) continue;
          seen.add(result.key);

          const similarity = (1 - result.distance).toFixed(3);
          const note = Store.getNote(result.key);
          const preview = note
            ? note.slice(0, 80).replace(/\n/g, " ") +
              (note.length > 80 ? "..." : "")
            : "(no content)";

          console.log(
            `${pc.green(similarity)} ${pc.cyan(result.key)} ${pc.gray(preview)}`,
          );
        }
      }

      await Model.dispose();
      Store.close();
    },
  )
  .demandCommand(1, "You must specify a command")
  .strict()
  .help()
  .parse();
