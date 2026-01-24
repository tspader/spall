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
    action: z.literal("progress"),
    percent: z.number(),
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
    action: z.literal("done"),
  }),
]);
export type ScanEvent = z.infer<typeof ScanEvent>;

export const EmbedEvent = z.discriminatedUnion("action", [
  z.object({
    tag: z.literal("embed"),
    action: z.literal("start"),
    total: z.number(),
  }),
  z.object({
    tag: z.literal("embed"),
    action: z.literal("progress"),
    current: z.number(),
  }),
  z.object({
    tag: z.literal("embed"),
    action: z.literal("done"),
  }),
]);
export type EmbedEvent = z.infer<typeof EmbedEvent>;

export const InitResponse = z.union([InitEvent, ModelEvent]);
export type InitResponse = z.infer<typeof InitResponse>;

export const IndexEvent = z.union([ScanEvent, EmbedEvent]);
export type IndexEvent = z.infer<typeof IndexEvent>;
