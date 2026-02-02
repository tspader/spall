import { table, cleanEscapes } from "./layout";
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

const ANSI_RE = /\x1b\[[0-9;]*m/g;

function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}

function displayLen(s: string): number {
  return cleanEscapes(stripAnsi(s)).length;
}

function truncateMiddle(s: string, max: number): string {
  if (max <= 0) return "";
  if (s.length <= max) return s;
  if (max <= 3) return "...".slice(0, max);
  const half = (max - 3) >> 1;
  return s.slice(0, half + ((max - 3) & 1)) + "..." + s.slice(-half);
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
  const maxRows = opts.showAll ? items.length : Math.max(1, termRows - 4);

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

type TreeNode<T> = {
  name: string;
  isDir: boolean;
  children: Map<string, TreeNode<T>>;
  items: T[];
};

function displayTree<T>(items: T[], opts: DisplayOpts<T>): void {
  const termRows = process.stdout.rows ?? 24;
  const maxRows = opts.showAll ? Infinity : Math.max(1, termRows - 3);
  const truncated = items.length > maxRows;
  const visible = truncated ? items.slice(0, maxRows) : items;

  const root: TreeNode<T> = {
    name: "",
    isDir: true,
    children: new Map(),
    items: [],
  };

  for (const item of visible) {
    const parts = opts.path(item).split("/");
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      const isLast = i === parts.length - 1;
      if (!current.children.has(part)) {
        current.children.set(part, {
          name: part,
          isDir: !isLast,
          children: new Map(),
          items: [],
        });
      }
      current = current.children.get(part)!;
      if (isLast) {
        current.items.push(item);
      }
    }
  }

  const MAX_PER_LEAF = 3;
  const termWidth = process.stdout.columns ?? 80;
  const showAll = opts.showAll ?? false;

  function printNode(node: TreeNode<T>, indent: string): void {
    const sorted = Array.from(node.children.entries()).sort((a, b) => {
      if (a[1].isDir !== b[1].isDir) return a[1].isDir ? -1 : 1;
      return a[0].localeCompare(b[0]);
    });

    for (const [name, child] of sorted) {
      if (child.isDir) {
        console.log(`${theme.dim(indent)}${theme.dim(name + "/")}`);
        printNode(child, indent + " ");
      } else {
        const toShow = showAll
          ? child.items
          : child.items.slice(0, MAX_PER_LEAF);

        for (let i = 0; i < toShow.length; i++) {
          const item = toShow[i]!;
          const index =
            toShow.length > 1 || child.items.length > 1
              ? `[${i + 1}/${child.items.length}] `
              : "";

          const left = `${indent}${index}${name}`;
          const leftStyled =
            theme.dim(indent + index) + theme.primary(name);
          const content = cleanEscapes(opts.preview(item));

          const contentBudget = termWidth - displayLen(left) - 1;
          const preview =
            contentBudget > 0 ? truncateMiddle(content, contentBudget) : "";

          console.log(preview ? `${leftStyled} ${preview}` : leftStyled);
        }

        if (!showAll && child.items.length > MAX_PER_LEAF) {
          const remaining = child.items.length - MAX_PER_LEAF;
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
  const maxItems = opts.showAll
    ? items.length
    : Math.max(1, termRows - 3);

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
      theme.dim(
        `( ... ${remaining} more note${remaining > 1 ? "s" : ""} )`,
      ),
    );
  }
}
