import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Server } from "./server";
import { Client } from "./client";
import { Config } from "./config";
import { Event, type Event as EventType } from "./event";
import { existsSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

let testDir: string;

describe("Client", () => {
  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "spall-test-"));
    process.env.SPALL_CACHE_DIR = testDir;
    Config.reset();
    Client.reset();
  });

  afterEach(() => {
    Server.stop();
    Client.reset();
    delete process.env.SPALL_CACHE_DIR;
    Config.reset();
    try {
      rmSync(testDir, { recursive: true });
    } catch {}
  });

  test("starts server when none running", async () => {
    // First call should start server
    await Client.index("/tmp/test.db", "/tmp");
    expect(existsSync(Server.Lock.path())).toBe(true);
  });

  test("reuses existing server", async () => {
    await Client.index("/tmp/test.db", "/tmp");
    const lock1 = Server.Lock.read();

    await Client.index("/tmp/test.db", "/tmp");
    const lock2 = Server.Lock.read();

    expect(lock1!.port).toBe(lock2!.port);
  });

  test("cleans up stale lock and starts new server", async () => {
    // Create fake lock pointing to unused port
    const cacheDir = Config.get().cacheDir;
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(
      Server.Lock.path(),
      JSON.stringify({ pid: 99999, port: 59999 }),
    );

    await Client.index("/tmp/test.db", "/tmp");

    // Lock should now have real port, not the fake one
    const lock = Server.Lock.read();
    expect(lock).not.toBeNull();
    expect(lock!.port).not.toBe(59999);
  });

  test("search returns results", async () => {
    // Search should return empty array (stub implementation)
    const results = await Client.search("/tmp/test.db", "test query");
    expect(results).toEqual([]);
  });

  test("index emits events to Event bus", async () => {
    const events: EventType[] = [];
    Event.listen((e) => events.push(e));

    await Client.index("/tmp/test.db", "/tmp");

    expect(events.length).toBeGreaterThan(0);
    expect(events.some((e) => e.tag === "scan")).toBe(true);
  });
});

describe("Server.Lock", () => {
  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), "spall-test-"));
    process.env.SPALL_CACHE_DIR = testDir;
    Config.reset();
  });

  afterEach(() => {
    Server.stop();
    delete process.env.SPALL_CACHE_DIR;
    Config.reset();
    try {
      rmSync(testDir, { recursive: true });
    } catch {}
  });

  test("write creates lock file", async () => {
    const cacheDir = Config.get().cacheDir;
    mkdirSync(cacheDir, { recursive: true });

    expect(Server.Lock.write(12345)).toBe(true);
    expect(existsSync(Server.Lock.path())).toBe(true);

    const lock = Server.Lock.read();
    expect(lock).not.toBeNull();
    expect(lock!.port).toBe(12345);
  });

  test("write fails if lock exists", async () => {
    const cacheDir = Config.get().cacheDir;
    mkdirSync(cacheDir, { recursive: true });

    expect(Server.Lock.write(12345)).toBe(true);
    expect(Server.Lock.write(54321)).toBe(false);
  });

  test("remove deletes lock file", async () => {
    const cacheDir = Config.get().cacheDir;
    mkdirSync(cacheDir, { recursive: true });

    Server.Lock.write(12345);
    expect(existsSync(Server.Lock.path())).toBe(true);

    Server.Lock.remove();
    expect(existsSync(Server.Lock.path())).toBe(false);
  });
});
