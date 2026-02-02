import { AsyncLocalStorage } from "node:async_hooks";

type RequestContext = {
  aborted: boolean;
  iter: number;
  every: number;
};

const storage = new AsyncLocalStorage<RequestContext>();

export const Context = (() => {
  function run<T>(fn: () => T): [T, RequestContext] {
    const ctx: RequestContext = { aborted: false, iter: 0, every: 32 };
    const result = storage.run(ctx, fn);
    return [result, ctx];
  }

  function abort(): void {
    const ctx = storage.getStore();
    if (ctx) ctx.aborted = true;
  }

  function aborted(): boolean {
    return storage.getStore()?.aborted ?? false;
  }

  function setYield(every: number): void {
    const ctx = storage.getStore();
    if (!ctx) return;
    ctx.iter = 0;
    ctx.every = every;
  }

  async function checkpoint(): Promise<boolean> {
    const ctx = storage.getStore();
    if (!ctx) return false;

    ctx.iter++;
    if (ctx.every > 0 && ctx.iter >= ctx.every) {
      ctx.iter = 0;
      await Bun.sleep(0);
    }

    return ctx.aborted;
  }

  return {
    run,
    abort,
    aborted,
    setYield,
    checkpoint,
  };
})();
