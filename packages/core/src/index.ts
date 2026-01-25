export {
  Store,
  type Chunk,
  type VSearchResult,
  type FileRecord,
  type IndexResult,
} from "./store";
export { Model, type Token } from "./model";
export { Bus } from "./event";
export { Sql } from "./sql";
export { Io } from "./io";
export {
  Event,
  InitEvent,
  EmbedEvent,
  ModelEvent,
  InitInput,
  InitEvents,
  SearchInput,
  SearchResult,
  IndexInput,
  IndexEvents,
  FileStatus,
} from "./schema";
export { Config, type ConfigSchema } from "./config";
export { init, index, search } from "./api";

export { Project } from "./project";
export { Note } from "./note";

import { z } from "zod";
import { Project } from "./project";
import { Model } from "./model";
import { Store } from "./store";

export const EventUnion = z.discriminatedUnion("tag", [
  Project.Event.Created,
  Project.Event.Updated,
  Model.Event.Download,
  Model.Event.Progress,
  Model.Event.Downloaded,
  Model.Event.Load,
  Store.Event.Create,
  Store.Event.Created,
]);

export type EventUnion =
  | z.infer<typeof Project.Event.Created>
  | z.infer<typeof Project.Event.Updated>
  | z.infer<typeof Model.Event.Download>
  | z.infer<typeof Model.Event.Progress>
  | z.infer<typeof Model.Event.Downloaded>
  | z.infer<typeof Model.Event.Load>
  | z.infer<typeof Store.Event.Create>
  | z.infer<typeof Store.Event.Created>;
