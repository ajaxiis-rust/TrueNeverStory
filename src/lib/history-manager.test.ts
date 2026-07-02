import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { HistoryManager } from "./history-manager";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { rmSync } from "node:fs";

const TEST_DIR = join(tmpdir(), "hibring-test-history");

beforeEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

const wait = (ms = 50) => new Promise((r) => setTimeout(r, ms));

describe("HistoryManager", () => {
  it("creates storage directory", () => {
    const mgr = new HistoryManager(TEST_DIR);
    expect(mgr).toBeDefined();
  });

  it("addTurn and getHistory from memory", () => {
    const mgr = new HistoryManager(TEST_DIR);
    mgr.addTurn("session1", "user", "Hello");
    mgr.addTurn("session1", "assistant", "Hi there");
    const history = mgr.getHistory("session1");
    expect(history).toHaveLength(2);
    expect(history[0]!.role).toBe("user");
    expect(history[0]!.content).toBe("Hello");
    expect(history[1]!.role).toBe("assistant");
    expect(history[1]!.content).toBe("Hi there");
  });

  it("getHistory with limit", () => {
    const mgr = new HistoryManager(TEST_DIR);
    for (let i = 0; i < 10; i++) {
      mgr.addTurn("s1", "user", `msg ${i}`);
    }
    const limited = mgr.getHistory("s1", 3);
    expect(limited).toHaveLength(3);
    expect(limited[0]!.content).toBe("msg 0");
    expect(limited[2]!.content).toBe("msg 2");
  });

  it("getConversationPairs groups user/assistant", () => {
    const mgr = new HistoryManager(TEST_DIR);
    mgr.addTurn("s1", "user", "Q1");
    mgr.addTurn("s1", "assistant", "A1");
    mgr.addTurn("s1", "user", "Q2");
    mgr.addTurn("s1", "assistant", "A2");
    const pairs = mgr.getConversationPairs("s1");
    expect(pairs).toHaveLength(2);
    expect(pairs[0]!.user.content).toBe("Q1");
    expect(pairs[0]!.assistant.content).toBe("A1");
  });

  it("sessionExists after save completes", async () => {
    const mgr = new HistoryManager(TEST_DIR);
    expect(mgr.sessionExists("s1")).toBe(false);
    mgr.addTurn("s1", "user", "Hi");
    await wait(); // wait for async save
    expect(mgr.sessionExists("s1")).toBe(true);
  });

  it("deleteSession", async () => {
    const mgr = new HistoryManager(TEST_DIR);
    mgr.addTurn("s1", "user", "Hi");
    await wait();
    expect(mgr.deleteSession("s1")).toBe(true);
    expect(mgr.sessionExists("s1")).toBe(false);
  });

  it("deleteSession returns true for in-memory session", () => {
    const mgr = new HistoryManager(TEST_DIR);
    mgr.addTurn("s1", "user", "Hi");
    // Session is in memory, so deleteSession finds it there
    expect(mgr.deleteSession("s1")).toBe(true);
  });

  it("listSessions reads from disk", async () => {
    const mgr = new HistoryManager(TEST_DIR);
    mgr.addTurn("s1", "user", "A");
    mgr.addTurn("s2", "user", "B");
    await wait();
    const sessions = mgr.listSessions();
    expect(sessions).toHaveLength(2);
  });

  it("clearCache clears session cache", async () => {
    const mgr = new HistoryManager(TEST_DIR);
    mgr.addTurn("s1", "user", "Hi");
    await wait();
    mgr.clearCache();
    // Re-reads from disk after cache clear
    const history = mgr.getHistory("s1");
    expect(history).toHaveLength(1);
  });

  it("getOrCreateSession returns session", () => {
    const mgr = new HistoryManager(TEST_DIR);
    const session = mgr.getOrCreateSession("s1");
    expect(session).toBeDefined();
    session.addTurn("user", "Hi");
    expect(mgr.getHistory("s1")).toHaveLength(1);
  });

  it("turnCount and lastUpdated", async () => {
    const mgr = new HistoryManager(TEST_DIR);
    mgr.addTurn("s1", "user", "A");
    await wait();
    const session = mgr.getOrCreateSession("s1");
    expect(session.turnCount).toBe(1);
    expect(session.lastUpdated).toBeInstanceOf(Date);
  });
});
