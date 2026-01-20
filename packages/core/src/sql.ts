export namespace Sql {
  export const CREATE_NOTES_TABLE = `
    CREATE TABLE IF NOT EXISTS notes (
      key TEXT PRIMARY KEY,
      note TEXT NOT NULL
    )
  `;
}
