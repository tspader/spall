export namespace Sql {
  export const EMBEDDING_DIMS = 768;

  export const CREATE_FILES_TABLE = `
    CREATE TABLE IF NOT EXISTS files (
      path TEXT PRIMARY KEY,
      mtime INTEGER NOT NULL,
      embedded INTEGER NOT NULL DEFAULT 0
    )
  `;

  export const CREATE_META_TABLE = `
    CREATE TABLE IF NOT EXISTS meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      embedding_model TEXT NOT NULL,
      embedding_dims INTEGER NOT NULL
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

  export const CREATE_PROJECT_TABLE = `
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      dir TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    )
  `;

  export const CREATE_VECTORS_TABLE = `
    CREATE VIRTUAL TABLE IF NOT EXISTS vectors USING vec0(
      key TEXT PRIMARY KEY,
      data float[${EMBEDDING_DIMS}] distance_metric=cosine
    )
  `;

  export const INSERT_META = `
    INSERT OR REPLACE INTO meta (id, embedding_model, embedding_dims) VALUES (1, ?, ?)
  `;

  export const GET_META = `
    SELECT embedding_model, embedding_dims FROM meta WHERE id = 1
  `;

  export const UPSERT_FILE = `
    INSERT INTO files (path, mtime, embedded) VALUES (?, ?, 0)
    ON CONFLICT(path) DO UPDATE SET mtime = excluded.mtime
  `;

  export const MARK_UNEMBEDDED = `
    UPDATE files SET embedded = 0 WHERE path = ?
  `;

  export const GET_FILE = `
    SELECT mtime, embedded FROM files WHERE path = ?
  `;

  export const MARK_EMBEDDED = `
    UPDATE files SET embedded = 1 WHERE path = ?
  `;

  export const LIST_UNEMBEDDED_FILES = `
    SELECT path FROM files WHERE embedded = 0
  `;

  export const DELETE_FILE = `
    DELETE FROM files WHERE path = ?
  `;

  export const LIST_ALL_FILES = `
    SELECT path FROM files
  `;

  export const INSERT_EMBEDDING = `
    INSERT OR REPLACE INTO embeddings (key, seq, pos) VALUES (?, ?, ?)
  `;

  export const DELETE_EMBEDDINGS = `
    DELETE FROM embeddings WHERE key = ?
  `;

  export const DELETE_VECTORS_BY_PREFIX = `
    DELETE FROM vectors WHERE key LIKE ? || ':%'
  `;

  export const INSERT_VECTOR = `
    INSERT OR REPLACE INTO vectors (key, data) VALUES (?, ?)
  `;

  export const SEARCH_VECTORS = `
    SELECT key, distance
    FROM vectors
    WHERE data MATCH ? AND k = ?
  `;

  export const UPSERT_PROJECT = `
    INSERT INTO projects (name, dir, created_at, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET updated_at = excluded.updated_at
    RETURNING id
  `;

  export const GET_DEFAULT_PROJECT = `
    SELECT id FROM projects WHERE id = 1
  `;

  export const INSERT_DEFAULT_PROJECT = `
    INSERT OR IGNORE INTO projects (id, name, dir, created_at, updated_at) VALUES (1, 'default', '', strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000)
  `;

  export const CREATE_NOTES_TABLE = `
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY,
      project_id INTEGER NOT NULL,
      path TEXT NOT NULL,
      content TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      mtime INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id)
    )
  `;

  export const INSERT_NOTE = `
    INSERT INTO notes (project_id, path, content, content_hash, mtime) VALUES (?, ?, ?, ?, ?) RETURNING id
  `;

  export const GET_NOTE_BY_HASH = `
    SELECT id, project_id, path, content, content_hash, mtime FROM notes WHERE project_id = ? AND content_hash = ?
  `;

  export const GET_NOTE = `
    SELECT id, project_id, path, content, content_hash, mtime FROM notes WHERE id = ?
  `;

  export const GET_PROJECT_BY_NAME = `
    SELECT id, name, dir, created_at, updated_at FROM projects WHERE name = ?
  `;

  export const GET_PROJECT_BY_ID = `
    SELECT id, name, dir, created_at, updated_at FROM projects WHERE id = ?
  `;

  export const GET_NOTE_BY_PATH = `
    SELECT id, project_id, path, content, content_hash, mtime FROM notes WHERE project_id = ? AND path = ?
  `;

  export const LIST_NOTES = `
    SELECT id, path FROM notes WHERE project_id = ?
  `;

  export const COUNT_NOTES = `
    SELECT COUNT(*) as count FROM notes WHERE project_id = ?
  `;

  export const LIST_PROJECTS = `
    SELECT id, name, dir, created_at, updated_at FROM projects
  `;

  export const UPDATE_NOTE = `
    UPDATE notes SET content = ?, content_hash = ?, mtime = ? WHERE id = ? RETURNING id, project_id, path, content, content_hash
  `;
}
