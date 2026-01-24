import {
  mkdirSync,
  existsSync,
} from "fs";
import { join } from "path";
import { z } from "zod";

import { Bus } from   "./event";
import { Store } from "./store";
import { Model } from "./model";
import {
  InitInput,
  IndexInput,
  SearchInput,
  SearchResult,
} from "./schema";

const SPALL_DIR = ".spall";
const DB_NAME = "spall.db";
const NOTES_DIR = "notes";

function paths(directory: string) {
  const spallDir = join(directory, SPALL_DIR);
  return {
    spallDir,
    dbPath: join(spallDir, DB_NAME),
    notesDir: join(spallDir, NOTES_DIR),
  };
}

// define a function which takes a schema type and parses it, instead of
// duplicating the parsing in many places
export function api<T extends z.ZodType, Result>(
  schema: T,
  cb: (input: z.infer<T>) => Result,
) {
  const result = (input: z.infer<T>) => {
    const parsed = schema.parse(input);
    return cb(parsed);
  };
  result.force = (input: z.infer<T>) => cb(input);
  result.schema = schema;
  return result;
}

const work = async () => {
  const totalTime = 3;
  const numIter = 50;
  const timePerIter = (totalTime * 1000) / numIter;

  await Bus.emit({
    tag: "model",
    action: "download",
    model: `${totalTime}s_download_model.gguf`
  });


  for (let i = 0; i < numIter; i++) {
    await Bus.emit({
      tag: "model",
      action: "progress",
      model: `${totalTime}s_download_model.gguf`,
      total: totalTime * 1000,
      downloaded: i * timePerIter
    });
    await Bun.sleep(timePerIter);
  }

  await Bus.emit({
    tag: "model",
    action: "ready",
    model: `${totalTime}s_download_model.gguf`
  });

}

export const init = api(InitInput, async (input): Promise<void> => {
  const { spallDir, dbPath, notesDir } = paths(input.directory);

  if (!existsSync(spallDir)) {
    mkdirSync(spallDir, { recursive: true });
    await Bus.emit({ tag: "init", action: "create_dir", path: spallDir });
  }

  if (!existsSync(notesDir)) {
    mkdirSync(notesDir, { recursive: true });
    await Bus.emit({ tag: "init", action: "create_dir", path: notesDir });
  }

  await Store.create(dbPath);
  Store.close();

  // Download model (global, in ~/.cache/spall/models/)
  Model.init();
  await work();
  await Model.download();

  await Bus.emit({ tag: "init", action: "done" });
});

export const index = api(IndexInput, async (input): Promise<void> => {
  const { dbPath, notesDir } = paths(input.directory);

  // TODO: Actually do indexing via Store
  // For now, send stub events to prove the pipeline works
  await Bus.emit({ tag: "scan", action: "start", total: 0 });
  await Bus.emit({ tag: "scan", action: "done" });
});

export const search = api(
  SearchInput,
  async (input): Promise<z.infer<typeof SearchResult>[]> => {
    const { dbPath } = paths(input.directory);

    // TODO: Actually do search via Store + Model
    return [];
  },
);
