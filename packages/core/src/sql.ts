export namespace Sql {
  export const EMBEDDING_DIMS = 768;

  export const CREATE_META_TABLE = `
    CREATE TABLE IF NOT EXISTS meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      embedding_model TEXT NOT NULL,
      embedding_dims INTEGER NOT NULL
    )
  `;

  export const CREATE_PROJECT_TABLE = `
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    )
  `;

  export const CREATE_NOTES_TABLE = `
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY,
      project_id INTEGER NOT NULL,
      path TEXT NOT NULL,
      content TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      mtime INTEGER NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id),
      UNIQUE (project_id, path)
    )
  `;

  export const CREATE_EMBEDDINGS_TABLE = `
    CREATE TABLE IF NOT EXISTS embeddings (
      id INTEGER PRIMARY KEY,
      note_id INTEGER NOT NULL,
      seq INTEGER NOT NULL,
      pos INTEGER NOT NULL,
      FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
      UNIQUE (note_id, seq)
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

  export const INSERT_EMBEDDING = `
    INSERT INTO embeddings (note_id, seq, pos) VALUES (?, ?, ?) RETURNING id
  `;

  export const DELETE_EMBEDDINGS_BY_NOTE = `
    DELETE FROM embeddings WHERE note_id = ?
  `;

  export const DELETE_VECTORS_BY_NOTE = `
    DELETE FROM vectors WHERE key IN (
      SELECT CAST(id AS TEXT) FROM embeddings WHERE note_id = ?
    )
  `;

  export const INSERT_VECTOR = `
    INSERT OR REPLACE INTO vectors (key, data) VALUES (?, ?)
  `;

  export const SEARCH_VECTORS = `
    SELECT vectors.key, embeddings.note_id, distance
    FROM vectors
    JOIN embeddings ON embeddings.id = CAST(vectors.key AS INTEGER)
    WHERE data MATCH ? AND k = ?
  `;

  export const UPSERT_PROJECT = `
    INSERT INTO projects (name, created_at, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET updated_at = excluded.updated_at
    RETURNING id
  `;

  export const GET_DEFAULT_PROJECT = `
    SELECT id FROM projects WHERE id = 1
  `;

  export const INSERT_DEFAULT_PROJECT = `
    INSERT OR IGNORE INTO projects (id, name, created_at, updated_at) VALUES (1, 'default', strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000)
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
    SELECT id, name, created_at, updated_at FROM projects WHERE name = ?
  `;

  export const GET_PROJECT_BY_ID = `
    SELECT id, name, created_at, updated_at FROM projects WHERE id = ?
  `;

  export const GET_NOTE_BY_PATH = `
    SELECT id, project_id, path, content, content_hash, mtime FROM notes WHERE project_id = ? AND path = ?
  `;

  export const LIST_NOTES = `
    SELECT id, path FROM notes WHERE project_id = ?
  `;

  export const LIST_NOTES_FOR_PROJECT_PREFIX = `
    SELECT id, path, mtime, content_hash
    FROM notes
    WHERE project_id = ?
      AND (
        ? = ''
        OR path = ?
        OR path LIKE ? || '/%'
      )
  `;

  export const COUNT_NOTES = `
    SELECT COUNT(*) as count FROM notes WHERE project_id = ?
  `;

  export const LIST_PROJECTS = `
    SELECT id, name, created_at, updated_at FROM projects
  `;

  export const DELETE_PROJECT = `
    DELETE FROM projects WHERE id = ?
  `;

  export const UPDATE_NOTE = `
    UPDATE notes SET content = ?, content_hash = ?, mtime = ? WHERE id = ? RETURNING id, project_id, path, content, content_hash
  `;

  export const UPDATE_NOTE_MTIME = `
    UPDATE notes SET mtime = ? WHERE id = ?
  `;

  export const DELETE_NOTE = `
    DELETE FROM notes WHERE id = ?
  `;

  export const DELETE_VECTORS_BY_PROJECT = `
    DELETE FROM vectors WHERE key IN (
      SELECT CAST(e.id AS TEXT) FROM embeddings e
      JOIN notes n ON e.note_id = n.id
      WHERE n.project_id = ?
    )
  `;

  export const DELETE_NOTES_BY_PROJECT = `
    DELETE FROM notes WHERE project_id = ?
  `;

  export const LIST_NOTES_PAGINATED = `
    SELECT id, project_id, path, content, content_hash
    FROM notes
    WHERE project_id = ? AND path GLOB ? AND path > ?
    ORDER BY path
    LIMIT ?
  `;

  export const CREATE_FILES_TABLE = `
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY,
      path TEXT NOT NULL UNIQUE,
      content_hash TEXT NOT NULL,
      mtime INTEGER NOT NULL
    )
  `;

  export const GET_FILE_HASH = `
    SELECT content_hash FROM files WHERE path = ? AND mtime = ?
  `;

  export const UPSERT_FILE_HASH = `
    INSERT INTO files (path, content_hash, mtime) VALUES (?, ?, ?)
    ON CONFLICT(path) DO UPDATE SET content_hash = excluded.content_hash, mtime = excluded.mtime
  `;

  export const CREATE_QUERIES_TABLE = `
    CREATE TABLE IF NOT EXISTS queries (
      id INTEGER PRIMARY KEY,
      projects TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `;

  export const INSERT_QUERY = `
    INSERT INTO queries (projects, created_at) VALUES (?, ?) RETURNING id, projects, created_at
  `;

  export const GET_QUERY = `
    SELECT id, projects, created_at FROM queries WHERE id = ?
  `;

  export const LIST_QUERY_NOTES_PAGINATED = `
    SELECT id, project_id, path, content, content_hash
    FROM notes
    WHERE project_id IN (SELECT value FROM json_each(?))
      AND path GLOB ?
      AND path > ?
    ORDER BY path
    LIMIT ?
  `;
}
