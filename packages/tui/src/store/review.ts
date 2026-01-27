import * as db from "./db";

type Row = {
  id: number;
  repo: number;
  commit_sha: string;
  name: string | null;
  created_at: number;
};

export type Info = {
  id: number;
  repo: number;
  commitSha: string;
  name: string | null;
  createdAt: number;
};

function rowToInfo(row: Row): Info {
  return {
    id: row.id,
    repo: row.repo,
    commitSha: row.commit_sha,
    name: row.name,
    createdAt: row.created_at,
  };
}

export function create(input: {
  repo: number;
  commitSha: string;
  name?: string;
}): Info {
  const createdAt = Date.now();

  const row = db
    .get()
    .prepare(
      `INSERT INTO reviews (repo, commit_sha, name, created_at) 
       VALUES (?, ?, ?, ?) RETURNING *`,
    )
    .get(input.repo, input.commitSha, input.name ?? null, createdAt) as Row;

  return rowToInfo(row);
}

export function list(repo: number): Info[] {
  const rows = db
    .get()
    .prepare(`SELECT * FROM reviews WHERE repo = ? ORDER BY created_at DESC`)
    .all(repo) as Row[];

  return rows.map(rowToInfo);
}

export function get(id: number): Info | null {
  const row = db
    .get()
    .prepare(`SELECT * FROM reviews WHERE id = ?`)
    .get(id) as Row | null;

  if (!row) return null;
  return rowToInfo(row);
}

export function latest(repo: number): Info | null {
  const row = db
    .get()
    .prepare(
      `SELECT * FROM reviews WHERE repo = ? ORDER BY created_at DESC LIMIT 1`,
    )
    .get(repo) as Row | null;

  if (!row) return null;
  return rowToInfo(row);
}

export function getByRepoAndCommit(
  repo: number,
  commitSha: string,
): Info | null {
  const row = db
    .get()
    .prepare(`SELECT * FROM reviews WHERE repo = ? AND commit_sha = ?`)
    .get(repo, commitSha) as Row | null;

  if (!row) return null;
  return rowToInfo(row);
}

export function getOrCreate(repo: number, commitSha: string): Info {
  const existing = getByRepoAndCommit(repo, commitSha);
  if (existing) return existing;
  return create({ repo, commitSha });
}
