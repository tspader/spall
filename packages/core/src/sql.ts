export namespace Sql {
  export const EMBEDDING_DIMS = 768;

  export const CREATE_NOTES_TABLE = `
    CREATE TABLE IF NOT EXISTS notes (
      key TEXT PRIMARY KEY,
      note TEXT NOT NULL
    )
  `;

  export const CREATE_META_TABLE = `
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `;

  export const CREATE_EMBEDDINGS_TABLE = `
    CREATE TABLE IF NOT EXISTS embeddings (
      key TEXT NOT NULL,
      seq INTEGER NOT NULL,
      pos INTEGER NOT NULL,
      PRIMARY KEY (key, seq)
    )
  `;

  export const CREATE_VECTORS_TABLE = `
    CREATE VIRTUAL TABLE IF NOT EXISTS vectors USING vec0(
      key TEXT PRIMARY KEY,
      data float[${EMBEDDING_DIMS}] distance_metric=cosine
    )
  `;

  export const INSERT_META = `
    INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)
  `;

  export const GET_META = `
    SELECT value FROM meta WHERE key = ?
  `;

  export const INSERT_NOTE = `
    INSERT OR REPLACE INTO notes (key, note) VALUES (?, ?)
  `;

  export const GET_NOTE = `
    SELECT note FROM notes WHERE key = ?
  `;

  export const INSERT_EMBEDDING = `
    INSERT OR REPLACE INTO embeddings (key, seq, pos) VALUES (?, ?, ?)
  `;

  export const INSERT_VECTOR = `
    INSERT OR REPLACE INTO vectors (key, data) VALUES (?, ?)
  `;

  export const SEARCH_VECTORS = `
    SELECT key, distance
    FROM vectors
    WHERE data MATCH ? AND k = ?
  `;

  export const GET_EMBEDDINGS_FOR_KEY = `
    SELECT seq, pos FROM embeddings WHERE key = ?
  `;
}
