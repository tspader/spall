import * as db from "./db";

type Row = {
  id: number;
  path: string;
};

export type Info = {
  id: number;
  path: string;
};

export function create(path: string): Info {
  const row = db
    .get()
    .prepare(`INSERT INTO repos (path) VALUES (?) RETURNING id`)
    .get(path) as { id: number };
  return { id: row.id, path };
}

export function getByPath(path: string): Info | null {
  const row = db
    .get()
    .prepare(`SELECT * FROM repos WHERE path = ?`)
    .get(path) as Row | null;
  if (!row) return null;
  return { id: row.id, path: row.path };
}

export function getOrCreate(path: string): Info {
  const existing = getByPath(path);
  if (existing) return existing;
  return create(path);
}
