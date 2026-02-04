import { table, cleanEscapes, displayLen, truncateMiddle } from "./layout";
import { defaultTheme as theme } from "./theme";

export { cleanEscapes };

export function formatPath(s: string): string {
  const bodyLen = s.trimEnd().length;
  const body = s.slice(0, bodyLen);
  const pad = s.slice(bodyLen);
  const slash = body.lastIndexOf("/");
  if (slash === -1) return theme.primary(body) + pad;
  return (
    theme.dim(body.slice(0, slash + 1)) +
    theme.primary(body.slice(slash + 1)) +
    pad
  );
}

export function highlightSnippet(s: string): string {
  const parts = s.split(/[\x01\x02]/);
  let result = "";
  let inside = false;
  for (const part of parts) {
    result += inside ? theme.code(part) : part;
    inside = !inside;
  }
  return result;
}

type PathTreeNode<TLeaf> = {
  name: string;
  children: Map<string, PathTreeNode<TLeaf>>;
  leaf?: TLeaf;
};

function makePathTreeNode<TLeaf>(name: string): PathTreeNode<TLeaf> {
  return { name, children: new Map() };
}

function buildPathTree<TItem, TLeaf>(
  items: TItem[],
  path: (item: TItem) => string,
  initLeaf: () => TLeaf,
  addToLeaf: (leaf: TLeaf, item: TItem) => void,
): PathTreeNode<TLeaf> {
  const root = makePathTreeNode<TLeaf>("");

  for (const item of items) {
    const parts = path(item).split("/");
    let current = root;
    for (const part of parts) {
      let child = current.children.get(part);
      if (!child) {
        child = makePathTreeNode<TLeaf>(part);
        current.children.set(part, child);
      }
      current = child;
    }

    current.leaf ??= initLeaf();
    addToLeaf(current.leaf, item);
  }

  return root;
}

function sortedChildren<TLeaf>(
  node: PathTreeNode<TLeaf>,
): Array<[string, PathTreeNode<TLeaf>]> {
  const entries = Array.from(node.children.entries());
  entries.sort((a, b) => {
    const aDir = a[1].children.size > 0;
    const bDir = b[1].children.size > 0;
    if (aDir !== bDir) return aDir ? -1 : 1;
    return a[0].localeCompare(b[0]);
  });
  return entries;
}

export type ColumnDef<T> = {
  header: string;
  value: (item: T) => string;
  flex?: number;
  noTruncate?: boolean;
  min?: number;
  truncate?: "start" | "middle" | "end";
  format?: (s: string, row: number, col: number) => string;
};

export type DisplayOpts<T> = {
  output: string;
  showAll?: boolean;
  empty?: string;
  path: (item: T) => string;
  id: (item: T) => string;
  preview: (item: T) => string;
  previewFormat?: (s: string) => string;
  extraColumns?: ColumnDef<T>[];
};

export function displayResults<T>(items: T[], opts: DisplayOpts<T>): void {
  if (items.length === 0) {
    console.log(theme.dim(opts.empty ?? "(no results)"));
    return;
  }

  if (opts.output === "json") {
    console.log(JSON.stringify(items, null, 2));
    return;
  }

  if (opts.output === "tree") {
    displayTree(items, opts);
    return;
  }

  if (opts.output === "list") {
    displayList(items, opts);
    return;
  }

  // default: table
  const columns: ColumnDef<T>[] = [
    {
      header: "path",
      value: opts.path,
      flex: 1,
      truncate: "start",
      format: formatPath,
    },
    {
      header: "id",
      value: opts.id,
      flex: 0,
      noTruncate: true,
      format: (s) => theme.code(s),
    },
    ...(opts.extraColumns ?? []),
    {
      header: "preview",
      value: opts.preview,
      flex: 2,
      min: 3,
      truncate: "end",
      format: opts.previewFormat,
    },
  ];

  const termRows = process.stdout.rows ?? 24;
  const maxRows = opts.showAll ? Infinity : Math.max(1, termRows - 4);

  table(
    columns.map((c) => c.header),
    columns.map((c) => items.map((item) => c.value(item))),
    {
      flex: columns.map((c) => c.flex ?? 1),
      noTruncate: columns.map((c) => c.noTruncate ?? false),
      min: columns.map((c) => c.min ?? 0),
      truncate: columns.map((c) => c.truncate ?? "middle"),
      format: columns.map((c) =>
        c.format
          ? (s: string, row: number, col: number) => c.format!(s, row, col)
          : undefined!,
      ),
      maxRows,
    },
  );
}

