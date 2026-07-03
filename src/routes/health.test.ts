import { describe, test, expect } from "bun:test";
import { Hono } from "hono";
import { healthRouter } from "./health";

describe("health routes", () => {
  const app = new Hono();
  app.route("/", healthRouter);

  test("GET /health returns ok", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.engine_ready).toBe(true);
    expect(typeof body.uptime).toBe("number");
  });

  test("GET /system-check returns ok", async () => {
    const res = await app.request("/system-check");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.node_version).toBeDefined();
    expect(body.platform).toBeDefined();
  });
});
