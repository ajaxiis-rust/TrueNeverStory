import { describe, test, expect } from "bun:test";
import { Hono } from "hono";
import { sessionsRouter } from "./sessions";

describe("sessions routes", () => {
  const app = new Hono();
  app.route("/", sessionsRouter);

  test("GET /sessions returns array", async () => {
    const res = await app.request("/sessions");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  test("GET /sessions/list returns object with count", async () => {
    const res = await app.request("/sessions/list");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.count).toBe("number");
    expect(Array.isArray(body.sessions)).toBe(true);
  });

  test("GET /sessions/:id/history returns turns", async () => {
    const res = await app.request("/sessions/test-session/history");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.session_id).toBe("test-session");
    expect(Array.isArray(body.turns)).toBe(true);
  });

  test("GET /sessions/:id/summarize returns summary", async () => {
    const res = await app.request("/sessions/test-session/summarize");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.session_id).toBe("test-session");
    expect(typeof body.summary).toBe("string");
  });

  test("POST /sessions/export with empty messages returns 400", async () => {
    const res = await app.request("/sessions/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [] }),
    });
    expect(res.status).toBe(400);
  });
});
