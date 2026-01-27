import * as db from "./db";

type Row = {
  id: number;
  review: number;
  note_id: number;
  selections: string | null;
  created_at: number;
};

export type SelectionsJson = {
  hunks: Record<string, number[]>; // file -> hunkIndices
  lines: Record<string, Array<[number, number]>>; // file -> [start, end] pairs
};

export type Info = {
  id: number;
  review: number;
  noteId: number;
  selections: SelectionsJson | null;
  createdAt: number;
};

export function create(input: {
  review: number;
  noteId: number;
  selections?: SelectionsJson;
}): Info {
  const now = Date.now();
  const selectionsJson = input.selections
    ? JSON.stringify(input.selections)
    : null;

  const row = db
    .get()
    .prepare(
      `INSERT INTO review_comments (review, note_id, selections, created_at) 
       VALUES (?, ?, ?, ?) RETURNING id`,
    )
    .get(input.review, input.noteId, selectionsJson, now) as { id: number };

  return {
    id: row.id,
    review: input.review,
    noteId: input.noteId,
    selections: input.selections ?? null,
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
    selections: row.selections ? JSON.parse(row.selections) : null,
    createdAt: row.created_at,
  }));
}
