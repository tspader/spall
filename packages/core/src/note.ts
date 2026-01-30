import z from "zod";
import { normalize } from "path";
import { api } from "./api";
import { Store } from "./store";
import { Model } from "./model";
import { Sql } from "./sql";
import { Project } from "./project";
import { Bus } from "./event";
import { Error } from "./error";
import { Io } from "./io";

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

  export const Row = z
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

  export class NotFoundError extends Error.SpallError {
    constructor(message: string) {
      super("note.not_found", message);
      this.name = "NotFoundError";
    }
  }

  class DuplicateError extends Error.SpallError {
    constructor(path: string) {
      super(
        "note.duplicate",
        `Duplicate content detected for ${path}. Use dupe=true to allow duplicates.`,
      );
      this.name = "DuplicateError";
    }
  }

  class ExistsError extends Error.SpallError {
    constructor(path: string) {
      super("note.exists", `Note already exists at ${path}.`);
      this.name = "ExistsError";
    }
  }

  function getHash(content: string): string {
    return Bun.hash(content).toString(16);
  }

  function checkDupe(
    project: number,
    hash: string,
    dupe?: boolean,
    id?: number,
  ): void {
    const db = Store.get();
    const existing = db.prepare(Sql.GET_NOTE_BY_HASH).get(project, hash);
    if (!existing) return;

    const note = Row.parse(existing);
    if (id && note.id === id) return;
    if (dupe) return;

    throw new DuplicateError(note.path);
  }

  async function createNote(
    projectId: number,
    path: string,
    content: string,
    contentHash: string,
  ): Promise<Info> {
    const db = Store.get();

    await Model.load();

    const chunks = await Store.chunk(content);

    const inserted = db
      .prepare(Sql.INSERT_NOTE)
      .get(projectId, path, content, contentHash, Date.now()) as {
      id: number;
    };

    if (chunks.length > 0) {
      const texts = chunks.map((c) => c.text);
      const embeddings = await Model.embedBatch(texts);
      Store.saveNoteEmbeddings(inserted.id, chunks, embeddings);
    }

    return {
      id: Id.parse(inserted.id),
      project: Project.Id.parse(projectId),
      path,
      content,
      contentHash,
    };
  }

  async function updateNote(
    id: Id,
    content: string,
    contentHash: string,
  ): Promise<Info> {
    const db = Store.get();

    await Model.load();

    const chunks = await Store.chunk(content);

    const updated = db
      .prepare(Sql.UPDATE_NOTE)
      .get(content, contentHash, Date.now(), id) as {
      id: number;
      project_id: number;
      path: string;
      content: string;
      content_hash: string;
    };

    if (chunks.length > 0) {
      const texts = chunks.map((c) => c.text);
      const embeddings = await Model.embedBatch(texts);
      Store.saveNoteEmbeddings(id, chunks, embeddings);
    } else {
      Store.clearNoteEmbeddings(id);
    }

    return {
      id: Id.parse(updated.id),
      project: Project.Id.parse(updated.project_id),
      path: updated.path,
      content: updated.content,
      contentHash: updated.content_hash,
    };
  }

  export const get = api(
    z.object({
      project: Project.Id,
      path: z.string(),
    }),
    (input): Info => {
      Store.ensure();
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
      Store.ensure();
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

  export const Page = z.object({
    notes: Info.array(),
    nextCursor: z.string().nullable(),
  });
  export type Page = z.infer<typeof Page>;

  export const listByPath = api(
    z.object({
      project: Project.Id,
      path: z.string().optional(),
      limit: z.coerce.number().optional(),
      after: z.string().optional(),
    }),
    (input): Page => {
      Store.ensure();
      Project.get({ id: input.project });
      const db = Store.get();

      const path = input.path ?? "";
      const limit = input.limit ?? 100;
      const after = input.after ?? "";

      const rows = db
        .prepare(Sql.LIST_NOTES_PAGINATED)
        .all(input.project, path, after, limit) as unknown[];

      const notes = rows.map((r) => Row.parse(r));
      const nextCursor =
        notes.length === limit ? notes[notes.length - 1]!.path : null;

      return { notes, nextCursor };
    },
  );

  export const index = api(
    z.object({
      directory: z.string(),
      glob: z.string().optional(),
      project: Project.Id,
    }),
    async (input): Promise<void> => {
      Store.ensure();
      Io.clear();
      const resolved = Project.get({ id: input.project });
      const pattern = input.glob ?? "**/*.md";
      const normalizedDir = normalize(input.directory).replace(/\\/g, "/");
      let prefix = normalizedDir
        .replace(/\/+$/, "")
        .replace(/^\.\//, "")
        .replace(/^\//, "");
      if (prefix === ".") {
        prefix = "";
      }

      const result = await Store.scan(
        input.directory,
        pattern,
        resolved.id,
        prefix,
      );
      await Store.embedFiles(
        input.directory,
        resolved.id,
        result.unembedded,
        prefix,
      );
    },
  );

  export const add = api(
    z.object({
      project: Project.Id,
      path: z.string(),
      content: z.string(),
      dupe: z.boolean().optional(),
    }),
    async (input): Promise<Info> => {
      Store.ensure();
      const project = Project.get({ id: input.project });
      const db = Store.get();

      const contentHash = getHash(input.content);
      checkDupe(project.id, contentHash, input.dupe);

      const existingByPath = db
        .prepare(Sql.GET_NOTE_BY_PATH)
        .get(project.id, input.path);
      if (existingByPath) {
        throw new ExistsError(input.path);
      }

      const info = await createNote(
        project.id,
        input.path,
        input.content,
        contentHash,
      );

      await Bus.publish({ tag: "note.created", info });
      return info;
    },
  );

  export const update = api(
    z.object({
      id: Id,
      content: z.string(),
      dupe: z.boolean().optional(),
    }),
    async (input): Promise<Info> => {
      Store.ensure();
      const db = Store.get();

      const cursor = db.prepare(Sql.GET_NOTE).get(input.id);
      if (!cursor) throw new NotFoundError(`Note not found: ${input.id}`);

      const hash = getHash(input.content);
      const row = Row.parse(cursor);

      if (hash === row.contentHash) {
        await Bus.publish({ tag: "note.updated", info: row });
        return row;
      }

      checkDupe(row.project, hash, input.dupe, input.id);

      const info = await updateNote(input.id, input.content, hash);
      await Bus.publish({ tag: "note.updated", info });
      return info;
    },
  );

  export const upsert = api(
    z.object({
      project: Project.Id,
      path: z.string(),
      content: z.string(),
      dupe: z.boolean().optional(),
    }),
    async (input): Promise<Info> => {
      Store.ensure();
      const db = Store.get();

      // Check if note exists at this path
      const existing = db
        .prepare(Sql.GET_NOTE_BY_PATH)
        .get(input.project, input.path);

      if (existing) {
        // Update existing note
        const existingNote = Row.parse(existing);
        return await update({
          id: existingNote.id,
          content: input.content,
          dupe: input.dupe,
        });
      } else {
        // Create new note
        return await add(input);
      }
    },
  );
}
