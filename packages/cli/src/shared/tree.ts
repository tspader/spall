export type NotePathId = { path: string; id: number };

export type NoteTreeEntry =
  | { type: "dir"; depth: number; name: string; noteCount?: number }
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

// Build directory-only entries. Directories are printed, and if a directory has
// no subdirectories it is considered a leaf and gets a noteCount.
export function noteDirEntries(
  notes: NotePathId[],
): Extract<NoteTreeEntry, { type: "dir" }>[] {
  type DirInfo = {
    hasSubdir: boolean;
    directFiles: number;
    depth: number;
    name: string;
  };

  const dirs = new Map<string, DirInfo>();

  const ensure = (key: string, depth: number, name: string): DirInfo => {
    const existing = dirs.get(key);
    if (existing) return existing;
    const created: DirInfo = { hasSubdir: false, directFiles: 0, depth, name };
    dirs.set(key, created);
    return created;
  };

  for (const note of notes) {
    const parts = note.path.split("/");
    if (parts.length <= 1) continue;

    let prefix = "";
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!;
      const key = prefix ? `${prefix}/${part}` : part;
      ensure(key, i, part + "/");

      if (prefix) {
        const parent = dirs.get(prefix);
        if (parent) parent.hasSubdir = true;
      }

      prefix = key;
    }

    // note lives directly under its parent dir prefix
    const parentKey = parts.slice(0, -1).join("/");
    const parent = dirs.get(parentKey);
    if (parent) parent.directFiles++;
  }

  const keys = Array.from(dirs.keys());
  keys.sort((a, b) => a.localeCompare(b));

  return keys.map((key) => {
    const info = dirs.get(key)!;
    const leaf = !info.hasSubdir;
    return {
      type: "dir",
      depth: info.depth,
      name: info.name,
      noteCount: leaf ? info.directFiles : undefined,
    };
  });
}
