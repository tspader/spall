export { Store, type Chunk, type VSearchResult } from "./store";
export { Model, type Token } from "./model";
export { Bus } from "./event";
export { Sql } from "./sql";
export { Io } from "./io";
export { FileStatus } from "./schema";
export { Config, type ConfigSchema, ProjectConfig, type ProjectConfigSchema } from "./config";

export { Project } from "./project";
export { Note } from "./note";
export { Query } from "./query";
export { Error } from "./error";

import { z } from "zod";
import { Project } from "./project";
import { Model } from "./model";
import { Store } from "./store";
import { Bus } from "./event";
import { Note } from "./note";
import { Error } from "./error";

export const EventUnion = z.discriminatedUnion("tag", [
  Error.Event.Raised,
  Bus.Event.Connected,
  Project.Event.Created,
  Project.Event.Updated,
  Model.Event.Download,
  Model.Event.Progress,
  Model.Event.Downloaded,
  Model.Event.Load,
  Model.Event.Failed,
  Store.Event.Create,
  Store.Event.Created,
  Store.Event.Scan,
  Store.Event.ScanProgress,
  Store.Event.Scanned,
  Store.Event.Embed,
  Store.Event.EmbedProgress,
  Store.Event.Embedded,
  Note.Event.Created,
  Note.Event.Updated,
]);

export type EventUnion =
  | z.infer<typeof Error.Event.Raised>
  | z.infer<typeof Bus.Event.Connected>
  | z.infer<typeof Project.Event.Created>
  | z.infer<typeof Project.Event.Updated>
  | z.infer<typeof Model.Event.Download>
  | z.infer<typeof Model.Event.Progress>
  | z.infer<typeof Model.Event.Downloaded>
  | z.infer<typeof Model.Event.Load>
  | z.infer<typeof Model.Event.Failed>
  | z.infer<typeof Store.Event.Create>
  | z.infer<typeof Store.Event.Created>
  | z.infer<typeof Store.Event.Scan>
  | z.infer<typeof Store.Event.ScanProgress>
  | z.infer<typeof Store.Event.Scanned>
  | z.infer<typeof Store.Event.Embed>
  | z.infer<typeof Store.Event.EmbedProgress>
  | z.infer<typeof Store.Event.Embedded>
  | z.infer<typeof Note.Event.Created>
  | z.infer<typeof Note.Event.Updated>;
