import { createContext, useContext, type ParentProps } from "solid-js";
import { useRenderer } from "@opentui/solid";

type CleanupFn = () => void | Promise<void>;

interface ExitContextValue {
  exit: (reason?: unknown) => Promise<void>;
  registerCleanup: (fn: CleanupFn) => void;
}

const ExitContext = createContext<ExitContextValue>();

export function ExitProvider(props: ParentProps) {
  const renderer = useRenderer();
  const cleanupFns: CleanupFn[] = [];

  const registerCleanup = (fn: CleanupFn) => {
    cleanupFns.push(fn);
  };

  const exit = async (reason?: unknown) => {
    // Run all cleanup functions
    for (const fn of cleanupFns) {
      try {
        await fn();
      } catch {
        // Ignore cleanup errors
      }
    }

    renderer.destroy();

    if (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      process.stderr.write(message + "\n");
    }
    process.exit(0);
  };

  return (
    <ExitContext.Provider value={{ exit, registerCleanup }}>
      {props.children}
    </ExitContext.Provider>
  );
}

export function useExit(): ExitContextValue {
  const ctx = useContext(ExitContext);
  if (!ctx) throw new Error("useExit must be used within ExitProvider");
  return ctx;
}
