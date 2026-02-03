export namespace Sql {
  export const EMBEDDING_DIMS = 768;

  export const CREATE_NOTES_FTS_TABLE = `
    CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
      content,
      tokenize='unicode61 tokenchars _',
      prefix='2 3 4'
    )
  `;

  export const UPSERT_NOTE_FTS = `
    INSERT OR REPLACE INTO notes_fts(rowid, content) VALUES (?, ?)
  `;

  export const DELETE_NOTE_FTS = `
    DELETE FROM notes_fts WHERE rowid = ?
  `;

  export const DELETE_NOTE_FTS_BY_CORPUS = `
    DELETE FROM notes_fts WHERE rowid IN (
      SELECT id FROM notes WHERE corpus_id = ?
    )
  `;

  export const SEARCH_QUERY_FTS = `
    SELECT
      n.id,
      n.corpus_id,
      n.path,
      snippet(notes_fts, 0, char(1), char(2), ' ... ', 16) AS snippet,
      2.0 * (1.0 / (1.0 + exp(bm25(notes_fts) * 0.3))) - 1.0 AS score
    FROM notes_fts
    JOIN notes n ON n.id = notes_fts.rowid
    WHERE notes_fts MATCH ?
      AND n.corpus_id IN (SELECT value FROM json_each(?))
      AND n.path GLOB ?
    ORDER BY score DESC
    LIMIT ?
  `;

  export const CREATE_META_TABLE = `
    CREATE TABLE IF NOT EXISTS meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      embedding_model TEXT NOT NULL,
      embedding_dims INTEGER NOT NULL
    )
  `;

  export const CREATE_WORKSPACES_TABLE = `
    CREATE TABLE IF NOT EXISTS workspaces (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    )
  `;

  export const CREATE_CORPORA_TABLE = `
    CREATE TABLE IF NOT EXISTS corpora (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT 0
    )
  `;

  export const CREATE_NOTES_TABLE = `
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY,
      corpus_id INTEGER NOT NULL,
      path TEXT NOT NULL,
      content TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      mtime INTEGER NOT NULL,
      FOREIGN KEY (corpus_id) REFERENCES corpora(id),
      UNIQUE (corpus_id, path)
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

  export const SEARCH_VECTORS_ENRICHED = `
    SELECT
      vectors.key AS embedding_id,
      n.id AS note_id,
      n.corpus_id,
      n.path,
      n.content,
      e.pos AS chunk_pos,
      vectors.distance
    FROM vectors
    JOIN embeddings e ON e.id = CAST(vectors.key AS INTEGER)
    JOIN notes n ON n.id = e.note_id
    WHERE vectors.data MATCH ? AND k = ?
  `;

  export const UPSERT_WORKSPACE = `
    INSERT INTO workspaces (name, created_at, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET updated_at = excluded.updated_at
    RETURNING id
  `;

  export const UPSERT_CORPUS = `
    INSERT INTO corpora (name, created_at, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET updated_at = excluded.updated_at
    RETURNING id
  `;

  export const GET_DEFAULT_CORPUS = `
    SELECT id FROM corpora WHERE id = 1
  `;

  export const INSERT_DEFAULT_CORPUS = `
    INSERT OR IGNORE INTO corpora (id, name, created_at, updated_at)
    VALUES (1, 'default', strftime('%s', 'now') * 1000, strftime('%s', 'now') * 1000)
  `;

  export const INSERT_NOTE = `
    INSERT INTO notes (corpus_id, path, content, content_hash, mtime) VALUES (?, ?, ?, ?, ?) RETURNING id
  `;

  export const GET_NOTE_BY_HASH = `
    SELECT id, corpus_id, path, content, content_hash, mtime FROM notes WHERE corpus_id = ? AND content_hash = ?
  `;

  export const GET_NOTE = `
    SELECT id, corpus_id, path, content, content_hash, mtime FROM notes WHERE id = ?
  `;

  export const GET_WORKSPACE_BY_NAME = `
    SELECT id, name, created_at, updated_at FROM workspaces WHERE name = ?
  `;

  export const GET_WORKSPACE_BY_ID = `
    SELECT id, name, created_at, updated_at FROM workspaces WHERE id = ?
  `;

  export const GET_CORPUS_BY_NAME = `
    SELECT id, name, created_at, updated_at FROM corpora WHERE name = ?
  `;

  export const GET_CORPUS_BY_ID = `
    SELECT id, name, created_at, updated_at FROM corpora WHERE id = ?
  `;

  export const GET_NOTE_BY_PATH = `
    SELECT id, corpus_id, path, content, content_hash, mtime FROM notes WHERE corpus_id = ? AND path = ?
  `;

  export const LIST_NOTES = `
    SELECT id, path FROM notes WHERE corpus_id = ?
  `;

  export const LIST_NOTES_FOR_CORPUS_PREFIX = `
    SELECT id, path, mtime, content_hash
    FROM notes
    WHERE corpus_id = ?
      AND (
        ? = ''
        OR path = ?
        OR path LIKE ? || '/%'
      )
  `;

  export const COUNT_NOTES = `
    SELECT COUNT(*) as count FROM notes WHERE corpus_id = ?
  `;

  export const LIST_WORKSPACES = `
    SELECT id, name, created_at, updated_at FROM workspaces
  `;

  export const LIST_CORPORA = `
    SELECT id, name, created_at, updated_at FROM corpora
  `;

  export const DELETE_WORKSPACE = `
    DELETE FROM workspaces WHERE id = ?
  `;

  export const DELETE_CORPUS = `
    DELETE FROM corpora WHERE id = ?
  `;

  export const UPDATE_NOTE = `
    UPDATE notes SET content = ?, content_hash = ?, mtime = ? WHERE id = ? RETURNING id, corpus_id, path, content, content_hash
  `;

  export const UPDATE_NOTE_MTIME = `
    UPDATE notes SET mtime = ? WHERE id = ?
  `;

  export const DELETE_NOTE = `
    DELETE FROM notes WHERE id = ?
  `;

  export const DELETE_VECTORS_BY_CORPUS = `
    DELETE FROM vectors WHERE key IN (
      SELECT CAST(e.id AS TEXT) FROM embeddings e
      JOIN notes n ON e.note_id = n.id
      WHERE n.corpus_id = ?
    )
  `;

  export const DELETE_NOTES_BY_CORPUS = `
    DELETE FROM notes WHERE corpus_id = ?
  `;

  export const LIST_NOTES_PAGINATED = `
    SELECT id, corpus_id, path, content, content_hash
    FROM notes
    WHERE corpus_id = ? AND path GLOB ? AND path > ?
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
      viewer INTEGER NOT NULL,
      tracked INTEGER NOT NULL DEFAULT 0,
      corpora TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (viewer) REFERENCES workspaces(id)
    )
  `;

  export const INSERT_QUERY = `
    INSERT INTO queries (viewer, tracked, corpora, created_at)
    VALUES (?, ?, ?, ?)
    RETURNING id, viewer, tracked, corpora, created_at
  `;

  export const GET_QUERY = `
    SELECT id, viewer, tracked, corpora, created_at FROM queries WHERE id = ?
  `;

  export const LIST_RECENT_QUERIES = `
    SELECT id, viewer, tracked, corpora, created_at
    FROM queries
    ORDER BY created_at DESC
    LIMIT ?
  `;

  export const DELETE_QUERIES_BY_VIEWER = `
    DELETE FROM queries WHERE viewer = ?
  `;

  export const GET_NOTES_BY_IDS = `
    SELECT id, corpus_id, path, content, content_hash
    FROM notes
    WHERE id IN (SELECT value FROM json_each(?))
  `;

  export const LIST_QUERY_NOTES_PAGINATED = `
    SELECT id, corpus_id, path, content, content_hash
    FROM notes
    WHERE corpus_id IN (SELECT value FROM json_each(?))
      AND path GLOB ?
      AND path > ?
    ORDER BY path
    LIMIT ?
  `;

  export const LIST_QUERY_PATHS = `
    SELECT corpus_id, json_group_array(path) as paths
    FROM notes
    WHERE corpus_id IN (SELECT value FROM json_each(?))
      AND path GLOB ?
    GROUP BY corpus_id
  `;

  export const CREATE_STAGING_TABLE = `
    CREATE TABLE IF NOT EXISTS staging (
      id INTEGER PRIMARY KEY,
      note_id INTEGER NOT NULL,
      query_id INTEGER NOT NULL,
      kind INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
      FOREIGN KEY (query_id) REFERENCES queries(id) ON DELETE CASCADE
    )
  `;

  export const CREATE_STAGING_INDEXES = `
    CREATE INDEX IF NOT EXISTS staging_query_id ON staging(query_id);
    CREATE INDEX IF NOT EXISTS staging_note_id ON staging(note_id);
    CREATE INDEX IF NOT EXISTS staging_created_at ON staging(created_at);
    CREATE INDEX IF NOT EXISTS staging_kind ON staging(kind);
  `;

  export const CREATE_COMMITTED_TABLE = `
    CREATE TABLE IF NOT EXISTS committed (
      id INTEGER PRIMARY KEY,
      note_id INTEGER NOT NULL,
      query_id INTEGER NOT NULL,
      kind INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      payload TEXT NOT NULL,
      committed_at INTEGER NOT NULL,
      FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
      FOREIGN KEY (query_id) REFERENCES queries(id) ON DELETE CASCADE
    )
  `;

  export const CREATE_COMMITTED_INDEXES = `
    CREATE INDEX IF NOT EXISTS committed_query_id ON committed(query_id);
    CREATE INDEX IF NOT EXISTS committed_note_id ON committed(note_id);
    CREATE INDEX IF NOT EXISTS committed_committed_at ON committed(committed_at);
    CREATE INDEX IF NOT EXISTS committed_kind ON committed(kind);
  `;

  export const INSERT_STAGING = `
    INSERT INTO staging (note_id, query_id, kind, created_at, payload)
    VALUES (?, ?, ?, ?, ?)
  `;

  export const COUNT_STAGING = `
    SELECT COUNT(*) as count FROM staging
  `;

  export const COMMIT_STAGING_TO_COMMITTED = `
    INSERT INTO committed (note_id, query_id, kind, created_at, payload, committed_at)
    SELECT note_id, query_id, kind, created_at, payload, ?
    FROM staging
  `;

  export const CLEAR_STAGING = `
    DELETE FROM staging
  `;

  export const COUNT_COMMITTED = `
    SELECT COUNT(*) as count FROM committed
  `;
}
