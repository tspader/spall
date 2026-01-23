import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Server } from "./server";
import { Config } from "./config";
import { Event, type Event as EventType } from "./event";
import {
  existsSync,
  unlinkSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from "fs";
import { join } from "path";
import { tmpdir } from "os";

let testDir: string;

function lockPath(): string {
  return join(Config.get().cacheDir, "server.lock");
}

function cleanupLock() {
  try {
    unlinkSync(lockPath());
  } catch {}
}

function readLock(): { pid: number; port: number } | null {
  try {
    return JSON.parse(readFileSync(lockPath(), "utf-8"));
  } catch {
    return null;
  }
}

describe("Server.ensureServer", () => {
  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "spall-test-"));
    Config.set({ cacheDir: testDir });
  });

  afterEach(() => {
    Server.stop();
    Config.reset();
    try {
      rmSync(testDir, { recursive: true });
    } catch {}
  });

  test("starts server when none running", async () => {
    const client = await Server.connect();
    expect(client).toBeDefined();
    expect(existsSync(lockPath())).toBe(true);
    client.close();
  });

  test("connects to existing server", async () => {
    const client1 = await Server.connect();
    const client2 = await Server.connect();

    expect(client1).toBeDefined();
    expect(client2).toBeDefined();

    client1.close();
    client2.close();
  });

  test("cleans up stale lock and starts new server", async () => {
    // Create fake lock pointing to unused port
    const cacheDir = Config.get().cacheDir;
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(lockPath(), JSON.stringify({ pid: 99999, port: 59999 }));

    const client = await Server.connect();
    expect(client).toBeDefined();

    // Lock should now have real port, not the fake one
    const lock = readLock();
    expect(lock).not.toBeNull();
    expect(lock!.port).not.toBe(59999);

    client.close();
  });

  test("race: parallel ensureServer calls", async () => {
    for (let i = 0; i < 10; i++) {
      cleanupLock();

      const clients = await Promise.all([
        Server.connect(),
        Server.connect(),
        Server.connect(),
      ]);

      // All should succeed
      expect(clients.every((c) => c !== null)).toBe(true);

      // All connected to same server (one lock file)
      const lock = readLock();
      expect(lock).not.toBeNull();

      clients.forEach((c) => c.close());
      Server.stop();
    }
  });

  test("clients can perform operations", async () => {
    const client = await Server.connect();

    // Search should return empty array (stub implementation)
    const results = await client.search("/tmp/test.db", "test query");
    expect(results).toEqual([]);

    // Index should complete without error
    await client.index("/tmp/test.db", "/tmp");

    client.close();
  });

  test("server events are pushed to Event bus", async () => {
    const client = await Server.connect();
    const busEvents: EventType[] = [];

    const handler = (e: EventType) => busEvents.push(e);
    Event.on(handler);

    // Trigger an index operation that emits events
    await client.index("/tmp/test.db", "/tmp");

    Event.off(handler);

    // Events should have been pushed to the bus
    expect(busEvents.length).toBeGreaterThan(0);
    expect(busEvents.some((e) => e.tag === "scan")).toBe(true);

    client.close();
  });
});
