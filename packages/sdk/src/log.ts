import { mkdirSync, appendFileSync } from "fs";
import { dirname, join } from "path";
import { Config } from "@spall/core/config";

/**
 * Server file logger.
 *
 * Log directory: ~/.local/share/spall/logs/$isotimestamp_$pid_$port/
 *   - events.log  -- bus events + errors (JSONL)
 *   - app.log     -- hono HTTP request logs (plain text lines)
 */
export namespace ServerLog {
  let dir: string | null = null;
  let eventsPath: string;
  let appPath: string;

  function ts(): string {
    return new Date().toISOString();
  }

  export function init(port: number): void {
    const stamp = new Date()
      .toISOString()
      .replace(/:/g, "-")
      .replace(/\.\d+Z$/, "Z");
    const name = `${stamp}_${process.pid}_${port}`;
    dir = join(Config.get().dirs.data, "logs", name);
    mkdirSync(dir, { recursive: true });
    eventsPath = join(dir, "events.log");
    appPath = join(dir, "app.log");
  }

  function safeAppend(path: string, line: string): void {
    try {
      appendFileSync(path, line + "\n");
    } catch {
      try {
        mkdirSync(dirname(path), { recursive: true });
        appendFileSync(path, line + "\n");
      } catch {
        // Best-effort logging should never crash server/tests.
      }
    }
  }

  /** Write a bus event to events.log as JSONL. */
  export function event(e: { tag: string; [k: string]: unknown }): void {
    if (!dir) return;
    const line = JSON.stringify({ ts: ts(), ...e });
    safeAppend(eventsPath, line);
  }

  /** Write an error to events.log. */
  export function error(err: unknown): void {
    if (!dir) return;
    const message =
      err instanceof Error
        ? { message: err.message, stack: err.stack }
        : { message: String(err) };
    const line = JSON.stringify({ ts: ts(), tag: "error", ...message });
    safeAppend(eventsPath, line);
  }

  const ANSI_RE = /\x1b\[[0-9;]*m/g;

  /** Hono logger print function -- writes to app.log. */
  export function appLog(message: string, ...rest: string[]): void {
    if (!dir) return;
    const raw = `${ts()} ${message} ${rest.join(" ")}`.trimEnd();
    safeAppend(appPath, raw.replace(ANSI_RE, ""));
  }

  /** Returns the log directory path, or null if not initialized. */
  export function path(): string | null {
    return dir;
  }
}
