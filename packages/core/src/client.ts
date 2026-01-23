import { Event, type Event as EventType } from "./event";
import { Server, type SearchResult } from "./server";
import { Config } from "./config";

/**
 * SDK-style client API for spall server.
 * Handles server connection and bridges SSE events to the Event bus.
 */
export namespace Client {
  let baseUrl: string | null = null;

  async function ensureConnected(): Promise<string> {
    if (baseUrl) return baseUrl;

    const lock = Server.Lock.read();
    if (lock && (await isServerRunning(lock.port))) {
      baseUrl = `http://127.0.0.1:${lock.port}`;
      return baseUrl;
    }

    if (lock) Server.Lock.remove();

    Bun.spawn(["spall", "serve"], {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
      env: {
        ...process.env,
        SPALL_CACHE_DIR: Config.get().cacheDir,
      },
    }).unref();

    // Wait for server to start
    for (let i = 0; i < 50; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const newLock = Server.Lock.read();
      if (newLock && (await isServerRunning(newLock.port))) {
        baseUrl = `http://127.0.0.1:${newLock.port}`;
        return baseUrl;
      }
    }

    throw new Error("Timeout waiting for server to start");
  }

  async function isServerRunning(port: number): Promise<boolean> {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Consume an SSE stream, emitting events to the Event bus.
   */
  async function consumeEventStream(
    url: string,
    init?: RequestInit,
  ): Promise<void> {
    const response = await fetch(url, init);

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = JSON.parse(line.slice(6));
          if (data.error) {
            throw new Error(data.error);
          }
          Event.emit(data as EventType);
        }
      }
    }
  }

  /**
   * Index files in a directory, emitting scan/embed events.
   */
  export async function index(db: string, dir: string): Promise<void> {
    const url = await ensureConnected();
    return consumeEventStream(`${url}/index`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ db, dir }),
    });
  }

  /**
   * Search for similar content.
   */
  export async function search(
    db: string,
    query: string,
    limit?: number,
  ): Promise<SearchResult[]> {
    const url = await ensureConnected();
    const response = await fetch(`${url}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ db, query, limit }),
    });

    if (!response.ok) {
      throw new Error(`Server error: ${response.status}`);
    }

    return response.json() as Promise<SearchResult[]>;
  }

  /**
   * Reset connection state (for testing).
   */
  export function reset(): void {
    baseUrl = null;
  }
}
