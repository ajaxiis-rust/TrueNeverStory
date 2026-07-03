import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { AgentMemoryStore } from "./agent-memory-store";
import { mkdirSync, rmSync } from "node:fs";

const TEST_DIR = "/tmp/tns-agent-memory-test";
const EMBEDDING_URL = "http://127.0.0.1:5002";

let embeddingAvailable = false;

beforeAll(async () => {
  mkdirSync(TEST_DIR, { recursive: true });
  try {
    const res = await fetch(`${EMBEDDING_URL}/v1/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "bge-m3", input: "test" }),
      signal: AbortSignal.timeout(3000),
    });
    embeddingAvailable = res.ok;
  } catch {
    embeddingAvailable = false;
  }
});

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("AgentMemoryStore", () => {
  test("add and search memories", async () => {
    if (!embeddingAvailable) return;
    const store = new AgentMemoryStore(TEST_DIR, EMBEDDING_URL);

    await store.addMemory("narrator", "Лилит вошла в таверну", {
      importance: 0.8,
      tags: ["npc", "location"],
      sessionId: "session-1",
    });

    await store.addMemory("narrator", "Кузнец создал огненный меч", {
      importance: 0.6,
      tags: ["crafting"],
      sessionId: "session-1",
    });

    expect(store.memoryCount()).toBe(2);

    const results = await store.search("narrator", "эльфийка в заведении", 3);
    expect(results.length).toBeGreaterThan(0);

    store.close();
  });

  test("agent isolation: different agents don't mix", async () => {
    if (!embeddingAvailable) return;
    const store = new AgentMemoryStore(TEST_DIR, EMBEDDING_URL);

    await store.addMemory("narrator", "Тёмная ночь, дождь стучит по крышам", {
      importance: 0.7,
    });

    await store.addMemory("npc", "Добро пожаловать в нашу таверну!", {
      importance: 0.5,
    });

    const narratorResults = await store.search("narrator", "ночь дождь", 5);
    const npcResults = await store.search("npc", "таверна", 5);

    expect(narratorResults.some(r => r.includes("ночь"))).toBe(true);
    expect(npcResults.some(r => r.includes("таверну"))).toBe(true);

    store.close();
  });

  test("getRecentHistory by session", async () => {
    if (!embeddingAvailable) return;
    const store = new AgentMemoryStore(TEST_DIR, EMBEDDING_URL);

    await store.addMemory("narrator", "First entry about dragons", { sessionId: "s1" });
    await store.addMemory("narrator", "Second entry about magic", { sessionId: "s1" });
    await store.addMemory("narrator", "Other session entry", { sessionId: "s2" });

    const recent = await store.getRecentHistory("narrator", "s1", 10);
    expect(recent.length).toBeGreaterThanOrEqual(2);

    store.close();
  });
});
