import z from "zod";
import { api } from "./api";
import { Store } from "./store";
import { Model } from "./model";
import { Sql } from "./sql";
import { Project } from "./project";
import { Bus } from "./event";

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

  export namespace Event {
    export const Created = Bus.define("note.created", {
      info: Info,
    });
    export const Updated = Bus.define("note.updated", {
      info: Info,
    });
  }

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

  export const getById = api(
    z.object({
      id: Id,
    }),
    (input): Info => {
      const db = Store.get();

      const row = db.prepare(Sql.GET_NOTE).get(input.id);
      if (!row) throw new NotFoundError(`Note not found: ${input.id}`);

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
    async (input): Promise<void> => {
      const project = Project.get({ id: input.project });
      const db = Store.get();

      const contentHash = hash(input.content);

      // Check for existing note with same hash in this project
      const existing = db
        .prepare(Sql.GET_NOTE_BY_HASH)
        .get(project.id, contentHash);
      if (existing) {
        const info = Row.parse(existing);
        await Bus.publish({ tag: "note.created", info });
        return;
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

      const info: Info = {
        id: Id.parse(inserted.id),
        project: project.id,
        path: input.path,
        content: input.content,
        contentHash,
      };

      await Bus.publish({ tag: "note.created", info });
    },
  );

  export const update = api(
    z.object({
      id: Id,
      content: z.string(),
    }),
    async (input): Promise<void> => {
      const db = Store.get();

      // Check note exists
      const existing = db.prepare(Sql.GET_NOTE).get(input.id);
      if (!existing) throw new NotFoundError(`Note not found: ${input.id}`);

      const contentHash = hash(input.content);
      const existingNote = Row.parse(existing);

      // If content unchanged, emit event and return early
      if (contentHash === existingNote.contentHash) {
        await Bus.publish({ tag: "note.updated", info: existingNote });
        return;
      }

      const mtime = Date.now();

      await Model.load();

      // Chunk and embed new content
      const chunks = await Store.chunk(input.content);

      // Update note record
      const updated = db
        .prepare(Sql.UPDATE_NOTE)
        .get(input.content, contentHash, mtime, input.id) as {
        id: number;
        project_id: number;
        path: string;
        content: string;
        content_hash: string;
      };

      const noteKey = `note:${input.id}`;

      // Clear old embeddings
      Store.clearEmbeddings(noteKey);

      if (chunks.length > 0) {
        const texts = chunks.map((c) => c.text);
        const embeddings = await Model.embedBatch(texts);

        for (let i = 0; i < chunks.length; i++) {
          Store.embed(noteKey, i, chunks[i]!.pos, embeddings[i]!);
        }
      }

      const info: Info = {
        id: Id.parse(updated.id),
        project: Project.Id.parse(updated.project_id),
        path: updated.path,
        content: updated.content,
        contentHash: updated.content_hash,
      };

      await Bus.publish({ tag: "note.updated", info });
    },
  );

  export const upsert = api(
    z.object({
      project: Project.Id,
      path: z.string(),
      content: z.string(),
    }),
    async (input): Promise<void> => {
      const db = Store.get();

      // Check if note exists at this path
      const existing = db
        .prepare(Sql.GET_NOTE_BY_PATH)
        .get(input.project, input.path);

      if (existing) {
        // Update existing note
        const existingNote = Row.parse(existing);
        await update({ id: existingNote.id, content: input.content });
      } else {
        // Create new note
        await add(input);
      }
    },
  );
}
