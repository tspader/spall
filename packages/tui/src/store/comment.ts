import * as db from "./db";

type Row = {
  id: number;
  review: number;
  note_id: number;
  file: string;
  patch_id: number;
  start_row: number;
  end_row: number;
  created_at: number;
};

export type Info = {
  id: number;
  review: number;
  noteId: number;
  file: string;
  patchId: number;
  startRow: number;
  endRow: number;
  createdAt: number;
};

export function create(input: {
  review: number;
  noteId: number;
  file: string;
  patchId: number;
  startRow: number;
  endRow: number;
}): Info {
  const now = Date.now();

  const row = db
    .get()
    .prepare(
      `INSERT INTO review_comments (
         review,
         note_id,
         file,
         patch_id,
         start_row,
         end_row,
         created_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .get(
      input.review,
      input.noteId,
      input.file,
      input.patchId,
      input.startRow,
      input.endRow,
      now,
    ) as {
    id: number;
  };

  return {
    id: row.id,
    review: input.review,
    noteId: input.noteId,
    file: input.file,
    patchId: input.patchId,
    startRow: input.startRow,
    endRow: input.endRow,
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
    patchId: row.patch_id,
    startRow: row.start_row,
    endRow: row.end_row,
    createdAt: row.created_at,
  }));
}
