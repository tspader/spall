import { Database } from "bun:sqlite";
import { mkdirSync, existsSync, unlinkSync } from "fs";
import { dirname } from "path";
import { file, Glob } from "bun";
import * as sqliteVec from "sqlite-vec";
import { Bus, FileStatus } from "./event";
import { Sql } from "./sql";
import { Io } from "./io";
import { Model } from "./model";

export type Chunk = {
  text: string;
  pos: number;
};

export type VSearchResult = {
  key: string;
  distance: number;
};

export type FileRecord = {
  mtime: number;
  embedded: boolean;
};

export type IndexResult = {
  added: string[];
  modified: string[];
  removed: string[];
};

export type ScanResult = IndexResult & {
  unembedded: string[];
};

export namespace Store {
  let instance: Database | null = null;

  const CHUNK_TOKENS = 512;
  const CHUNK_OVERLAP_TOKENS = 64;

  export function get(): Database {
    if (!instance) {
      throw new Error("Store not initialized. Call Store.create() first.");
    }
    return instance;
  }

  export async function create(path: string): Promise<Database> {
    const dir = dirname(path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Remove existing db for clean slate
    if (existsSync(path)) {
      unlinkSync(path);
    }

    await Bus.emit({ tag: "init", action: "create_db", path });
    instance = new Database(path);

    // Load sqlite-vec extension
    sqliteVec.load(instance);

    // Create all tables
    instance.run(Sql.CREATE_FILES_TABLE);
    instance.run(Sql.CREATE_META_TABLE);
    instance.run(Sql.CREATE_EMBEDDINGS_TABLE);
    instance.run(Sql.CREATE_VECTORS_TABLE);

    // Store metadata
    instance.run(Sql.INSERT_META, ["embeddinggemma-300M", Sql.EMBEDDING_DIMS]);

    return instance;
  }

  export function open(path: string): Database {
    if (!existsSync(path)) {
      throw new Error(`Database not found at ${path}. Run 'spall init' first.`);
    }
    instance = new Database(path);
    sqliteVec.load(instance);
    return instance;
  }

  export function close(): void {
    if (instance) {
      instance.close();
      instance = null;
    }
  }

  // ============================================
  // File Operations
  // ============================================

  export function getFile(path: string): FileRecord | null {
    const db = get();
    const row = db.prepare(Sql.GET_FILE).get(path) as {
      mtime: number;
      embedded: number;
    } | null;
    return row ? { mtime: row.mtime, embedded: row.embedded === 1 } : null;
  }

  export function markEmbedded(path: string): void {
    const db = get();
    db.run(Sql.MARK_EMBEDDED, [path]);
  }

  export function markUnembedded(path: string): void {
    const db = get();
    db.run(Sql.MARK_UNEMBEDDED, [path]);
  }

  export function listUnembeddedFiles(): string[] {
    const db = get();
    const rows = db.prepare(Sql.LIST_UNEMBEDDED_FILES).all() as {
      path: string;
    }[];
    return rows.map((r) => r.path);
  }

  export function upsertFile(path: string, mtime: number): void {
    const db = get();
    db.run(Sql.UPSERT_FILE, [path, mtime]);
  }

  export function removeFile(path: string): void {
    const db = get();

    // Remove embeddings and vectors first
    db.run(Sql.DELETE_EMBEDDINGS, [path]);
    db.run(Sql.DELETE_VECTORS_BY_PREFIX, [path]);

    // Remove file record
    db.run(Sql.DELETE_FILE, [path]);
  }

  export function listAllFiles(): string[] {
    const db = get();
    const rows = db.prepare(Sql.LIST_ALL_FILES).all() as { path: string }[];
    return rows.map((r) => r.path);
  }

  // ============================================
  // Chunking & Embedding
  // ============================================

  /**
   * Find a natural break point in the last 30% of text.
   * Prefers: paragraph > sentence > line > word boundary.
   * Returns the offset from the start of searchSlice, or -1 if none found.
   */
  function findBreakPoint(text: string): number {
    const searchStart = Math.floor(text.length * 0.7);
    const searchSlice = text.slice(searchStart);

    // Try paragraph break (double newline)
    const paragraphBreak = searchSlice.lastIndexOf("\n\n");
    if (paragraphBreak >= 0) {
      return searchStart + paragraphBreak + 2;
    }

    // Try sentence end
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

    // Try line break
    const lineBreak = searchSlice.lastIndexOf("\n");
    if (lineBreak >= 0) {
      return searchStart + lineBreak + 1;
    }

    // No good break point found
    return -1;
  }

  /**
   * Chunk text by token count using the embedding model's tokenizer.
   * Finds natural break points (paragraph/sentence/line) for cleaner chunks.
   */
  export async function chunk(text: string): Promise<Chunk[]> {
    const allTokens = await Model.tokenize(text);
    const totalTokens = allTokens.length;

    // Small enough to be a single chunk
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

      // Find a natural break point if not at end of document
      if (chunkEnd < totalTokens) {
        const breakOffset = findBreakPoint(chunkText);
        if (breakOffset > 0) {
          chunkText = chunkText.slice(0, breakOffset);
        }
      }

      // Approximate character position based on token position
      const charPos = Math.floor(tokenPos * avgCharsPerToken);
      chunks.push({ text: chunkText, pos: charPos });

      // Done if we've reached the end
      if (chunkEnd >= totalTokens) break;

      // Advance by step tokens
      tokenPos += step;
    }

    return chunks;
  }

