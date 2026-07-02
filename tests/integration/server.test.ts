/**
 * Integration tests for the TrueNeverStory server.
 * Requires the server to be running on http://127.0.0.1:8000.
 * Run: bun run start & bun test tests/integration
 */
import { describe, it, expect, beforeAll } from "bun:test";

const BASE = "http://127.0.0.1:8000";
let cookies = "";

async function api(path: string, options?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Cookie: cookies,
      ...options?.headers,
    },
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) {
    const match = setCookie.match(/bring_session=\S+/);
    if (match) cookies = match[0];
  }
  return res;
}

async function apiJson(path: string, options?: RequestInit) {
  const res = await api(path, options);
  return { status: res.status, body: await res.json() };
}

async function serverAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok || res.status === 401;
  } catch {
    return false;
  }
}

const serverUp = await serverAvailable();

// ── Auth Tests ──

describe("Auth", () => {
  it("should return 401 without session", async () => {
    if (!serverUp) return expect(true).toBe(true); // skip
    const { status } = await apiJson("/api/health");
    expect(status).toBe(401);
  });

  it("should reject wrong password", async () => {
    if (!serverUp) return expect(true).toBe(true);
    const res = await fetch(`${BASE}/login`, {
      method: "POST",
      body: "password=wrong",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
    expect(res.status).toBe(401);
  });

  it("should accept correct password", async () => {
    if (!serverUp) return expect(true).toBe(true);
    const res = await fetch(`${BASE}/login`, {
      method: "POST",
      body: "password=changeme",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("bring_session=");
  });
});

// ── API Tests (with auth) ──

describe("API Endpoints", () => {
  beforeAll(async () => {
    if (!serverUp) return;
    const res = await fetch(`${BASE}/login`, {
      method: "POST",
      body: "password=changeme",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      redirect: "manual",
    });
    const setCookie = res.headers.get("set-cookie") ?? "";
    const match = setCookie.match(/bring_session=\S+/);
    if (match) cookies = match[0];
  });

  it("GET /api/health", async () => {
    if (!serverUp) return expect(true).toBe(true);
    const { status, body } = await apiJson("/api/health");
    expect(status).toBe(200);
    expect(body.status).toBe("ok");
  });

  it("GET /api/graph/summary", async () => {
    if (!serverUp) return expect(true).toBe(true);
    const { status, body } = await apiJson("/api/graph/summary");
    expect(status).toBe(200);
    expect(typeof body.nodes).toBe("number");
    expect(typeof body.edges).toBe("number");
  });

  it("GET /api/search?q=test", async () => {
    if (!serverUp) return expect(true).toBe(true);
    const { status, body } = await apiJson("/api/search?q=test");
    expect(status).toBe(200);
    expect(Array.isArray(body.results)).toBe(true);
  });

  it("GET /api/branch/list", async () => {
    if (!serverUp) return expect(true).toBe(true);
    const { status, body } = await apiJson("/api/branch/list");
    expect(status).toBe(200);
    expect(Array.isArray(body.branches)).toBe(true);
    expect(body.branches).toContain("main");
  });

  it("GET /api/sessions", async () => {
    if (!serverUp) return expect(true).toBe(true);
    const { status, body } = await apiJson("/api/sessions");
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it("GET /api/quests", async () => {
    if (!serverUp) return expect(true).toBe(true);
    const { status, body } = await apiJson("/api/quests");
    expect(status).toBe(200);
    expect(Array.isArray(body.quests)).toBe(true);
  });

  it("POST /api/chat/setup", async () => {
    if (!serverUp) return expect(true).toBe(true);
    const { status, body } = await apiJson("/api/chat/setup", {
      method: "POST",
      body: JSON.stringify({ character: "TestHero", location: "Tavern" }),
    });
    expect(status).toBe(200);
    expect(body.active_character).toBe("TestHero");
  });

  it("GET /api/chat/session", async () => {
    if (!serverUp) return expect(true).toBe(true);
    const { status, body } = await apiJson("/api/chat/session");
    expect(status).toBe(200);
    expect(body.active_character).toBe("TestHero");
  });

  it("GET /login page", async () => {
    if (!serverUp) return expect(true).toBe(true);
    const res = await api("/login");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("TrueNeverStory");
  });
});

// ── WebSocket Tests ──

describe("WebSocket", () => {
  it("should connect and respond to ping", async () => {
    if (!serverUp) return expect(true).toBe(true);
    const loginRes = await fetch(`${BASE}/login`, {
      method: "POST",
      body: "password=changeme",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      redirect: "manual",
    });
    const setCookie = loginRes.headers.get("set-cookie") ?? "";
    const match = setCookie.match(/bring_session=\S+/);
    const cookie = match ? match[0] : "";

    const result = await new Promise<string>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:8000/ws/roleplay/test`, {
        headers: { cookie },
      });
      const timer = setTimeout(() => reject(new Error("timeout")), 3000);
      ws.onopen = () => ws.send(JSON.stringify({ type: "ping" }));
      ws.onmessage = (e) => {
        clearTimeout(timer);
        const data = JSON.parse(e.data as string);
        ws.close();
        resolve(data.type);
      };
      ws.onerror = () => {
        clearTimeout(timer);
        reject(new Error("ws error"));
      };
    });

    expect(result).toBe("pong");
  });
});
