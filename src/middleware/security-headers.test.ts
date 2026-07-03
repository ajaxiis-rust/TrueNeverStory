import { describe, test, expect } from "bun:test";
import { Hono } from "hono";
import { securityHeaders } from "./security-headers";

describe("securityHeaders middleware", () => {
  test("adds security headers to response", async () => {
    const app = new Hono();
    app.use("*", securityHeaders);
    app.get("/test", (c) => c.text("ok"));

    const res = await app.request("/test");
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("X-XSS-Protection")).toBe("1; mode=block");
    expect(res.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(res.headers.get("Permissions-Policy")).toContain("camera=()");
    expect(res.headers.get("Content-Security-Policy")).toContain("default-src 'self'");
  });

  test("headers present on JSON responses too", async () => {
    const app = new Hono();
    app.use("*", securityHeaders);
    app.get("/api/test", (c) => c.json({ ok: true }));

    const res = await app.request("/api/test");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
  });
});
