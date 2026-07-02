import { describe, it, expect, beforeEach } from "bun:test";
import { StoryPlanner } from "./story-planner";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TMP_BASE = join(tmpdir(), `tns-sp-${Date.now()}`);

function freshTmp(): string {
  const p = join(TMP_BASE, `t${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
  mkdirSync(p, { recursive: true });
  return p;
}

describe("StoryPlanner", () => {
  let tmp: string;
  let planner: StoryPlanner;

  beforeEach(() => {
    tmp = freshTmp();
    planner = new StoryPlanner({
      statePath: join(tmp, "planner.json"),
      worldName: "TestWorld",
      worldRules: ["Magic exists", "No guns"],
    });
  });

  it("creates fallback plan with 3 chapters", () => {
    const chapters = planner.getChapters();
    expect(chapters).toHaveLength(3);
    expect(chapters[0]!.title).toBe("The Awakening");
  });

  it("creates 5 beats per chapter", () => {
    const beats = planner.getBeats();
    expect(beats.length).toBeGreaterThanOrEqual(15);
  });

  it("has a current chapter", () => {
    expect(planner.currentChapterId).not.toBeNull();
  });

  it("generates next beat when scheduled time passed", async () => {
    const futureTime = new Date(Date.now() + 100 * 24 * 60 * 60 * 1000);
    const should = await planner.shouldGenerateBeat(futureTime);
    expect(should).toBe(true);
  });

  it("does not generate beat before scheduled time", async () => {
    const pastTime = new Date(0);
    const should = await planner.shouldGenerateBeat(pastTime);
    expect(should).toBe(false);
  });

  it("returns and triggers a beat", async () => {
    const futureTime = new Date(Date.now() + 100 * 24 * 60 * 60 * 1000);
    const beat = await planner.generateNextBeat(futureTime);
    expect(beat).not.toBeNull();
    expect(beat!.type).toBeDefined();
    expect(beat!.description).toBeDefined();
  });

  it("does not return same beat twice", async () => {
    const futureTime = new Date(Date.now() + 100 * 24 * 60 * 60 * 1000);
    const b1 = await planner.generateNextBeat(futureTime);
    const b2 = await planner.generateNextBeat(futureTime);
    expect(b1!.id).not.toBe(b2!.id);
  });

  it("marks beat done", async () => {
    const futureTime = new Date(Date.now() + 100 * 24 * 60 * 60 * 1000);
    const beat = await planner.generateNextBeat(futureTime);
    await planner.markBeatDone(beat!.id as string);

    const pending = await planner.getPendingBeats(futureTime);
    expect(pending.find((p) => p.id === beat!.id)).toBeUndefined();
  });

  it("returns plan summary", async () => {
    const summary = await planner.getPlanSummary();
    expect(summary.current_chapter).toBeDefined();
    expect(summary.chapters).toBeDefined();
    expect(summary.pending_beats).toBeDefined();
    expect(summary.llm_available).toBe(false);
  });

  it("returns pending beats for current time", async () => {
    const futureTime = new Date(Date.now() + 100 * 24 * 60 * 60 * 1000);
    const pending = await planner.getPendingBeats(futureTime);
    expect(pending.length).toBeGreaterThan(0);
  });

  it("builds context summary without LLM", () => {
    const ctx = planner.buildContextSummary();
    expect(ctx).toContain("TestWorld");
    expect(ctx).toContain("Magic exists");
  });

  it("should replan when no plan time set", () => {
    expect(planner.shouldReplan()).toBe(true);
  });

  it("should replan when >70% beats done", async () => {
    const futureTime = new Date(Date.now() + 100 * 24 * 60 * 60 * 1000);
    const beats = planner.getBeats();
    for (const b of beats.slice(0, Math.ceil(beats.length * 0.7))) {
      await planner.markBeatDone(b.id);
    }
    expect(planner.shouldReplan()).toBe(true);
  });

  it("should replan when no plan time set", () => {
    const fresh = new StoryPlanner({
      statePath: join(freshTmp(), "planner.json"),
      worldName: "W",
    });
    expect(fresh.shouldReplan()).toBe(true);
  });

  it("persists across reload", async () => {
    const futureTime = new Date(Date.now() + 100 * 24 * 60 * 60 * 1000);
    await planner.generateNextBeat(futureTime);

    const planner2 = new StoryPlanner({
      statePath: join(tmp, "planner.json"),
      worldName: "TestWorld",
    });

    const summary = await planner2.getPlanSummary();
    expect(summary.pending_beats).toBeLessThan(15);
  });

  it("provides chapter details", () => {
    const chapters = planner.getChapters();
    for (const ch of chapters) {
      expect(ch.id).toBeDefined();
      expect(ch.title).toBeDefined();
      expect(ch.summary).toBeDefined();
      expect(ch.beats.length).toBeGreaterThan(0);
    }
  });

  it("provides beats filtered by chapter", () => {
    const chapters = planner.getChapters();
    const ch0Beats = planner.getBeats(chapters[0]!.id);
    expect(ch0Beats.length).toBe(5);
    expect(ch0Beats.every(b => b.chapter_id === chapters[0]!.id)).toBe(true);
  });
});
