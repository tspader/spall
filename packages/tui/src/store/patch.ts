import * as db from "./db";

type Row = {
  id: number;
  review: number;
  seq: number;
  hash: string;
  content: string;
  created_at: number;
};

export type Info = {
  id: number;
  review: number;
  seq: number;
  hash: string;
  content: string;
  createdAt: number;
};

function rowToInfo(row: Row): Info {
  return {
    id: row.id,
    review: row.review,
    seq: row.seq,
    hash: row.hash,
    content: row.content,
    createdAt: row.created_at,
  };
}

export function create(input: {
  review: number;
  seq: number;
  hash: string;
  content: string;
}): Info {
  const row = db
    .get()
    .prepare(
      `INSERT INTO patches (review, seq, hash, content, created_at)
       VALUES (?, ?, ?, ?, ?) RETURNING *`,
    )
    .get(input.review, input.seq, input.hash, input.content, Date.now()) as Row;

  return rowToInfo(row);
}

export function get(id: number): Info | null {
  const row = db
    .get()
    .prepare(`SELECT * FROM patches WHERE id = ?`)
    .get(id) as Row | null;

  if (!row) return null;
  return rowToInfo(row);
}

export function getByHash(review: number, hash: string): Info | null {
  const row = db
    .get()
    .prepare(`SELECT * FROM patches WHERE review = ? AND hash = ?`)
    .get(review, hash) as Row | null;

  if (!row) return null;
  return rowToInfo(row);
}

export function latest(review: number): Info | null {
  const row = db
    .get()
    .prepare(`SELECT * FROM patches WHERE review = ? ORDER BY seq DESC LIMIT 1`)
    .get(review) as Row | null;

  if (!row) return null;
  return rowToInfo(row);
}

export function list(review: number): Info[] {
  const rows = db
    .get()
    .prepare(`SELECT * FROM patches WHERE review = ? ORDER BY seq ASC`)
    .all(review) as Row[];

  return rows.map(rowToInfo);
}

export function nextSeq(review: number): number {
  const last = latest(review);
  return last ? last.seq + 1 : 0;
}

export function getOrCreate(review: number, content: string): Info {
  const hash = String(Bun.hash(content));
  const existing = getByHash(review, hash);
  if (existing) return existing;
  const seq = nextSeq(review);
  return create({ review, seq, hash, content });
}
