import { z } from "zod";
import { Database } from "bun:sqlite";
import { Glob } from "bun";
import { mkdirSync, existsSync } from "fs";
import { join } from "path";
import * as sqliteVec from "sqlite-vec";
import { Bus } from "./event";
import { Sql } from "./sql";
import { Io } from "./io";
import { Model } from "./model";
import { Config } from "./config";
import { FileStatus } from "./schema";
import { Context } from "./context";
import { Error as SpallError } from "./error";

export type Chunk = {
  text: string;
  pos: number;
};

export type VSearchResult = {
  noteId: number;
  chunkId: number;
  distance: number;
};

export type IndexResult = {
  added: string[];
  modified: string[];
  removed: string[];
};

export type ScanResult = IndexResult & {
  unembedded: number[];
};

export function canonicalize(path: string): string {
  let p = path.replace(/\\/g, "/");
  p = p.replace(/\/+$/, "");
  p = p.replace(/^\.\//, "");
  p = p.replace(/^\//, "");
  p = p.replace(/\/+/g, "/");
  if (p === ".") return "";
  return p;
}

export function convertFilePath(prefix: string, file: string): string {
  const relative = canonicalize(file);
  return prefix ? `${prefix}/${relative}` : relative;
}

export namespace Store {
  type Statement = ReturnType<Database["prepare"]>;
  export const Event = {
    Create: Bus.define("store.create", {
      path: z.string(),
    }),
    Created: Bus.define("store.created", {
      path: z.string(),
    }),
    Scan: Bus.define("scan.start", {
      numFiles: z.number(),
    }),
    ScanProgress: Bus.define("scan.progress", {
      path: z.string(),
      status: z.enum(["added", "modified", "removed", "ok"]),
    }),
    Scanned: Bus.define("scan.done", {
      numFiles: z.number(),
    }),
    Embed: Bus.define("embed.start", {
      numFiles: z.number(),
      numChunks: z.number(),
      numBytes: z.number(),
    }),
    EmbedProgress: Bus.define("embed.progress", {
      numFiles: z.number(),
      numChunks: z.number(),
      numBytes: z.number(),
      numFilesProcessed: z.number(),
      numBytesProcessed: z.number(),
    }),
    Embedded: Bus.define("embed.done", {
      numFiles: z.number(),
    }),
    EmbedCancel: Bus.define("embed.cancel", {
      numFiles: z.number(),
      numChunks: z.number(),
      numBytes: z.number(),
      numFilesProcessed: z.number(),
      numBytesProcessed: z.number(),
    }),

    FtsStart: Bus.define("fts.start", {
      numNotes: z.number(),
      numBytes: z.number(),
    }),
    FtsDone: Bus.define("fts.done", {
      numNotes: z.number(),
    }),
  };

  let db: Database | null = null;

  const CHUNK_TOKENS = 512;
  const CHUNK_OVERLAP_TOKENS = 64;
  const DB_NAME = "spall.db";

  function configure(database: Database): void {
    sqliteVec.load(database);
    database.run("PRAGMA foreign_keys = ON");
  }

  export function path(): string {
    return join(Config.get().dirs.data, DB_NAME);
  }

  export function get(): Database {
    if (!db) {
      throw new Error("Store not initialized.");
    }
    return db;
  }

  export function ensure(): Database {
    const dir = Config.get().dirs.data;
    const dbPath = join(dir, DB_NAME);

    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const dbExists = existsSync(dbPath);

    if (dbExists) {
      db = new Database(dbPath);
      configure(db);

      // Keep newer tables available even if the DB already exists.
      db.run(Sql.CREATE_WORKSPACES_TABLE);
      db.run(Sql.CREATE_CORPORA_TABLE);
      db.run(Sql.CREATE_STAGING_TABLE);
      db.exec(Sql.CREATE_STAGING_INDEXES);
      db.run(Sql.CREATE_COMMITTED_TABLE);
      db.exec(Sql.CREATE_COMMITTED_INDEXES);

      return db;
    }

    Bus.publish({ tag: "store.create", path: dbPath });
    db = new Database(dbPath);
    configure(db);

    db.run(Sql.CREATE_META_TABLE);
    db.run(Sql.CREATE_VECTORS_TABLE);
    db.run(Sql.CREATE_WORKSPACES_TABLE);
    db.run(Sql.CREATE_CORPORA_TABLE);
    db.run(Sql.CREATE_NOTES_TABLE);
    try {
      db.run(Sql.CREATE_NOTES_FTS_TABLE);
    } catch (e: any) {
      throw new SpallError.SpallError(
        "fts.unavailable",
        `FTS5 is not available in this SQLite build: ${String(e?.message ?? e)}`,
      );
    }
    db.run(Sql.CREATE_EMBEDDINGS_TABLE);
    db.run(Sql.CREATE_FILES_TABLE);
    db.run(Sql.CREATE_QUERIES_TABLE);
    db.run(Sql.CREATE_STAGING_TABLE);
    db.exec(Sql.CREATE_STAGING_INDEXES);
    db.run(Sql.CREATE_COMMITTED_TABLE);
    db.exec(Sql.CREATE_COMMITTED_INDEXES);

    db.run(Sql.INSERT_META, ["embeddinggemma-300M", Sql.EMBEDDING_DIMS]);
    db.run(Sql.INSERT_DEFAULT_WORKSPACE);
    db.run(Sql.INSERT_DEFAULT_CORPUS);

    Bus.publish({ tag: "store.created", path: dbPath });

    return db;
  }

  export type FtsUpsert = { id: number; content: string };

  export async function ftsApply(input: {
    upsert?: FtsUpsert[];
    del?: number[];
  }): Promise<void> {
    const upsert = input.upsert ?? [];
    const del = input.del ?? [];
    const numNotes = upsert.length + del.length;
    if (numNotes === 0) return;

    const numBytes = upsert.reduce((sum, n) => sum + n.content.length, 0);
    await Bus.publish({ tag: "fts.start", numNotes, numBytes });

    const db = get();
    const statements = {
      upsert: db.prepare(Sql.UPSERT_NOTE_FTS),
      del: db.prepare(Sql.DELETE_NOTE_FTS),
    };

    db.transaction(() => {
      for (const n of upsert) statements.upsert.run(n.id, n.content);
      for (const id of del) statements.del.run(id);
    })();

    await Bus.publish({ tag: "fts.done", numNotes });
  }

  export function open(dbPath?: string): Database {
    const p = dbPath ?? Store.path();
    if (!existsSync(p)) {
      throw new Error(`Database not found at ${p}.`);
    }

    db = new Database(p);
    configure(db);
    return db;
  }

  export function close(): void {
    if (db) {
      db.close();
      db = null;
    }
  }

  function findBreak(text: string): number {
    const searchStart = Math.floor(text.length * 0.7);
    const searchSlice = text.slice(searchStart);

    const paragraphBreak = searchSlice.lastIndexOf("\n\n");
    if (paragraphBreak >= 0) {
      return searchStart + paragraphBreak + 2;
    }

    const sentenceEnd = Math.max(
      searchSlice.lastIndexOf(". "),
      searchSlice.lastIndexOf(".\n"),
      searchSlice.lastIndexOf("? "),
      searchSlice.lastIndexOf("?\n"),
      searchSlice.lastIndexOf("! "),
      searchSlice.lastIndexOf("!\n"),
    );
    if (sentenceEnd >= 0) {
      return searchStart + sentenceEnd + 2;
    }

    const lineBreak = searchSlice.lastIndexOf("\n");
    if (lineBreak >= 0) {
      return searchStart + lineBreak + 1;
    }

    return -1;
  }

  export async function chunk(text: string): Promise<Chunk[]> {
    const allTokens = await Model.tokenize(text);
    const totalTokens = allTokens.length;

    if (totalTokens <= CHUNK_TOKENS) {
      return [{ text, pos: 0 }];
    }

    const chunks: Chunk[] = [];
    const step = CHUNK_TOKENS - CHUNK_OVERLAP_TOKENS;
    const avgCharsPerToken = text.length / totalTokens;
    let tokenPos = 0;

    while (tokenPos < totalTokens) {
      const chunkEnd = Math.min(tokenPos + CHUNK_TOKENS, totalTokens);
      const chunkTokens = allTokens.slice(tokenPos, chunkEnd);
      let chunkText = await Model.detokenize(chunkTokens);

      if (chunkEnd < totalTokens) {
        const breakOffset = findBreak(chunkText);
        if (breakOffset > 0) {
          chunkText = chunkText.slice(0, breakOffset);
        }
      }

      const charPos = Math.floor(tokenPos * avgCharsPerToken);
      chunks.push({ text: chunkText, pos: charPos });

      if (chunkEnd >= totalTokens) break;
      tokenPos += step;
    }

    return chunks;
  }

  function calcHash(content: string): string {
    return Bun.hash(content).toString(16);
  }

  function getHash(absPath: string): string {
    const db = get();
    const meta = Io.getFile(absPath);

    const row = db.prepare(Sql.GET_FILE_HASH).get(absPath, meta.modTime) as {
      content_hash: string;
    } | null;
    if (row) return row.content_hash;

    const content = Io.readFile(absPath);
    const hash = calcHash(content);
    db.run(Sql.UPSERT_FILE_HASH, [absPath, hash, meta.modTime]);
    return hash;
  }

  export function saveEmbeddings(
    noteId: number,
    chunks: Chunk[],
    vectors: number[][],
  ): void {
    if (chunks.length !== vectors.length) {
      throw new Error(
        `Mismatched chunks/vectors: ${chunks.length} chunks, ${vectors.length} vectors`,
      );
    }

    const db = get();
    const statements = {
      deleteVectors: db.prepare(Sql.DELETE_VECTORS_BY_NOTE),
      deleteEmbeddings: db.prepare(Sql.DELETE_EMBEDDINGS_BY_NOTE),
      insertEmbedding: db.prepare(Sql.INSERT_EMBEDDING),
      insertVector: db.prepare(Sql.INSERT_VECTOR),
    };

    db.transaction(() => {
      statements.deleteVectors.run(noteId);
      statements.deleteEmbeddings.run(noteId);

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]!;
        const vector = vectors[i]!;
        const inserted = statements.insertEmbedding.get(
          noteId,
          i,
          chunk.pos,
        ) as { id: number };

        statements.insertVector.run(
          String(inserted.id),
          new Float32Array(vector),
        );
      }
    })();
  }

  export function vsearch(
    queryVector: number[],
    limit: number = 10,
  ): VSearchResult[] {
    const db = get();
    const rows = db
      .prepare(Sql.SEARCH_VECTORS)
      .all(new Float32Array(queryVector), limit) as {
      key: string;
      note_id: number;
      distance: number;
    }[];

    return rows.map((row) => ({
      noteId: row.note_id,
      chunkId: Number(row.key),
      distance: row.distance,
    }));
  }

  // ============================================
  // Indexing
  // ============================================

  const BATCH_SIZE = 16;

  export class UnknownNoteError extends SpallError.SpallError {
    constructor(id: number) {
      super("embed.unknown", `Note ${id} was not found`);
      this.name = "UnknownNoteError";
    }
  }

  export class CancelledError extends SpallError.SpallError {
    constructor(message: string = "Cancelled") {
      super("request.cancelled", message);
      this.name = "CancelledError";
    }
  }

  export async function scan(
    dir: string,
    globPattern: string,
    corpusId: number,
    prefix: string,
  ): Promise<ScanResult> {
    // find all files on the filesystem which match the glob
    const glob = new Glob(globPattern);

    const files: string[] = [];
    for await (const file of glob.scan({ cwd: dir, absolute: false })) {
      files.push(file);
    }

    await Bus.publish({ tag: "scan.start", numFiles: files.length });

    // find all existing notes which match this path
    const db = get();

    const canonicalPrefix = canonicalize(prefix);
    const existing = db
      .prepare(Sql.LIST_NOTES_FOR_CORPUS_PREFIX)
      .all(corpusId, canonicalPrefix, canonicalPrefix, canonicalPrefix) as {
      id: number;
      path: string;
      mtime: number;
      content_hash: string;
    }[];

    const rows = new Map(
      existing.map((r) => [
        r.path,
        {
          id: r.id,
          path: r.path,
          mtime: r.mtime,
          content_hash: r.content_hash,
        },
      ]),
    );

    // bucket every note, make sure tables are clean for embedding
    const seen = new Set<string>();
    const added: string[] = [];
    const modified: string[] = [];
    const removed: string[] = [];
    const unembedded: number[] = [];
    const ftsUpsert: FtsUpsert[] = [];
    const ftsDelete: number[] = [];

    const statements = {
      insertNote: db.prepare(Sql.INSERT_NOTE),
      updateNote: db.prepare(Sql.UPDATE_NOTE),
      updateMtime: db.prepare(Sql.UPDATE_NOTE_MTIME),
      delete: {
        embeddings: db.prepare(Sql.DELETE_EMBEDDINGS_BY_NOTE),
        vectors: db.prepare(Sql.DELETE_VECTORS_BY_NOTE),
        note: db.prepare(Sql.DELETE_NOTE),
      },
    };

    Context.setYield(32);

    for (const file of files) {
      if (await Context.checkpoint()) {
        Embed.cancel();
        throw new CancelledError();
      }

      const path = convertFilePath(canonicalPrefix, file);
      seen.add(path);

      const meta = Io.get(dir, file);
      const absPath = join(dir, file);
      const hash = getHash(absPath);
      let status: FileStatus;

      const note = rows.get(path);
      if (!note) {
        // if it's not in the db, it's new
        const content = Io.read(dir, file);
        added.push(path);
        status = "added";

        const inserted = statements.insertNote.get(
          corpusId,
          path,
          content,
          hash,
          meta.modTime,
        ) as { id: number };

        unembedded.push(inserted.id);
        ftsUpsert.push({ id: inserted.id, content });
      } else {
        // if it IS in the db, make sure all our tables are up-to-date and that any
        // stale embeddings are cleared
        if (note.content_hash == hash) {
          if (note.mtime !== meta.modTime) {
            statements.updateMtime.run(meta.modTime, note.id);
          }

          status = "ok";
          continue;
        }

        const content = Io.read(dir, file);

        db.transaction(() => {
          statements.delete.vectors.run(note.id);
          statements.delete.embeddings.run(note.id);

          const updated = statements.updateNote.get(
            content,
            hash,
            meta.modTime,
            note.id,
          ) as { id: number };

          unembedded.push(updated.id);
        })();

        ftsUpsert.push({ id: note.id, content });

        modified.push(path);
        status = "modified";
      }

      await Bus.publish({
        tag: "scan.progress",
        path: path,
        status: status,
      });
    }

    // delete anything which was in the db under the path, but not on the fs
    Context.setYield(32);

    for (const [path, row] of rows) {
      if (await Context.checkpoint()) throw new CancelledError();
      if (seen.has(path)) continue;

      db.transaction(() => {
        statements.delete.vectors.run(row.id);
        statements.delete.embeddings.run(row.id);
        statements.delete.note.run(row.id);
      })();

      ftsDelete.push(row.id);

      removed.push(row.path);

      await Bus.publish({
        tag: "scan.progress",
        path: row.path,
        status: "removed",
      });
    }

    // done!
    await Bus.publish({ tag: "scan.done", numFiles: files.length });

    await ftsApply({ upsert: ftsUpsert, del: ftsDelete });

    return { added, modified, removed, unembedded };
  }

  namespace Embed {
    export type Metadata = {
      numFiles: number;
      numChunks: number;
      numBytes: number;
      numFilesProcessed: number;
      numBytesProcessed: number;
    };

    export async function cancel(metadata?: Metadata) {
      metadata = metadata ?? {
        numFiles: 0,
        numChunks: 0,
        numBytes: 0,
        numFilesProcessed: 0,
        numBytesProcessed: 0,
      };
      await Bus.publish({
        tag: "embed.cancel",
        ...metadata,
      });
    }

    export async function progress(metadata: Metadata) {
      await Bus.publish({
        tag: "embed.progress",
        ...metadata,
      });
    }
  }

  export async function embedFiles(ids: number[]): Promise<void> {
    if (ids.length === 0) return;

    const metadata: Embed.Metadata = {
      numFiles: ids.length,
      numChunks: 0,
      numBytes: 0,
      numFilesProcessed: 0,
      numBytesProcessed: 0,
    };

    if (Context.aborted()) {
      await Embed.cancel(metadata);
      return;
    }

    await Model.load();

    // tokenize and chunk each file
    type ChunkWork = {
      noteId: number;
      seq: number;
      pos: number;
      text: string;
    };
    type NoteWork = { noteId: number; size: number };

    const db = get();
    const statements = {
      getNote: db.prepare(Sql.GET_NOTE),
      deleteEmbeddings: db.prepare(Sql.DELETE_EMBEDDINGS_BY_NOTE),
      deleteVectors: db.prepare(Sql.DELETE_VECTORS_BY_NOTE),
      insertEmbedding: db.prepare(Sql.INSERT_EMBEDDING),
      insertVector: db.prepare(Sql.INSERT_VECTOR),
    };

    const work: { note: NoteWork; chunks: ChunkWork[] }[] = [];

    Context.setYield(8);

    for (const id of ids) {
      if (await Context.checkpoint()) {
        await Embed.cancel(metadata);
        return;
      }

      const row = statements.getNote.get(id) as {
        id: number;
        content: string;
      } | null;
      if (!row) throw new UnknownNoteError(id);

      const content = row.content;

      const chunks = await chunk(content);

      work.push({
        note: { noteId: row.id, size: content.length },
        chunks: chunks.map((c, seq) => ({
          noteId: row.id,
          seq,
          pos: c.pos,
          text: c.text,
        })),
      });
    }

    // embed, in batches, checking occasionally for cancellation
    metadata.numFiles = work.length;
    metadata.numBytes = work.reduce(
      (sum, entry) => sum + entry.chunks.reduce((s, c) => s + c.text.length, 0),
      0,
    );
    metadata.numChunks = work.reduce(
      (sum, entry) => sum + entry.chunks.length,
      0,
    );
    await Bus.publish({
      tag: "embed.start",
      numFiles: metadata.numFiles,
      numChunks: metadata.numChunks,
      numBytes: metadata.numBytes,
    });

    let pendingChunks: ChunkWork[] = [];
    let pendingNotes: NoteWork[] = [];

    const flushBatch = async () => {
      if (pendingChunks.length === 0) return;

      if (Context.aborted()) return;

      const texts = pendingChunks.map((chunk) => chunk.text);
      const embeddings = await Model.embedBatch(texts);

      if (Context.aborted()) return;

      db.transaction(() => {
        for (const note of pendingNotes) {
          statements.deleteVectors.run(note.noteId);
          statements.deleteEmbeddings.run(note.noteId);
        }

        for (let j = 0; j < pendingChunks.length; j++) {
          const c = pendingChunks[j]!;
          const inserted = statements.insertEmbedding.get(
            c.noteId,
            c.seq,
            c.pos,
          ) as { id: number };
          statements.insertVector.run(
            String(inserted.id),
            new Float32Array(embeddings[j]!),
          );
          metadata.numBytesProcessed += c.text.length;
        }

        metadata.numFilesProcessed += pendingNotes.length;
      })();

      await Embed.progress(metadata);

      pendingChunks = [];
      pendingNotes = [];
    };

    Context.setYield(8);

    for (const entry of work) {
      if (await Context.checkpoint()) {
        await Embed.cancel(metadata);
        return;
      }

      pendingChunks.push(...entry.chunks);
      pendingNotes.push(entry.note);

      if (pendingChunks.length >= BATCH_SIZE) {
        await flushBatch();
      }
    }

    await flushBatch();

    if (Context.aborted()) {
      await Embed.cancel(metadata);
      return;
    }

    await Bus.publish({ tag: "embed.done", numFiles: metadata.numFiles });
  }
}
