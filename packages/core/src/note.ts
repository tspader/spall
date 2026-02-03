import z from "zod";
import { api } from "./api";
import { Store, canonicalize } from "./store";
import { Model } from "./model";
import { Sql } from "./sql";
import { Corpus } from "./corpus";
import { Bus } from "./event";
import { Error } from "./error";
import { Io } from "./io";

export namespace Note {
  export const Id = z.coerce.number().brand<"NoteId">();
  export type Id = z.infer<typeof Id>;

  export const Info = z.object({
    id: Id,
    corpus: Corpus.Id,
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
      corpus_id: z.number(),
      path: z.string(),
      content: z.string(),
      content_hash: z.string(),
    })
    .transform(
      (r): Info => ({
        id: Id.parse(r.id),
        corpus: Corpus.Id.parse(r.corpus_id),
        path: r.path,
        content: r.content,
        contentHash: r.content_hash,
      }),
    );

  export const Page = z.object({
    notes: Info.array(),
    nextCursor: z.string().nullable(),
  });
  export type Page = z.infer<typeof Page>;

  ////////////
  // ERRORS //
  ////////////
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

  /////////////
  // HELPERS //
  /////////////
  function getHash(content: string): string {
    return Bun.hash(content).toString(16);
  }

  function checkDupe(
    corpus: number,
    hash: string,
    dupe?: boolean,
    id?: number,
  ): void {
    const db = Store.get();
    const existing = db.prepare(Sql.GET_NOTE_BY_HASH).get(corpus, hash);
    if (!existing) return;

    const note = Row.parse(existing);
    if (id && note.id === id) return;
    if (dupe) return;

    throw new DuplicateError(note.path);
  }

  async function createNote(
    corpusId: number,
    path: string,
    content: string,
    contentHash: string,
  ): Promise<Info> {
    const db = Store.get();

    await Model.load();

    const chunks = await Store.chunk(content);

    const inserted = db
      .prepare(Sql.INSERT_NOTE)
      .get(corpusId, path, content, contentHash, Date.now()) as {
      id: number;
    };

    await Store.ftsApply({ upsert: [{ id: inserted.id, content }] });

    if (chunks.length > 0) {
      const texts = chunks.map((c) => c.text);
      const embeddings = await Model.embedBatch(texts);
      Store.saveEmbeddings(inserted.id, chunks, embeddings);
    }

    return {
      id: Id.parse(inserted.id),
      corpus: Corpus.Id.parse(corpusId),
      path,
      content,
      contentHash,
    };
  }

  export const get = api(
    z.object({
      corpus: Corpus.Id,
      path: z.string(),
    }),
    (input): Info => {
      const db = Store.ensure();

      const row = db
        .prepare(Sql.GET_NOTE_BY_PATH)
        .get(input.corpus, input.path);
      if (!row) throw new NotFoundError(`Note not found: ${input.path}`);

      return Row.parse(row);
    },
  );

  export const getById = api(
    z.object({
      id: Id,
    }),
    (input): Info => {
      const db = Store.ensure();

      const row = db.prepare(Sql.GET_NOTE).get(input.id);
      if (!row) throw new NotFoundError(`Note not found: ${input.id}`);

      return Row.parse(row);
    },
  );

