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
  event: Accessor<string>;
  client: Accessor<SpallClient | null>;
}

const ServerContext = createContext<ServerContextValue>();

export function ServerProvider(props: ParentProps) {
  const [url, setUrl] = createSignal<string | null>(null);
  const [connected, setConnected] = createSignal(false);
  const [event, setEvent] = createSignal("");
  const [client, setClient] = createSignal<SpallClient | null>(null);

  let shutdown = false;
  const abortController = new AbortController() as {
    signal: AbortSignal;
    abort: () => void;
  };

  onMount(() => {
    const connect = async () => {
      while (!shutdown) {
        try {
          const connectedClient = await Client.connect(abortController.signal);
          const health = await connectedClient.health();

          if (!health?.response?.ok) {
            throw new Error("Health check failed");
          }

          // Connected successfully
          setUrl(health.response.url.replace("/health", ""));
          setConnected(true);
          setClient(connectedClient);

          // Subscribe to events
          const { stream } = await connectedClient.events({
            onSseError: () => {
              setConnected(false);
              setEvent("reconnecting");
              setClient(null);
            },
            sseMaxRetryAttempts: 0,
          });

          for await (const e of stream) {
            setEvent(e.tag || "");
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
    abortController.abort();
  });

  const value: ServerContextValue = {
    url,
    connected,
    event,
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
