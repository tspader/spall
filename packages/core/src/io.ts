import { join } from "path";
import { readFileSync, statSync } from "fs";

export namespace Io {
  export type CachedMetadata = {
    modTime: number;
    size: number;
  };

  export type Cache = {
    files: Map<string, CachedMetadata>;
    content: Map<string, string>;
  };

  let cache: Cache = {
    files: new Map<string, CachedMetadata>(),
    content: new Map<string, string>(),
  };

  export function clear(): void {
    cache.files.clear();
    cache.content.clear();
  }

  export function getFile(path: string): CachedMetadata {
    const cached = cache.files.get(path);
    if (cached) return cached;

    const stat = statSync(path);
    const entry = {
      modTime: stat.mtimeMs,
      size: stat.size,
    };
    cache.files.set(path, entry);
    return entry;
  }

  export function get(dir: string, key: string): CachedMetadata {
    return getFile(join(dir, key));
  }

  export function readFile(path: string): string {
    const cached = cache.content.get(path);
    if (cached) return cached;

    const content = readFileSync(path, "utf-8");
    cache.content.set(path, content);
    return content;
  }

  export function read(dir: string, key: string): string {
    return readFile(join(dir, key));
  }
}
