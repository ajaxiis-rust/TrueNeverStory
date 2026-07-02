import { describe, it, expect, beforeEach } from "bun:test";
import { WorldClock } from "./world-clock";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TMP = join(tmpdir(), `tns-clock-test-${Date.now()}`);

describe("WorldClock", () => {
  let clock: WorldClock;
  const clockPath = join(TMP, "clock.json");

  beforeEach(() => {
    if (!existsSync(TMP)) mkdirSync(TMP, { recursive: true });
    if (existsSync(clockPath)) rmSync(clockPath);
    clock = new WorldClock(clockPath);
  });

  it("has default current time", () => {
    expect(clock.currentTime).toBeInstanceOf(Date);
  });

  it("ticks forward", async () => {
    const before = clock.currentTime.getTime();
    await clock.tick(60);
    const after = clock.currentTime.getTime();
    expect(after - before).toBe(60 * 60 * 1000);
  });

  it("schedules an event", async () => {
    const when = new Date(clock.currentTime.getTime() + 30 * 60 * 1000);
    await clock.scheduleEvent(when, "test_callback", { key: "value" });
    const events = clock.getScheduledEvents();
    expect(events.length).toBe(1);
    expect(events[0]!.callback).toBe("test_callback");
  });

  it("schedules relative event", async () => {
    await clock.scheduleRelative(30, "relative_cb", {});
    const events = clock.getScheduledEvents();
    expect(events.length).toBe(1);
  });

  it("dispatches due events on tick", async () => {
    let dispatched = false;
    clock.registerCallback("test_cb", () => { dispatched = true; });

    const when = new Date(clock.currentTime.getTime() + 10 * 60 * 1000);
    await clock.scheduleEvent(when, "test_cb", {});
    await clock.tick(15);

    expect(dispatched).toBe(true);
  });

  it("global luck clamps 0-1", async () => {
    await clock.setGlobalLuck(1.5);
    expect(clock.getGlobalLuck()).toBe(1);
    await clock.setGlobalLuck(-0.5);
    expect(clock.getGlobalLuck()).toBe(0);
    await clock.setGlobalLuck(0.7);
    expect(clock.getGlobalLuck()).toBe(0.7);
  });

  it("persists across instances", async () => {
    await clock.tick(120);
    const clock2 = new WorldClock(clockPath);
    expect(clock2.currentTime).toBeInstanceOf(Date);
  });
});
