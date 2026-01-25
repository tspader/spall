import { z } from "zod";

import { Bus } from "./event";
import { Store } from "./store";
import { Model } from "./model";
import { InitInput, IndexInput, SearchInput, SearchResult } from "./schema";

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

export const init = api(
  z.object({
    directory: z.string(),
  }),
  async (): Promise<void> => {
    await Store.ensure();
    Store.close();

    // Download model (global, in ~/.cache/spall/models/)
    await Model.download();

    await Bus.emit({ tag: "init", action: "done" });
  },
);

export const index = api(IndexInput, async (input): Promise<void> => {
  // TODO: Actually do indexing via Store
  // For now, send stub events to prove the pipeline works
  await Bus.emit({ tag: "scan", action: "start", total: 0 });
  await Bus.emit({ tag: "scan", action: "done" });
});

export const search = api(
  SearchInput,
  async (input): Promise<z.infer<typeof SearchResult>[]> => {
    // TODO: Actually do search via Store + Model
    return [];
  },
);
