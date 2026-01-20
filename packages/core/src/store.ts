import { Database } from "bun:sqlite";
import { mkdirSync, existsSync, unlinkSync } from "fs";
import { dirname } from "path";
import * as sqliteVec from "sqlite-vec";
import { Event } from "./event";
import { Sql } from "./sql";

export type Chunk = {
  text: string;
  pos: number;
};

export type VSearchResult = {
  key: string;
  distance: number;
};

export namespace Store {
  let instance: Database | null = null;

  const CHUNK_SIZE = 512;
  const CHUNK_OVERLAP = 64;

  export function get(): Database {
    if (!instance) {
      throw new Error("Store not initialized. Call Store.create() first.");
    }
    return instance;
  }

  export function create(path: string): Database {
    const dir = dirname(path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    // Remove existing db for clean slate
    if (existsSync(path)) {
      unlinkSync(path);
    }

    Event.emit({ tag: "init", action: "create_db", path });
    instance = new Database(path);

    // Load sqlite-vec extension
    sqliteVec.load(instance);

    // Create all tables
    instance.run(Sql.CREATE_NOTES_TABLE);
    instance.run(Sql.CREATE_META_TABLE);
    instance.run(Sql.CREATE_EMBEDDINGS_TABLE);
    instance.run(Sql.CREATE_VECTORS_TABLE);

    // Store metadata
    instance.run(Sql.INSERT_META, ["embedding_model", "embeddinggemma-300M"]);
    instance.run(Sql.INSERT_META, [
      "embedding_dims",
      String(Sql.EMBEDDING_DIMS),
    ]);

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

  export function addNote(key: string, note: string): void {
    const db = get();
    db.run(Sql.INSERT_NOTE, [key, note]);
  }

  export function getNote(key: string): string | null {
    const db = get();
    const row = db.prepare(Sql.GET_NOTE).get(key) as { note: string } | null;
    return row?.note ?? null;
  }

  export function chunk(text: string): Chunk[] {
    if (text.length <= CHUNK_SIZE) {
      return [{ text, pos: 0 }];
    }

    const chunks: Chunk[] = [];
    let pos = 0;

    while (pos < text.length) {
      const end = Math.min(pos + CHUNK_SIZE, text.length);
      chunks.push({ text: text.slice(pos, end), pos });

      if (end >= text.length) break;
      pos = end - CHUNK_OVERLAP;
    }

    return chunks;
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

    // Parse chunk keys back to note keys
    return rows.map((row) => ({
      key: row.key.split(":")[0]!,
      distance: row.distance,
    }));
  }
}
