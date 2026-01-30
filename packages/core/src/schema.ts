import { z } from "zod";

///////////////
// UTILITIES //
///////////////
export const FileStatus = z.enum(["added", "modified", "removed", "ok"]);

export type FileStatus = z.infer<typeof FileStatus>;

///////////////
// SSE EVENTS //
///////////////
export const InitEvent = z.discriminatedUnion("action", [
  z.object({
    tag: z.literal("init"),
    action: z.literal("create_dir"),
    path: z.string(),
  }),
  z.object({
    tag: z.literal("init"),
    action: z.literal("create_db"),
    path: z.string(),
  }),
  z.object({
    tag: z.literal("init"),
    action: z.literal("done"),
  }),
]);

export const ModelEvent = z.discriminatedUnion("action", [
  z.object({
    tag: z.literal("model"),
    action: z.literal("download"),
    model: z.string(),
  }),
  z.object({
    tag: z.literal("model"),
    action: z.literal("progress"),
    model: z.string(),
    total: z.number(),
    downloaded: z.number(),
  }),
  z.object({
    tag: z.literal("model"),
    action: z.literal("load"),
    model: z.string(),
    path: z.string(),
  }),
  z.object({
    tag: z.literal("model"),
    action: z.literal("ready"),
    model: z.string(),
  }),
]);

export const ScanEvent = z.union([
  z.object({
    tag: z.literal("scan.start"),
    numFiles: z.number(),
  }),
  z.object({
    tag: z.literal("scan.progress"),
    path: z.string(),
    status: FileStatus,
  }),
  z.object({
    tag: z.literal("scan.done"),
    numFiles: z.number(),
  }),
]);

export const EmbedEvent = z.union([
  z.object({
    tag: z.literal("embed.start"),
    numFiles: z.number(),
    numChunks: z.number(),
    numBytes: z.number(),
  }),
  z.object({
    tag: z.literal("embed.progress"),
    numFiles: z.number(),
    numChunks: z.number(),
    numBytes: z.number(),
    numFilesProcessed: z.number(),
    numBytesProcessed: z.number(),
  }),
  z.object({
    tag: z.literal("embed.done"),
    numFiles: z.number(),
  }),
]);

export const Event = z.union([InitEvent, ModelEvent, ScanEvent, EmbedEvent]);

export type InitEvent = z.infer<typeof InitEvent>;
export type ModelEvent = z.infer<typeof ModelEvent>;
export type ScanEvent = z.infer<typeof ScanEvent>;
export type EmbedEvent = z.infer<typeof EmbedEvent>;
export type Event = z.infer<typeof Event>;

/////////
// API //
/////////
export const SearchInput = z.object({
  directory: z.string().describe("Project root directory"),
  query: z.string().describe("Search query text"),
  limit: z.number().optional().describe("Maximum number of results"),
});

export const SearchResult = z
  .object({
    key: z.string().describe("Unique identifier for the result"),
    distance: z.number().describe("Distance/similarity score"),
  })
  .meta({ ref: "SearchResult" });

export const IndexInput = z.object({
  directory: z.string().describe("Root directory to scan"),
  glob: z.string().optional().describe("Glob pattern to match"),
  project: z.number().describe("Project id"),
});

export type SearchInput = z.infer<typeof SearchInput>;
export type SearchResult = z.infer<typeof SearchResult>;
export type IndexInput = z.infer<typeof IndexInput>;

/////////////
// SSE API //
/////////////
export const InitInput = z.object({
  directory: z.string().describe("Project root directory"),
});
export const InitEvents = z.union([InitEvent, ModelEvent]);

export const IndexEvents = z.union([ScanEvent, EmbedEvent]);

export type InitInput = z.infer<typeof InitInput>;
export type InitEvents = z.infer<typeof InitEvents>;
export type IndexEvents = z.infer<typeof IndexEvents>;
