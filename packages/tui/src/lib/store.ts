import { Database } from "bun:sqlite";
import { mkdirSync, existsSync } from "fs";
import { dirname, join } from "path";
import { homedir } from "os";

const DB_PATH = join(homedir(), ".cache", "spall", "tui.db");

const CREATE_REVIEWS_TABLE = `
  CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY,
    project_id INTEGER NOT NULL,
    "commit" TEXT NOT NULL,
    name TEXT,
    created_at INTEGER NOT NULL
  )
`;

const CREATE_REVIEW_COMMENTS_TABLE = `
  CREATE TABLE IF NOT EXISTS review_comments (
    id INTEGER PRIMARY KEY,
    review_id INTEGER NOT NULL,
    note_id INTEGER NOT NULL,
    FOREIGN KEY (review_id) REFERENCES reviews(id)
  )
`;

export namespace Store {
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
    db.exec(CREATE_REVIEWS_TABLE);
    db.exec(CREATE_REVIEW_COMMENTS_TABLE);

    return db;
  }

  export function get(): Database {
    if (!db) {
      throw new Error("Store not initialized. Call Store.init() first.");
    }
    return db;
  }

  export function close(): void {
    if (db) {
      db.close();
      db = null;
    }
  }
}

export namespace Review {
  type Row = {
    id: number;
    project_id: number;
    commit: string;
    name: string | null;
    created_at: number;
  };

  export type Info = {
    id: number;
    projectId: number;
    commit: string;
    name: string | null;
    createdAt: number;
  };

  export function create(input: {
    projectId: number;
    commit: string;
    name?: string;
  }): Info {
    const db = Store.get();
    const createdAt = Date.now();

    const row = db
      .prepare(
        `INSERT INTO reviews (project_id, "commit", name, created_at) 
         VALUES (?, ?, ?, ?) RETURNING id`,
      )
      .get(input.projectId, input.commit, input.name ?? null, createdAt) as {
      id: number;
    };

    return {
      id: row.id,
      projectId: input.projectId,
      commit: input.commit,
      name: input.name ?? null,
      createdAt,
    };
  }

  export function list(projectId: number): Info[] {
    const db = Store.get();
    const rows = db
      .prepare(
        `SELECT * FROM reviews WHERE project_id = ? ORDER BY created_at DESC`,
      )
      .all(projectId) as Row[];

    return rows.map((row) => ({
      id: row.id,
      projectId: row.project_id,
      commit: row.commit,
      name: row.name,
      createdAt: row.created_at,
    }));
  }

  export function get(id: number): Info | null {
    const db = Store.get();
    const row = db
      .prepare(`SELECT * FROM reviews WHERE id = ?`)
      .get(id) as Row | null;

    if (!row) return null;

    return {
      id: row.id,
      projectId: row.project_id,
      commit: row.commit,
      name: row.name,
      createdAt: row.created_at,
    };
  }

  export function latest(projectId: number): Info | null {
    const db = Store.get();
    const row = db
      .prepare(
        `SELECT * FROM reviews WHERE project_id = ? ORDER BY created_at DESC LIMIT 1`,
      )
      .get(projectId) as Row | null;

    if (!row) return null;

    return {
      id: row.id,
      projectId: row.project_id,
      commit: row.commit,
      name: row.name,
      createdAt: row.created_at,
    };
  }
}

export namespace ReviewComment {
  type Row = {
    id: number;
    review_id: number;
    note_id: number;
  };

  export type Info = {
    id: number;
    reviewId: number;
    noteId: number;
  };

  export function create(input: { reviewId: number; noteId: number }): Info {
    const db = Store.get();

    const row = db
      .prepare(
        `INSERT INTO review_comments (review_id, note_id) VALUES (?, ?) RETURNING id`,
      )
      .get(input.reviewId, input.noteId) as { id: number };

    return {
      id: row.id,
      reviewId: input.reviewId,
      noteId: input.noteId,
    };
  }

  export function list(reviewId: number): Info[] {
    const db = Store.get();
    const rows = db
      .prepare(`SELECT * FROM review_comments WHERE review_id = ?`)
      .all(reviewId) as Row[];

    return rows.map((row) => ({
      id: row.id,
      reviewId: row.review_id,
      noteId: row.note_id,
    }));
  }
}
