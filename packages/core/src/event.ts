import { z } from "zod";

import { type Event } from "./schema";
import { type EventUnion } from "./index";
import pc from "picocolors";

export namespace Bus {
  export type Definition = ReturnType<typeof define>;

  export function define<TTag extends string, TFields extends z.ZodRawShape>(
    tag: TTag,
    fields: TFields,
  ) {
    return z.object({
      tag: z.literal(tag),
      ...fields,
    });
  }

  export type Subscription = (event: EventUnion) => void | Promise<void>;
  const subscriptions: Set<Subscription> = new Set();

  export function subscribe(subscription: Subscription) {
    subscriptions.add(subscription);
    return () => subscriptions.delete(subscription);
  }

  export async function publish(event: EventUnion) {
    for (const subscription of subscriptions) {
      await subscription(event);
    }
  }

  export function render(event: Event): string {
    if (event.tag == "model") {
      switch (event.action) {
        case "download":
          return `Downloading ${pc.cyan(event.model)}`;
        case "progress": {
          const percent = (event.downloaded / event.total) * 100;
          const percentStr = percent.toFixed(0).padStart(3);

          return `${pc.cyan(event.model)} ${pc.bold(percentStr + "%")}`;
        }
        case "ready": {
          return `Finished downloading ${pc.cyanBright(event.model)}`;
        }
      }
    }

    return event.action;
  }
}
