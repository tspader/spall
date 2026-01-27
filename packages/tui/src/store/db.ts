import { Database } from "bun:sqlite";
import { mkdirSync, existsSync } from "fs";
import { dirname, join } from "path";
import { homedir } from "os";

const DB_PATH = join(homedir(), ".cache", "spall", "tui.db");

const CREATE_REPOS_TABLE = `
  CREATE TABLE IF NOT EXISTS repos (
    id INTEGER PRIMARY KEY,
    path TEXT NOT NULL UNIQUE
  )
`;

const CREATE_REVIEWS_TABLE = `
  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY,
    repo INTEGER NOT NULL,
    commit_sha TEXT NOT NULL,
    name TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (repo) REFERENCES repos(id)
  )
`;

const CREATE_PATCHES_TABLE = `
  CREATE TABLE IF NOT EXISTS patches (
    id INTEGER PRIMARY KEY,
    review INTEGER NOT NULL,
    seq INTEGER NOT NULL,
    hash TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (review) REFERENCES reviews(id),
    UNIQUE (review, seq)
  )
`;

const CREATE_REVIEW_COMMENTS_TABLE = `
  CREATE TABLE IF NOT EXISTS review_comments (
    id INTEGER PRIMARY KEY,
    review INTEGER NOT NULL,
    note_id INTEGER NOT NULL,
    selections TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (review) REFERENCES reviews(id)
  )
`;

let db: Database | null = null;

export function path(): string {
  return DB_PATH;
}

export function init(): Database {
  if (db) return db;

  const dir = dirname(DB_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.exec(CREATE_REPOS_TABLE);
  db.exec(CREATE_REVIEWS_TABLE);
  db.exec(CREATE_PATCHES_TABLE);
  db.exec(CREATE_REVIEW_COMMENTS_TABLE);

  return db;
}

export function get(): Database {
  if (!db) {
    throw new Error("Store not initialized. Call init() first.");
  }
  return db;
}

export function close(): void {
  if (db) {
    db.close();
    db = null;
  }
}
