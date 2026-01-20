import { Database } from "bun:sqlite";
import { mkdirSync, existsSync } from "fs";
import { dirname } from "path";
import { Event } from "./event";
import { Sql } from "./sql";

export namespace Store {
  let instance: Database | null = null;

  export function get(): Database {
    if (!instance) {
      throw new Error("Store not initialized. Call Store.create() first.");
    }
    return instance;
  }

  export function create(path: string): Database {
    const dir = dirname(path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    Event.emit({ tag: "init", action: "create_db", path });
    instance = new Database(path);
    instance.run(Sql.CREATE_NOTES_TABLE);
    return instance;
  }

  export function open(path: string): Database {
    if (!existsSync(path)) {
      throw new Error(`Database not found at ${path}. Run 'spall init' first.`);
    }
    instance = new Database(path);
    return instance;
  }

  export function close(): void {
    if (instance) {
      instance.close();
      instance = null;
    }
  }
}
