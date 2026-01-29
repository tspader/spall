import { z } from "zod";
import { Bus } from "./event";

export namespace Error {
  export const Info = z.object({
    code: z.string(),
    message: z.string(),
  });

  export type Info = z.infer<typeof Info>;

  export class SpallError extends globalThis.Error {
    readonly code: string;

    constructor(code: string, message: string) {
      super(message);
      this.name = "SpallError";
      this.code = code;
    }
  }

  export const Event = {
    Raised: Bus.define("error", {
      error: Info,
    }),
  };

  export function from(err: unknown): Info {
    if (err && typeof err === "object") {
      const e = err as { code?: unknown; message?: unknown };
      if (typeof e.code === "string" && typeof e.message === "string") {
        return { code: e.code, message: e.message };
      }
    }

    const message = err instanceof globalThis.Error ? err.message : String(err);
    return { code: "error", message };
  }
}