  export function clearEmbeddings(key: string): void {
    const db = get();
    db.run(Sql.DELETE_EMBEDDINGS, [key]);
    db.run(Sql.DELETE_VECTORS_BY_PREFIX, [key]);
  }

  export function embed(
    key: string,
    seq: number,
    pos: number,
    vector: number[],
  ): void {
    const db = get();
    const chunkKey = `${key}:${seq}`;

    db.run(Sql.INSERT_EMBEDDING, [key, seq, pos]);
    db.run(Sql.INSERT_VECTOR, [chunkKey, new Float32Array(vector)]);
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
      distance: number;
    }[];

    // Parse chunk keys back to file keys
    return rows.map((row) => ({
      key: row.key.split(":")[0]!,
      distance: row.distance,
    }));
  }

  // ============================================
  // Indexing
  // ============================================

  const BATCH_SIZE = 16;

  export async function scan(dir: string): Promise<ScanResult> {
    const glob = new Glob("**/*.md");

    // First pass: count total files
    const allFiles: string[] = [];
    for await (const file of glob.scan({ cwd: dir, absolute: false })) {
      allFiles.push(file);
    }

    await Bus.emit({ tag: "scan", action: "start", total: allFiles.length });

    const diskFiles = new Set<string>();
    const added: string[] = [];
    const modified: string[] = [];
    const removed: string[] = [];

    // Second pass: check each file's status
    for (const file of allFiles) {
      diskFiles.add(file);
      const meta = Io.get(dir, file);
      const existing = getFile(file);

      let status: FileStatus;
      if (!existing) {
        upsertFile(file, meta.modTime);
        added.push(file);
        status = FileStatus.Added;
      } else if (meta.modTime > existing.mtime) {
        upsertFile(file, meta.modTime);
        clearEmbeddings(file);
        markUnembedded(file);
        modified.push(file);
        status = FileStatus.Modified;
      } else {
        status = FileStatus.Ok;
      }

      await Bus.emit({ tag: "scan", action: "progress", path: file, status });
    }

    // Check for deleted files
    const dbFiles = listAllFiles();
    for (const file of dbFiles) {
      if (!diskFiles.has(file)) {
        removeFile(file);
        removed.push(file);
        await Bus.emit({
          tag: "scan",
          action: "progress",
          path: file,
          status: FileStatus.Removed,
        });
      }
    }

    await Bus.emit({ tag: "scan", action: "done" });

    const unembedded = listUnembeddedFiles();
    return { added, modified, removed, unembedded };
  }

  export async function embedFiles(
    dir: string,
    files: string[],
  ): Promise<void> {
    if (files.length === 0) return;

    await Model.load();

    // tokenize and chunk each file
    type ChunkWork = { key: string; seq: number; pos: number; text: string };
    type FileWork = { key: string; size: number; chunks: ChunkWork[] };

    const work: FileWork[] = [];
    for (const file of files) {
      const meta = Io.get(dir, file);
      const content = Io.read(dir, file);
      const chunks = await chunk(content);

      work.push({
        key: file,
        size: meta.size,
        chunks: chunks.map((c, seq) => ({
          key: file,
          seq,
          pos: c.pos,
          text: c.text,
        })),
      });
    }

    const totalBytes = work.reduce((sum, file) => sum + file.size, 0);
    const totalChunks = work.reduce((sum, file) => sum + file.chunks.length, 0);
    await Bus.emit({
      tag: "embed",
      action: "start",
      totalDocs: work.length,
      totalChunks,
      totalBytes,
    });

    // prepare statements up front
    const db = get();
    const statements = {
      embedding: {
        delete: db.prepare(Sql.DELETE_EMBEDDINGS),
        insert: db.prepare(Sql.INSERT_EMBEDDING),
      },
      vector: {
        delete: db.prepare(Sql.DELETE_VECTORS_BY_PREFIX),
        insert: db.prepare(Sql.INSERT_VECTOR),
      },
      file: {
        markEmbedded: db.prepare(Sql.MARK_EMBEDDED),
      },
    };

    //
    let filesProcessed = 0;
    let bytesProcessed = 0;
    let pendingChunks: ChunkWork[] = [];
    let pendingFiles: FileWork[] = [];

    const flushBatch = async () => {
      if (pendingChunks.length === 0) return;

      const texts = pendingChunks.map((chunk) => chunk.text);
      const embeddings = await Model.embedBatch(texts);

      db.transaction(() => {
        for (const file of pendingFiles) {
          statements.embedding.delete.run(file.key);
          statements.vector.delete.run(file.key);
        }

        for (let j = 0; j < pendingChunks.length; j++) {
          const c = pendingChunks[j]!;
          const chunkKey = `${c.key}:${c.seq}`;
          statements.embedding.insert.run(c.key, c.seq, c.pos);
          statements.vector.insert.run(
            chunkKey,
            new Float32Array(embeddings[j]!),
          );
        }

        for (const file of pendingFiles) {
          statements.file.markEmbedded.run(file.key);
          bytesProcessed += file.size;
        }

        filesProcessed += pendingFiles.length;
      })();

      await Bus.emit({
        tag: "embed",
        action: "progress",
        filesProcessed: filesProcessed,
        totalFiles: work.length,
        bytesProcessed,
        totalBytes,
      });

      pendingChunks = [];
      pendingFiles = [];
    };

    for (const file of work) {
      pendingChunks.push(...file.chunks);
      pendingFiles.push(file);

      if (pendingChunks.length >= BATCH_SIZE) {
        await flushBatch();
      }
    }

    await flushBatch();

    await Bus.emit({ tag: "embed", action: "done" });
  }
}
