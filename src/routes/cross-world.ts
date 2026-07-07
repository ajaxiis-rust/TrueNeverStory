/**
 * Cross-World API routes
 */

import { Hono } from "hono";
import { CrossWorldBus } from "../services/cross-world-bus";
import { getSettings, updateSettings } from "../services/settings";

const app = new Hono();
let bus: CrossWorldBus | null = null;

function getBus(): CrossWorldBus {
  if (!bus) {
    const settings = getSettings();
    bus = new CrossWorldBus({
      enabled: settings.crossWorldEnabled ?? false,
      allowPortals: settings.crossWorldAllowPortals ?? true,
      isolationLevel: settings.crossWorldIsolationLevel ?? "full",
    });
  }
  return bus;
}

app.get("/status", (c) => {
  const b = getBus();
  return c.json({
    enabled: b.config.enabled,
    portals: b.listPortals().length,
    eventLog: b.getEventLog(10).length,
  });
});

app.post("/enable", (c) => {
  updateSettings({ crossWorldEnabled: true });
  bus = null;
  return c.json({ enabled: true });
});

app.post("/disable", (c) => {
  updateSettings({ crossWorldEnabled: false });
  bus = null;
  return c.json({ enabled: false });
});

app.get("/portals", (c) => {
  const b = getBus();
  return c.json(b.listPortals());
});

app.post("/portals", async (c) => {
  const body = await c.req.json();
  const b = getBus();
  const portal = b.createPortal(body.world1, body.world2);
  return c.json(portal, 201);
});

app.delete("/portals/:id", (c) => {
  const b = getBus();
  b.destroyPortal(c.req.param("id"));
  return c.json({ deleted: true });
});

app.get("/events", (c) => {
  const b = getBus();
  const limit = parseInt(c.req.query("limit") ?? "50");
  return c.json(b.getEventLog(limit));
});

export default app;
