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
  unembedded: string[];
};

function canonicalPath(path: string): string {
  // canonicalize to unix-ish note paths
  let p = path.replace(/\\/g, "/");
  p = p.replace(/\/+$/, "");
  p = p.replace(/^\.\//, "");
  p = p.replace(/^\//, "");
  p = p.replace(/\/+/g, "/");
  return p;
}
export namespace Store {
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
      return db;
    }

    Bus.publish({ tag: "store.create", path: dbPath });
    db = new Database(dbPath);
    configure(db);

    db.run(Sql.CREATE_META_TABLE);
    db.run(Sql.CREATE_VECTORS_TABLE);
    db.run(Sql.CREATE_PROJECT_TABLE);
    db.run(Sql.CREATE_NOTES_TABLE);
    db.run(Sql.CREATE_EMBEDDINGS_TABLE);
    db.run(Sql.CREATE_QUERIES_TABLE);

    db.run(Sql.INSERT_META, ["embeddinggemma-300M", Sql.EMBEDDING_DIMS]);
    db.run(Sql.INSERT_DEFAULT_PROJECT);

    Bus.publish({ tag: "store.created", path: dbPath });

    return db;
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

  // ============================================
  // Chunking & Embedding
  // ============================================

  function findBreakPoint(text: string): number {
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
        const breakOffset = findBreakPoint(chunkText);
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

  function getHash(content: string): string {
    return Bun.hash(content).toString(16);
  }

  export function clearNoteEmbeddings(noteId: number): void {
    const db = get();
    const statements = {
      deleteVectors: db.prepare(Sql.DELETE_VECTORS_BY_NOTE),
      deleteEmbeddings: db.prepare(Sql.DELETE_EMBEDDINGS_BY_NOTE),
    };

    db.transaction(() => {
      statements.deleteVectors.run(noteId);
      statements.deleteEmbeddings.run(noteId);
    })();
  }

  export function saveNoteEmbeddings(
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

  export async function scan(
    dir: string,
    globPattern: string,
    projectId: number,
    prefix: string,
  ): Promise<ScanResult> {
    const glob = new Glob(globPattern);

    const files: string[] = [];
    for await (const file of glob.scan({ cwd: dir, absolute: false })) {
      files.push(file);
    }

    await Bus.publish({ tag: "scan.start", numFiles: files.length });

    const db = get();
    const canonicalPrefix = canonicalPath(prefix);
    const existing = db
      .prepare(Sql.LIST_NOTES_FOR_PROJECT_PREFIX)
      .all(projectId, canonicalPrefix, canonicalPrefix, canonicalPrefix) as {
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

    const seen = new Set<string>();
    const added: string[] = [];
    const modified: string[] = [];
    const removed: string[] = [];

    for (const file of files) {
      const relative = canonicalPath(file);
      const path = canonicalPrefix
        ? `${canonicalPrefix}/${relative}`
        : relative;
      seen.add(path);

      const meta = Io.get(dir, file);
      const note = rows.get(path);

      let status: FileStatus;
      if (!note) {
        added.push(path);
        status = "added";
      } else if (meta.modTime > note.mtime) {
        const content = Io.read(dir, file);
        const hash = getHash(content);
        if (note.content_hash !== hash) {
          modified.push(path);
          status = "modified";
        } else {
          status = "ok";
        }
      } else {
        status = "ok";
      }

      await Bus.publish({
        tag: "scan.progress",
        path: path,
        status: status,
      });
    }

    for (const [path, row] of rows) {
      if (!seen.has(path)) {
        clearNoteEmbeddings(row.id);
        db.run(Sql.DELETE_NOTE, [row.id]);
        removed.push(row.path);
        await Bus.publish({
          tag: "scan.progress",
          path: row.path,
          status: "removed",
        });
      }
    }

    await Bus.publish({ tag: "scan.done", numFiles: files.length });

    const unembedded = [...added, ...modified].map((path) =>
      canonicalPrefix ? path.slice(canonicalPrefix.length + 1) : path,
    );
    return { added, modified, removed, unembedded };
  }

  export async function embedFiles(
    dir: string,
    projectId: number,
    files: string[],
    prefix: string,
  ): Promise<void> {
    if (files.length === 0) return;

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
      getNote: db.prepare(Sql.GET_NOTE_BY_PATH),
      insertNote: db.prepare(Sql.INSERT_NOTE),
      updateNote: db.prepare(Sql.UPDATE_NOTE),
      deleteEmbeddings: db.prepare(Sql.DELETE_EMBEDDINGS_BY_NOTE),
      deleteVectors: db.prepare(Sql.DELETE_VECTORS_BY_NOTE),
      insertEmbedding: db.prepare(Sql.INSERT_EMBEDDING),
      insertVector: db.prepare(Sql.INSERT_VECTOR),
    };

    const canonicalPrefix = canonicalPath(prefix);
    const work: { note: NoteWork; chunks: ChunkWork[] }[] = [];
    for (const file of files) {
      const meta = Io.get(dir, file);
      const content = Io.read(dir, file);
      const chunks = await chunk(content);
      const contentHash = getHash(content);
      const rel = canonicalPath(file);
      const notePath = canonicalPrefix ? `${canonicalPrefix}/${rel}` : rel;
      const existing = statements.getNote.get(projectId, notePath) as {
        id: number;
      } | null;
      let noteId: number;

      if (existing) {
        const updated = statements.updateNote.get(
          content,
          contentHash,
          meta.modTime,
          existing.id,
        ) as { id: number };
        noteId = updated.id;
      } else {
        const inserted = statements.insertNote.get(
          projectId,
          notePath,
          content,
          contentHash,
          meta.modTime,
        ) as { id: number };
        noteId = inserted.id;
      }

      work.push({
        note: { noteId, size: meta.size },
        chunks: chunks.map((c, seq) => ({
          noteId,
          seq,
          pos: c.pos,
          text: c.text,
        })),
      });
    }

    const numFiles = work.length;
    const numBytes = work.reduce((sum, entry) => sum + entry.note.size, 0);
    const numChunks = work.reduce((sum, entry) => sum + entry.chunks.length, 0);
    await Bus.publish({ tag: "embed.start", numFiles, numChunks, numBytes });

    let numFilesProcessed = 0;
    let numBytesProcessed = 0;
    let pendingChunks: ChunkWork[] = [];
    let pendingNotes: NoteWork[] = [];

    const flushBatch = async () => {
      if (pendingChunks.length === 0) return;

      const texts = pendingChunks.map((chunk) => chunk.text);
      const embeddings = await Model.embedBatch(texts);

      db.transaction(() => {
        for (const note of pendingNotes) {
          statements.deleteEmbeddings.run(note.noteId);
          statements.deleteVectors.run(note.noteId);
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
        }

        for (const note of pendingNotes) {
          numBytesProcessed += note.size;
        }

        numFilesProcessed += pendingNotes.length;
      })();

      await Bus.publish({
        tag: "embed.progress",
        numFiles,
        numChunks,
        numBytes,
        numFilesProcessed,
        numBytesProcessed,
      });

      pendingChunks = [];
      pendingNotes = [];
    };

    for (const entry of work) {
      pendingChunks.push(...entry.chunks);
      pendingNotes.push(entry.note);

      if (pendingChunks.length >= BATCH_SIZE) {
        await flushBatch();
      }
    }

    await flushBatch();

    await Bus.publish({ tag: "embed.done", numFiles });
  }
}
