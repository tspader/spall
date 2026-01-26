import z from "zod";
import { api } from "./api";
import { Store } from "./store";
import { Model } from "./model";
import { Sql } from "./sql";
import { Project } from "./project";

export namespace Note {
  export const Id = z.coerce.number().brand<"NoteId">();
  export type Id = z.infer<typeof Id>;

  export const Info = z.object({
    id: Id,
    project: Project.Id,
    path: z.string(),
    content: z.string(),
    contentHash: z.string(),
  });
  export type Info = z.infer<typeof Info>;

  const Row = z
    .object({
      id: z.number(),
      project_id: z.number(),
      path: z.string(),
      content: z.string(),
      content_hash: z.string(),
    })
    .transform(
      (r): Info => ({
        id: Id.parse(r.id),
        project: Project.Id.parse(r.project_id),
        path: r.path,
        content: r.content,
        contentHash: r.content_hash,
      }),
    );

  export class NotFoundError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "NotFoundError";
    }
  }

  function hash(content: string): string {
    return Bun.hash(content).toString(16);
  }

  export const get = api(
    z.object({
      project: Project.Id,
      path: z.string(),
    }),
    (input): Info => {
      const db = Store.get();

      const row = db
        .prepare(Sql.GET_NOTE_BY_PATH)
        .get(input.project, input.path);
      if (!row) throw new NotFoundError(`Note not found: ${input.path}`);

      return Row.parse(row);
    },
  );

  export const ListItem = z.object({
    id: Id,
    path: z.string(),
  });
  export type ListItem = z.infer<typeof ListItem>;

  const ListItemRow = z
    .object({
      id: z.number(),
      path: z.string(),
    })
    .transform(
      (r): ListItem => ({
        id: Id.parse(r.id),
        path: r.path,
      }),
    );

  export const list = api(
    z.object({
      project: Project.Id,
    }),
    async (input): Promise<ListItem[]> => {
      Project.get({ id: input.project });
      const db = Store.get();

      const rows = db.prepare(Sql.LIST_NOTES).all(input.project) as unknown[];
      return rows.map((r) => ListItemRow.parse(r));
    },
  );

  export const add = api(
    z.object({
      project: Project.Id,
      path: z.string(),
      content: z.string(),
    }),
    async (input): Promise<Info> => {
      const project = Project.get({ id: input.project });
      const db = Store.get();

      const contentHash = hash(input.content);

      // Check for existing note with same hash in this project
      const existing = db
        .prepare(Sql.GET_NOTE_BY_HASH)
        .get(project.id, contentHash);
      if (existing) {
        return Row.parse(existing);
      }

      const mtime = Date.now();

      await Model.load();

      // Chunk and embed
      const chunks = await Store.chunk(input.content);

      // Insert note record
      const inserted = db
        .prepare(Sql.INSERT_NOTE)
        .get(project.id, input.path, input.content, contentHash, mtime) as {
        id: number;
      };

      if (chunks.length > 0) {
        const noteKey = `note:${inserted.id}`;

        Store.clearEmbeddings(noteKey);

        const texts = chunks.map((c) => c.text);
        const embeddings = await Model.embedBatch(texts);

        for (let i = 0; i < chunks.length; i++) {
          Store.embed(noteKey, i, chunks[i]!.pos, embeddings[i]!);
        }
      }

      return {
        id: Id.parse(inserted.id),
        project: project.id,
        path: input.path,
        content: input.content,
        contentHash,
      };
    },
  );
}
