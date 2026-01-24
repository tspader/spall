import { z } from "zod";

///////////////
// UTILITIES //
///////////////
export const FileStatus = z.enum(["added", "modified", "removed", "ok"]);

export type FileStatus = z.infer<typeof FileStatus>;

////////////////
// SSE EVENTS //
////////////////
//
// these are the base events we can emit; any given API call could emit
// any subset of these
//
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

export const ScanEvent = z.discriminatedUnion("action", [
  z.object({
    tag: z.literal("scan"),
    action: z.literal("start"),
    total: z.number(),
  }),
  z.object({
    tag: z.literal("scan"),
    action: z.literal("progress"),
    path: z.string(),
    status: FileStatus,
  }),
  z.object({
    tag: z.literal("scan"),
    action: z.literal("done"),
  }),
]);

export const EmbedEvent = z.discriminatedUnion("action", [
  z.object({
    tag: z.literal("embed"),
    action: z.literal("start"),
    totalDocs: z.number(),
    totalChunks: z.number(),
    totalBytes: z.number(),
  }),
  z.object({
    tag: z.literal("embed"),
    action: z.literal("progress"),
    filesProcessed: z.number(),
    totalFiles: z.number(),
    bytesProcessed: z.number(),
    totalBytes: z.number(),
  }),
  z.object({
    tag: z.literal("embed"),
    action: z.literal("done"),
  }),
]);

export const Event = z.union([InitEvent, ModelEvent, ScanEvent, EmbedEvent]);

export type InitEvent = z.infer<typeof InitEvent>;
export type ScanEvent = z.infer<typeof ScanEvent>;
export type EmbedEvent = z.infer<typeof EmbedEvent>;
export type ModelEvent = z.infer<typeof ModelEvent>;
export type Event = z.infer<typeof Event>;


/////////
// API //
/////////
//
// simple input and output types for API functions
//
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

export type SearchInput = z.infer<typeof SearchInput>;
export type SearchResult = z.infer<typeof SearchResult>;


/////////////
// SSE API //
/////////////
//
// input and output types for API functions that stream over SSE; the input
// types are analagous to non-streaming SSE functions, but obviously there's
// no singular type that is returned.
//
// rather, the "output" type is just a union of all events it can emit
//
export const InitInput = z.object({
  directory: z.string().describe("Project root directory"),
});
export const InitEvents = z.union([InitEvent, ModelEvent]);

export const IndexInput = z.object({
  directory: z.string().describe("Project root directory"),
});
export const IndexEvents = z.union([ScanEvent, EmbedEvent]);

export type InitInput = z.infer<typeof InitInput>;
export type IndexInput = z.infer<typeof IndexInput>;
export type InitEvents = z.infer<typeof InitEvents>;
export type IndexEvents = z.infer<typeof IndexEvents>;
