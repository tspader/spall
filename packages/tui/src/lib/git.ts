import { $ } from "bun";

export namespace Git {
  export interface Entry {
    file: string;
    content: string;
    isNew: boolean;
    isDeleted: boolean;
  }

  export async function root(startPath: string): Promise<string | null> {
    try {
      const result =
        await $`git -C ${startPath} rev-parse --show-toplevel`.quiet();
      return result.stdout.toString().trim() || null;
    } catch {
      return null;
    }
  }

  export async function head(repoPath: string): Promise<string | null> {
    try {
      const result = await $`git -C ${repoPath} rev-parse HEAD`.quiet();
      return result.stdout.toString().trim() || null;
    } catch {
      return null;
    }
  }

  export async function diff(repoPath: string): Promise<string> {
    const e = await entries(repoPath);
    return e.map((x) => x.content).join("\n");
  }

  export async function hash(repoPath: string): Promise<number> {
    const trackedResult =
      await $`git -C ${repoPath} diff HEAD --name-only --relative`.quiet();
    const untrackedResult =
      await $`git -C ${repoPath} ls-files --others --exclude-standard`.quiet();
    const combined =
      trackedResult.stdout.toString() +
      "\0" +
      untrackedResult.stdout.toString();
    return Number(Bun.hash(combined));
  }

  export async function entries(repoPath: string): Promise<Entry[]> {
    const context = 0
    const result: Entry[] = [];
    const filesResult =
      await $`git -C ${repoPath} diff -U${context} HEAD --name-only --relative`.quiet();
    const filesOutput = filesResult.stdout.toString().trim();
    const trackedFiles = filesOutput
      ? filesOutput.split("\n").filter(Boolean)
      : [];

    const deletedResult =
      await $`git -C ${repoPath} diff -U${context} HEAD --name-only --diff-filter=D --relative`.quiet();
    const deletedOutput = deletedResult.stdout.toString().trim();
    const deletedFiles = new Set(
      deletedOutput ? deletedOutput.split("\n").filter(Boolean) : [],
    );

    for (const file of trackedFiles) {
      const diffResult =
        await $`git -C ${repoPath} diff -U${context} HEAD -- ${file}`.quiet();
      const content = diffResult.stdout.toString();
      const isDeleted = deletedFiles.has(file);
      result.push({ file, content, isNew: false, isDeleted });
    }

    const untrackedResult =
      await $`git -C ${repoPath} ls-files --others --exclude-standard`.quiet();
    const untrackedOutput = untrackedResult.stdout.toString().trim();
    const untrackedFiles = untrackedOutput
      ? untrackedOutput.split("\n").filter(Boolean)
      : [];

    for (const file of untrackedFiles) {
      const fileContent = await Bun.file(`${repoPath}/${file}`).text();
      const lines = fileContent.split("\n");
      const diffLines = lines.map((line) => `+${line}`);
      const content = `diff --git a/${file} b/${file}
new file mode 100644
--- /dev/null
+++ b/${file}
@@ -0,0 +1,${lines.length} @@
${diffLines.join("\n")}`;
      result.push({ file, content, isNew: true, isDeleted: false });
    }

    return result;
  }

  export function lines(diffContent: string): number {
    if (!diffContent) return 0;
    const allLines = diffContent.split("\n");
    let count = 0;
    let inHunk = false;
    for (const line of allLines) {
      if (line.startsWith("@@")) {
        inHunk = true;
        continue;
      }
      if (!inHunk) continue;
      const firstChar = line[0];
      if (firstChar === " " || firstChar === "+" || firstChar === "-") {
        count++;
      }
    }
    return count;
  }
}
