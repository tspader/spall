import { z } from "zod";

/**
 * Helper to attach a Zod schema to a function.
 * Enables reuse of the schema for validation in routes.
 *
 * Usage:
 *   export const search = fn(SearchInput, async (input) => { ... })
 *   // Then in routes: validator("json", search.schema)
 */
export function fn<T extends z.ZodType, Result>(
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

// ============================================
// Shared Schemas
// ============================================

/**
 * All project-scoped operations take a directory.
 * Server derives paths: {directory}/.spall/spall.db, {directory}/.spall/notes/
 */
export const DirectoryInput = z
  .object({
    directory: z.string().describe("Project root directory"),
  })
  .meta({ ref: "DirectoryInput" });
export type DirectoryInput = z.infer<typeof DirectoryInput>;

export const InitInput = DirectoryInput.meta({ ref: "InitInput" });
export type InitInput = z.infer<typeof InitInput>;

export const IndexInput = DirectoryInput.meta({ ref: "IndexInput" });
export type IndexInput = z.infer<typeof IndexInput>;

export const SearchInput = DirectoryInput.extend({
  query: z.string().describe("Search query text"),
  limit: z.number().optional().describe("Maximum number of results"),
}).meta({ ref: "SearchInput" });
export type SearchInput = z.infer<typeof SearchInput>;

export const SearchResult = z
  .object({
    key: z.string().describe("Unique identifier for the result"),
    distance: z.number().describe("Distance/similarity score"),
  })
  .meta({ ref: "SearchResult" });
export type SearchResult = z.infer<typeof SearchResult>;

// ============================================
// Event Schemas (for SSE streams)
// ============================================

/** File status for scan progress events */
export const FileStatus = z.enum(["added", "modified", "removed", "ok"]);
export type FileStatus = z.infer<typeof FileStatus>;

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
export type InitEvent = z.infer<typeof InitEvent>;

export const ModelEvent = z.discriminatedUnion("action", [
  z.object({
    tag: z.literal("model"),
    action: z.literal("download"),
    model: z.string(),
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
export type ModelEvent = z.infer<typeof ModelEvent>;

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
export type ScanEvent = z.infer<typeof ScanEvent>;

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
export type EmbedEvent = z.infer<typeof EmbedEvent>;

/** All possible events (union of all event types) */
export const Event = z.union([InitEvent, ModelEvent, ScanEvent, EmbedEvent]);
export type Event = z.infer<typeof Event>;

/** Events emitted during /init (init + model events) */
export const InitResponse = z.union([InitEvent, ModelEvent]);
export type InitResponse = z.infer<typeof InitResponse>;

/** Events emitted during /index (scan + embed events) */
export const IndexResponse = z.union([ScanEvent, EmbedEvent]);
export type IndexResponse = z.infer<typeof IndexResponse>;
