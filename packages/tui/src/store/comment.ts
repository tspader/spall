import * as db from "./db";

type Row = {
  id: number;
  review: number;
  note_id: number;
  file: string;
  hunk_index: number;
  created_at: number;
};

export type Info = {
  id: number;
  review: number;
  noteId: number;
  file: string;
  hunkIndex: number;
  createdAt: number;
};

export function create(input: {
  review: number;
  noteId: number;
  file: string;
  hunkIndex: number;
}): Info {
  const now = Date.now();

  const row = db
    .get()
    .prepare(
      `INSERT INTO review_comments (review, note_id, file, hunk_index, created_at) 
       VALUES (?, ?, ?, ?, ?) RETURNING id`,
    )
    .get(input.review, input.noteId, input.file, input.hunkIndex, now) as {
    id: number;
  };

  return {
    id: row.id,
    review: input.review,
    noteId: input.noteId,
    file: input.file,
    hunkIndex: input.hunkIndex,
    createdAt: now,
  };
}

export function list(review: number): Info[] {
  const rows = db
    .get()
    .prepare(
      `SELECT * FROM review_comments WHERE review = ? ORDER BY created_at ASC`,
    )
    .all(review) as Row[];

  return rows.map((row) => ({
    id: row.id,
    review: row.review,
    noteId: row.note_id,
    file: row.file,
    hunkIndex: row.hunk_index,
    createdAt: row.created_at,
  }));
}
