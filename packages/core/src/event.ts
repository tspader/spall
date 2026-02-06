import { z } from "zod";

import { type EventUnion } from "./index";

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

  export namespace Event {
    export const Connected = define("sse.connected", {});
  }

  export type Subscription = (event: EventUnion) => void | Promise<void>;
  const subscriptions: Set<Subscription> = new Set();

  export function subscribe(subscription: Subscription) {
    subscriptions.add(subscription);
    return () => subscriptions.delete(subscription);
  }

  export function subscriptionCount(): number {
    return subscriptions.size;
  }

  export async function publish(event: EventUnion) {
    for (const subscription of subscriptions) {
      await subscription(event);
    }
  }
}