  export const getByIds = api(
    z.object({
      ids: z.array(Id),
    }),
    (input): Info[] => {
      const db = Store.ensure();

      const rows = db
        .prepare(Sql.GET_NOTES_BY_IDS)
        .all(JSON.stringify(input.ids)) as unknown[];

      return rows.map((r) => Row.parse(r));
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
      corpus: Corpus.Id,
    }),
    async (input): Promise<ListItem[]> => {
      Corpus.get({ id: input.corpus });
      const db = Store.get();

      const rows = db.prepare(Sql.LIST_NOTES).all(input.corpus) as unknown[];
      return rows.map((r) => ListItemRow.parse(r));
    },
  );

  export const listByPath = api(
    z.object({
      corpus: Corpus.Id,
      path: z.string().optional(),
      limit: z.coerce.number().optional(),
      after: z.string().optional(),
    }),
    (input): Page => {
      const db = Store.ensure();
      Corpus.get({ id: input.corpus });

      const path = input.path ?? "*";
      const limit = input.limit ?? 100;
      const after = input.after ?? "";

      const rows = db
        .prepare(Sql.LIST_NOTES_PAGINATED)
        .all(input.corpus, path, after, limit) as unknown[];

      const notes = rows.map((r) => Row.parse(r));
      const nextCursor =
        notes.length === limit ? notes[notes.length - 1]!.path : null;

      return { notes, nextCursor };
    },
  );

  export const sync = api(
    z.object({
      directory: z.string(),
      glob: z.string().optional(),
      corpus: Corpus.Id,
    }),
    async (input): Promise<void> => {
      Store.ensure();
      Io.clear();
      const resolved = Corpus.get({ id: input.corpus });
      const pattern = input.glob ?? "**/*.md";
      const prefix = canonicalize(input.directory);

      const files = await Store.scan(
        input.directory,
        pattern,
        resolved.id,
        prefix,
      );
      await Store.embedFiles(files.unembedded);
    },
  );

  export const add = api(
    z.object({
      corpus: Corpus.Id,
      path: z.string(),
      content: z.string(),
      dupe: z.boolean().optional(),
    }),
    async (input): Promise<Info> => {
      const db = Store.ensure();
      const corpus = Corpus.get({ id: input.corpus });

      const hash = getHash(input.content);
      checkDupe(corpus.id, hash, input.dupe);

      const existing = db
        .prepare(Sql.GET_NOTE_BY_PATH)
        .get(corpus.id, input.path);
      if (existing) {
        throw new ExistsError(input.path);
      }

      const info = await createNote(corpus.id, input.path, input.content, hash);

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
      const { id, content } = input;

      const db = Store.ensure();

      // just nuke everything and bail early if there's no content
      if (content.length == 0) {
        db.transaction(() => {
          db.run(Sql.DELETE_VECTORS_BY_NOTE, [id]);
          db.run(Sql.DELETE_EMBEDDINGS_BY_NOTE, [id]);
        })();

        const updated = db.prepare(Sql.UPDATE_NOTE).get("", "", Date.now(), id);
        const info = Row.parse(updated);

        await Store.ftsApply({ del: [id] });

        await Bus.publish({ tag: "note.updated", info });

        return info;
      }

      // if there IS content, check against existing content
      const cursor = db.prepare(Sql.GET_NOTE).get(id);
      if (!cursor) throw new NotFoundError(`Note not found: ${id}`);

      const hash = getHash(content);
      const row = Row.parse(cursor);

      if (hash === row.contentHash) {
        await Bus.publish({ tag: "note.updated", info: row });
        return row;
      }

      checkDupe(row.corpus, hash, input.dupe, id);

      // re-embed, store new content
      await Model.load();
      const chunks = await Store.chunk(content);

      const updated = db
        .prepare(Sql.UPDATE_NOTE)
        .get(content, hash, Date.now(), id);

      await Store.ftsApply({ upsert: [{ id, content }] });

      const texts = chunks.map((c) => c.text);
      const embeddings = await Model.embedBatch(texts);
      Store.saveEmbeddings(id, chunks, embeddings);

      const info = Row.parse(updated);

      await Bus.publish({ tag: "note.updated", info });
      return info;
    },
  );

  export const upsert = api(
    z.object({
      corpus: Corpus.Id,
      path: z.string(),
      content: z.string(),
      dupe: z.boolean().optional(),
    }),
    async (input): Promise<Info> => {
      const db = Store.ensure();

      // Check if note exists at this path
      const existing = db
        .prepare(Sql.GET_NOTE_BY_PATH)
        .get(input.corpus, input.path);

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
