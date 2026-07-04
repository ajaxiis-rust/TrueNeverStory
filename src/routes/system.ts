/**
 * System routes — pause/resume background processing.
 */
import { Hono } from "hono";
import type { NarrativeService } from "../services/narrative-service";

const system = new Hono();

let _narrativeCtx: NarrativeService | null = null;

export function initSystem(narrativeCtx: NarrativeService): void {
  _narrativeCtx = narrativeCtx;
}

system.post("/system/pause", async (c) => {
  if (!_narrativeCtx) {
    return c.json({ error: "Services not initialized" }, 503);
  }
  _narrativeCtx.pause();
  return c.json({ status: "paused" });
});

system.post("/system/resume", async (c) => {
  if (!_narrativeCtx) {
    return c.json({ error: "Services not initialized" }, 503);
  }
  _narrativeCtx.resume();
  return c.json({ status: "resumed" });
});

system.get("/system/status", async (c) => {
  if (!_narrativeCtx) {
    return c.json({ paused: false, running: false });
  }
  return c.json({
    running: _narrativeCtx.director.isRunning,
    paused: _narrativeCtx.director.isPaused,
  });
});

export { system as systemRouter };
