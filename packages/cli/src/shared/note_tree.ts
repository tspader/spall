export type NotePathId = { path: string; id: number };

export type NoteTreeEntry =
  | { type: "dir"; depth: number; name: string }
  | { type: "file"; depth: number; name: string; id: number };

// Build a simple directory-first tree listing from flat note paths.
// Output is unstyled; callers decide indentation and coloring.
export function noteTreeEntries(notes: NotePathId[]): NoteTreeEntry[] {
  const entries: NoteTreeEntry[] = [];
  const seenDirs = new Set<string>();

  for (const note of notes) {
    const parts = note.path.split("/");
    let prefix = "";
    for (let i = 0; i < parts.length - 1; i++) {
      prefix = prefix ? `${prefix}/${parts[i]}` : parts[i]!;
      if (!seenDirs.has(prefix)) {
        seenDirs.add(prefix);
        entries.push({ type: "dir", depth: i, name: parts[i]! + "/" });
      }
    }

    entries.push({
      type: "file",
      depth: Math.max(0, parts.length - 1),
      name: parts[parts.length - 1]!,
      id: note.id,
    });
  }

  return entries;
}
