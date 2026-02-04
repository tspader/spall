export { Store, type Chunk, type VSearchResult } from "./store";
export { Model, type Token } from "./model";
export { Bus } from "./event";
export { Sql } from "./sql";
export { Io } from "./io";
export {
  Config,
  type ConfigSchema,
  WorkspaceConfig,
  type WorkspaceConfigSchema,
} from "./config";

export { Workspace } from "./workspace";
export { Corpus } from "./corpus";
export { Note } from "./note";
export { Query } from "./query";
export { Commit } from "./commit";
export { Error } from "./error";
export { Context } from "./context";

import { z } from "zod";
import { Workspace } from "./workspace";
import { Corpus } from "./corpus";
import { Model } from "./model";
import { Store } from "./store";
import { Bus } from "./event";
import { Note } from "./note";
import { Error } from "./error";

export const EventUnion = z.discriminatedUnion("tag", [
  Error.Event.Raised,
  Bus.Event.Connected,
  Workspace.Event.Created,
  Workspace.Event.Updated,
  Corpus.Event.Created,
  Corpus.Event.Updated,
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
  Store.Event.EmbedCancel,
  Store.Event.FtsStart,
  Store.Event.FtsDone,
  Note.Event.Created,
  Note.Event.Updated,
]);

export type EventUnion =
  | z.infer<typeof Error.Event.Raised>
  | z.infer<typeof Bus.Event.Connected>
  | z.infer<typeof Workspace.Event.Created>
  | z.infer<typeof Workspace.Event.Updated>
  | z.infer<typeof Corpus.Event.Created>
  | z.infer<typeof Corpus.Event.Updated>
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
  | z.infer<typeof Store.Event.EmbedCancel>
  | z.infer<typeof Store.Event.FtsStart>
  | z.infer<typeof Store.Event.FtsDone>
  | z.infer<typeof Note.Event.Created>
  | z.infer<typeof Note.Event.Updated>;
