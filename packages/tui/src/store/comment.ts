import * as db from "./db";

type Row = {
  id: number;
  review: number;
  note_id: number;
};

export type Info = {
  id: number;
  review: number;
  noteId: number;
};

export function create(input: { review: number; noteId: number }): Info {
  const row = db
    .get()
    .prepare(
      `INSERT INTO review_comments (review, note_id) VALUES (?, ?) RETURNING id`,
    )
    .get(input.review, input.noteId) as { id: number };

  return {
    id: row.id,
    review: input.review,
    noteId: input.noteId,
  };
}

export function list(review: number): Info[] {
  const rows = db
    .get()
    .prepare(`SELECT * FROM review_comments WHERE review = ?`)
    .all(review) as Row[];

  return rows.map((row) => ({
    id: row.id,
    review: row.review,
    noteId: row.note_id,
  }));
}
