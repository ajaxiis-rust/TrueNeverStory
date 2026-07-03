import { describe, test, expect } from "bun:test";
import { Hono } from "hono";
import { rateLimiter } from "./rate-limiter";

describe("rateLimiter middleware", () => {
  test("allows requests under limit", async () => {
    const app = new Hono();
    app.use("*", rateLimiter);
    app.get("/test", (c) => c.text("ok"));

    const res = await app.request("/test", {
      headers: { "x-forwarded-for": "1.2.3.4" },
    });
    expect(res.status).toBe(200);
  });

  test("returns 429 when rate limit exceeded", async () => {
    const app = new Hono();
    app.use("*", rateLimiter);
    app.get("/test", (c) => c.text("ok"));

    const ip = "test-rate-limit-ip";
    // Exhaust the bucket (100 requests)
    for (let i = 0; i < 100; i++) {
      await app.request("/test", { headers: { "x-forwarded-for": ip } });
    }
    // This should hit 429
    const res = await app.request("/test", { headers: { "x-forwarded-for": ip } });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toContain("Rate limit");
  });
});
