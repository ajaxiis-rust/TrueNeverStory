import { describe, it, expect, beforeEach } from "bun:test";
import { StoryArcManager } from "./story-arc-manager";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TMP = join(tmpdir(), `tns-sam-test-${Date.now()}`);

describe("StoryArcManager", () => {
  let mgr: StoryArcManager;

  beforeEach(() => {
    if (!existsSync(TMP)) mkdirSync(TMP, { recursive: true });
    mgr = new StoryArcManager(TMP);
  });

  it("creates and retrieves an arc", () => {
    const arc = mgr.createArc("Hero's Journey", "Character:Kaelen", "hero", [
      { description: "Call to adventure", required_beats: [], completed: false },
      { description: "Trials", required_beats: [], completed: false },
    ]);

    expect(arc.id).toBeTruthy();
    expect(arc.name).toBe("Hero's Journey");
    expect(arc.protagonist).toBe("Character:Kaelen");
    expect(arc.arcType).toBe("hero");
    expect(arc.currentPhase).toBe(0);

    const retrieved = mgr.getArc(arc.id);
    expect(retrieved).toBeTruthy();
    expect(retrieved!.name).toBe("Hero's Journey");
  });

  it("advances phase", () => {
    const arc = mgr.createArc("Test", "C:1", "tragedy", [
      { description: "p1", required_beats: [], completed: false },
      { description: "p2", required_beats: [], completed: false },
    ]);

    expect(mgr.advancePhase(arc.id)).toBe(true);
    const updated = mgr.getArc(arc.id);
    expect(updated!.currentPhase).toBe(1);

    expect(mgr.advancePhase(arc.id)).toBe(false);
  });

  it("returns false for nonexistent arc advance", () => {
    expect(mgr.advancePhase("nonexistent")).toBe(false);
  });

  it("adds timeline events", () => {
    const arc = mgr.createArc("Test", "C:1", "villain", []);
    mgr.addEvent(arc.id, "Something happened");

    const updated = mgr.getArc(arc.id);
    expect(updated!.timeline).toHaveLength(1);
    expect(updated!.timeline[0]!.description).toBe("Something happened");
  });

  it("filters arcs by character", () => {
    mgr.createArc("Arc A", "C:1", "hero", []);
    mgr.createArc("Arc B", "C:2", "villain", []);
    mgr.createArc("Arc C", "C:1", "redemption", []);

    const arcs = mgr.getArcsForCharacter("C:1");
    expect(arcs).toHaveLength(2);
  });

  it("lists all arcs", () => {
    mgr.createArc("A", "C:1", "hero", []);
    mgr.createArc("B", "C:2", "villain", []);
    expect(mgr.listArcs()).toHaveLength(2);
  });

  it("deletes an arc", () => {
    const arc = mgr.createArc("ToDelete", "C:1", "tragedy", []);
    expect(mgr.deleteArc(arc.id)).toBe(true);
    expect(mgr.getArc(arc.id)).toBeUndefined();
    expect(mgr.deleteArc(arc.id)).toBe(false);
  });
});
