import { describe, it, expect, beforeEach } from "bun:test";
import { Chronicler } from "./chronicler";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TMP = join(tmpdir(), `tns-chron-test-${Date.now()}`);

describe("Chronicler", () => {
  let chron: Chronicler;

  beforeEach(() => {
    if (!existsSync(TMP)) mkdirSync(TMP, { recursive: true });
    chron = new Chronicler(join(TMP, "timeline.jsonl"));
  });

  it("logs an event", async () => {
    await chron.logEvent("Something happened", new Date(), "test");
    const timeline = await chron.getTimeline(new Date(0), 10);
    expect(timeline.length).toBeGreaterThanOrEqual(1);
  });

  it("logs with group", async () => {
    await chron.logEvent("Combat event", new Date(), "combat");
    await chron.logEvent("Narrative event", new Date(), "narrative");
    const all = await chron.getTimeline(new Date(0), 10);
    expect(all.length).toBeGreaterThanOrEqual(2);
  });

  it("returns timeline sorted by time", async () => {
    await chron.logEvent("First", new Date("2025-01-01T00:00:00Z"), "test");
    await chron.logEvent("Second", new Date("2025-06-01T00:00:00Z"), "test");
    await chron.logEvent("Third", new Date("2025-03-01T00:00:00Z"), "test");

    const timeline = await chron.getTimeline(new Date(0), 10);
    const descriptions = timeline.map((e) => e.description);
    expect(descriptions).toContain("First");
    expect(descriptions).toContain("Second");
    expect(descriptions).toContain("Third");
  });

  it("limits results", async () => {
    for (let i = 0; i < 20; i++) {
      await chron.logEvent(`Event ${i}`, new Date(), "test");
    }
    const timeline = await chron.getTimeline(new Date(0), 5);
    expect(timeline.length).toBeLessThanOrEqual(5);
  });

  it("filters by since date", async () => {
    const chron2 = new Chronicler(join(TMP, "timeline2.jsonl"));
    await chron2.logEvent("Old event", new Date("2020-01-01T00:00:00Z"), "test");
    await chron2.logEvent("New event", new Date("2025-06-01T00:00:00Z"), "test");

    const timeline = await chron2.getTimeline(new Date("2024-01-01T00:00:00Z"), 10);
    const descs = timeline.map((e) => e.description);
    expect(descs).toContain("New event");
    expect(descs).not.toContain("Old event");
  });
});
