import {
  createContext,
  useContext,
  createSignal,
  onMount,
  onCleanup,
  type ParentProps,
  type Accessor,
} from "solid-js";
import { Client, SpallClient } from "@spall/sdk/client";

export interface ServerContextValue {
  url: Accessor<string | null>;
  connected: Accessor<boolean>;
  client: Accessor<SpallClient | null>;
}

const ServerContext = createContext<ServerContextValue>();

export function ServerProvider(props: ParentProps) {
  const [url, setUrl] = createSignal<string | null>(null);
  const [connected, setConnected] = createSignal(false);
  const [client, setClient] = createSignal<SpallClient | null>(null);

  let shutdown = false;
  const controller = new AbortController()

  onMount(() => {
    const connect = async () => {
      while (!shutdown) {
        try {
          const c = await Client.connect(controller.signal);
          const health = await c.health();

          if (!health?.response?.ok) {
            throw new Error("Health check failed");
          }

          setUrl(health.response.url.replace("/health", ""));
          setConnected(true);
          setClient(c);

          const { stream } = await c.events({
            onSseError: () => {
              setConnected(false);
              setClient(null);
            },
            sseMaxRetryAttempts: 0,
          });

          for await (const event of stream) {

          }
        } catch {
          setConnected(false);
          setClient(null);
          setUrl(null);
          await Bun.sleep(100);
        }
      }
    };

    connect();
  });

  onCleanup(() => {
    shutdown = true;
    controller.abort();
  });

  const value: ServerContextValue = {
    url,
    connected,
    client,
  };

  return (
    <ServerContext.Provider value={value}>
      {props.children}
    </ServerContext.Provider>
  );
}

export function useServer(): ServerContextValue {
  const ctx = useContext(ServerContext);
  if (!ctx) throw new Error("useServer must be used within ServerProvider");
  return ctx;
}
