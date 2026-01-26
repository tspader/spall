import z from "zod";
import { api } from "./api";
import { Store } from "./store";
import { Model } from "./model";
import { Sql } from "./sql";
import { Project } from "./project";

export namespace Note {
  export const Info = z.object({
    id: z.number(),
    project: Project.Id,
    path: z.string(),
    content: z.string(),
    contentHash: z.string(),
  });
  export type Info = z.infer<typeof Info>;

  export class NotFoundError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "NotFoundError";
    }
  }

  export type Row = {
    id: number;
    project_id: number;
    path: string;
    content: string;
    content_hash: string;
  } | null;

  export function hash(content: string): string {
    return Bun.hash(content).toString(16);
  }

  export const get = api(
    z.object({
      project: Project.Id,
      path: z.string(),
    }),
    async (input): Promise<Info> => {
      await Project.get({ id: input.project });
      const db = Store.get();

      const row = db
        .prepare(Sql.GET_NOTE_BY_PATH)
        .get(input.project, input.path) as Row;

      if (!row) throw new NotFoundError(`Note not found: ${input.path}`);

      return {
        id: row.id,
        project: Project.Id.parse(row.project_id),
        path: row.path,
        content: row.content,
        contentHash: row.content_hash,
      };
    },
  );

  export const ListItem = z.object({
    id: z.number(),
    path: z.string(),
  });
  export type ListItem = z.infer<typeof ListItem>;

  export const list = api(
    z.object({
      project: Project.Id,
    }),
    async (input): Promise<ListItem[]> => {
      await Project.get({ id: input.project });
      const db = Store.get();

      const rows = db.prepare(Sql.LIST_NOTES).all(input.project) as {
        id: number;
        path: string;
      }[];

      return rows;
    },
  );

  export const add = api(
    z.object({
      project: Project.Id,
      path: z.string(),
      content: z.string(),
    }),
    async (input): Promise<Info> => {
      const project = await Project.get({ id: input.project });
      const db = Store.get();

      // Compute content hash
      const contentHash = hash(input.content);

      // Check for existing note with same hash in this project
      const existing = db
        .prepare(Sql.GET_NOTE_BY_HASH)
        .get(project.id, contentHash) as Row;

      if (existing) {
        return {
          id: existing.id,
          project: Project.Id.parse(existing.project_id),
          path: existing.path,
          content: existing.content,
          contentHash: existing.content_hash,
        };
      }

      const mtime = Date.now();

      await Model.load();

      // Chunk and embed
      const chunks = await Store.chunk(input.content);

      // Insert note record
      const row = db
        .prepare(Sql.INSERT_NOTE)
        .get(project.id, input.path, input.content, contentHash, mtime) as {
        id: number;
      };

      if (chunks.length > 0) {
        // Use note id as the key for embeddings
        const noteKey = `note:${row.id}`;

        // Clear any existing embeddings for this note
        Store.clearEmbeddings(noteKey);

        // Embed all chunks
        const texts = chunks.map((c) => c.text);
        const embeddings = await Model.embedBatch(texts);

        // Store embeddings
        for (let i = 0; i < chunks.length; i++) {
          Store.embed(noteKey, i, chunks[i]!.pos, embeddings[i]!);
        }
      }

      return {
        id: row.id,
        project: project.id,
        path: input.path,
        content: input.content,
        contentHash,
      };
    },
  );
}