function displayTree<T>(items: T[], opts: DisplayOpts<T>): void {
  const termRows = process.stdout.rows ?? 24;
  const maxRows = opts.showAll ? Infinity : Math.max(1, termRows - 3);
  const truncated = items.length > maxRows;
  const visible = truncated ? items.slice(0, maxRows) : items;

  const root = buildPathTree(
    visible,
    (item) => opts.path(item),
    () => [] as T[],
    (leaf, item) => {
      leaf.push(item);
    },
  );

  const MAX_PER_LEAF = 3;
  const termWidth = process.stdout.columns ?? 80;
  const showAll = opts.showAll ?? false;

  function printNode(node: PathTreeNode<T[]>, indent: string): void {
    for (const [name, child] of sortedChildren(node)) {
      if (child.children.size > 0) {
        console.log(`${theme.dim(indent)}${theme.dim(name + "/")}`);
        printNode(child, indent + "  ");
      } else {
        const toShow = showAll
          ? (child.leaf ?? [])
          : (child.leaf ?? []).slice(0, MAX_PER_LEAF);

        for (let i = 0; i < toShow.length; i++) {
          const item = toShow[i]!;
          const index =
            toShow.length > 1 || (child.leaf?.length ?? 0) > 1
              ? `[${i + 1}/${child.leaf?.length ?? 0}] `
              : "";

          const left = `${indent}${index}${name}`;
          const leftStyled = theme.dim(indent + index) + theme.primary(name);
          const content = cleanEscapes(opts.preview(item));

          const contentBudget = termWidth - displayLen(left) - 1;
          const preview =
            contentBudget > 0 ? truncateMiddle(content, contentBudget) : "";

          console.log(preview ? `${leftStyled} ${preview}` : leftStyled);
        }

        if (!showAll && (child.leaf?.length ?? 0) > MAX_PER_LEAF) {
          const remaining = (child.leaf?.length ?? 0) - MAX_PER_LEAF;
          console.log(
            `${theme.dim(indent)}  ${theme.dim(`( ... ${remaining} more note${remaining > 1 ? "s" : ""} )`)}`,
          );
        }
      }
    }
  }

  printNode(root, "");
  if (truncated) console.log(theme.dim("..."));
}

function displayList<T>(items: T[], opts: DisplayOpts<T>): void {
  const termRows = process.stdout.rows ?? 24;
  const maxItems = opts.showAll ? items.length : Math.max(1, termRows - 3);

  for (let i = 0; i < Math.min(items.length, maxItems); i++) {
    const item = items[i]!;
    if (items.length > 1) {
      console.log(theme.command(opts.path(item)));
    }
    console.log(opts.preview(item));
    if (i < Math.min(items.length, maxItems) - 1) console.log("");
  }

  if (items.length > maxItems && !opts.showAll) {
    const remaining = items.length - maxItems;
    console.log(
      theme.dim(`( ... ${remaining} more note${remaining > 1 ? "s" : ""} )`),
    );
  }
}

// --- LLM output modes ---

export function printQueryId(queryId: number): void {
  console.log("");
  console.log(`Your query ID is ${queryId}`);
}

export type LlmSearchOpts<T> = {
  empty?: string;
  path: (item: T) => string;
  id: (item: T) => string;
  score: (item: T) => number;
  preview: (item: T) => string;
  queryId: number;
};

function scoreBucket(score: number): string {
  if (score >= 0.9) return "perfect";
  if (score >= 0.85) return "very high";
  if (score >= 0.75) return "high";
  if (score >= 0.6) return "medium";
  return "low";
}

function truncatePreview(s: string, maxChars: number = 200): string {
  const collapsed = s.replace(/\s+/g, " ").trim();
  if (collapsed.length <= maxChars) return collapsed;
  return collapsed.slice(0, maxChars - 3) + "...";
}

export function displayLlmSearch<T>(items: T[], opts: LlmSearchOpts<T>): void {
  if (items.length === 0) {
    console.log(opts.empty ?? "(no results)");
    printQueryId(opts.queryId);
    return;
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const path = opts.path(item);
    const id = opts.id(item);
    const bucket = scoreBucket(opts.score(item));
    const preview = truncatePreview(opts.preview(item));

    console.log(`[${bucket}] (id: ${id}) ${path}`);
    console.log(preview);
    if (i < items.length - 1) console.log("");
  }

  printQueryId(opts.queryId);
}

export type LlmFetchOpts<T> = {
  empty?: string;
  path: (item: T) => string;
  id: (item: T) => string;
  content: (item: T) => string;
};

export function displayLlmFetch<T>(items: T[], opts: LlmFetchOpts<T>): void {
  if (items.length === 0) {
    console.log(opts.empty ?? "(no notes found)");
    return;
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const path = opts.path(item);
    const id = opts.id(item);
    const content = opts.content(item);

    console.log(`${path} (id: ${id})`);
    console.log(content);
    if (i < items.length - 1) console.log();
  }
}

// --- Path tree display ---

export type PathTreeOpts = {
  showAll?: boolean;
  empty?: string;
};

export function displayPathTree(paths: string[], opts?: PathTreeOpts): void {
  if (paths.length === 0) {
    console.log(theme.dim(opts?.empty ?? "(no notes)"));
    return;
  }

  const root = buildPathTree(
    paths,
    (p) => p,
    () => ({ count: 0 }),
    (leaf) => {
      leaf.count++;
    },
  );

  const showFiles = opts?.showAll ?? false;

  function printNode(
    node: PathTreeNode<{ count: number }>,
    indent: string,
  ): void {
    const sorted = sortedChildren(node);
    const dirs: Array<[string, PathTreeNode<{ count: number }>]> = [];
    const files: Array<[string, PathTreeNode<{ count: number }>]> = [];

    for (const entry of sorted) {
      if (entry[1].children.size > 0) dirs.push(entry);
      else files.push(entry);
    }

    for (const [name, child] of dirs) {
      console.log(`${theme.dim(indent)}${theme.dim(name + "/")}`);
      printNode(child, indent + "  ");
    }

    if (files.length > 0) {
      if (showFiles) {
        for (const [name, child] of files) {
          const n = child.leaf?.count ?? 0;
          const suffix = n > 1 ? theme.dim(` (x${n})`) : "";
          console.log(`${theme.dim(indent)}${theme.primary(name)}${suffix}`);
        }
      } else {
        const count = files.reduce(
          (sum, [, child]) => sum + (child.leaf?.count ?? 0),
          0,
        );
        console.log(
          `${theme.dim(indent)}${theme.primary(`(${count} note${count !== 1 ? "s" : ""})`)}`,
        );
      }
    }
  }

  printNode(root, "");
}
