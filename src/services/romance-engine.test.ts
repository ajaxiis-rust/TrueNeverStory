import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { RelationshipMemory, RomanceStatus, RomanceProgression } from "../models/romance";
import { ROMANCE_ATTRACTION, ROMANCE_CONFESSION, ROMANCE_DATE, ROMANCE_KISS, ROMANCE_PROPOSAL, ROMANCE_BREAKUP } from "./romance-profiles";

describe("RomanceModels", () => {
  describe("RelationshipMemory", () => {
    it("creates with defaults", () => {
      const rel = new RelationshipMemory({
        pair_id: "alice_bob",
        status: RomanceStatus.STRANGER,
        progression_stage: RomanceProgression.ATTRACTION,
        compatibility: 0.7,
        affection: 0.3,
      });
      expect(rel.pairId).toBe("alice_bob");
      expect(rel.status).toBe(RomanceStatus.STRANGER);
      expect(rel.compatibility).toBe(0.7);
      expect(rel.affection).toBe(0.3);
      expect(rel.history).toEqual([]);
      expect(rel.giftsGiven).toEqual([]);
    });

    it("clamps compatibility and affection", () => {
      const rel = new RelationshipMemory({
        pair_id: "test",
        status: RomanceStatus.STRANGER,
        progression_stage: RomanceProgression.ATTRACTION,
        compatibility: 2.0,
        affection: -1.0,
      });
      expect(rel.compatibility).toBe(1.0);
      expect(rel.affection).toBe(0.0);
    });

    it("serializes and deserializes", () => {
      const rel = new RelationshipMemory({
        pair_id: "alice_bob",
        status: RomanceStatus.DATING,
        progression_stage: RomanceProgression.DATE,
        compatibility: 0.8,
        affection: 0.6,
        history: [{ type: "date", success: true }],
        notes: "Nice dinner",
        gifts_given: ["rose"],
      });
      const dict = rel.toDict();
      const restored = RelationshipMemory.fromDict(dict as unknown as Record<string, unknown>);
      expect(restored.pairId).toBe("alice_bob");
      expect(restored.status).toBe(RomanceStatus.DATING);
      expect(restored.affection).toBe(0.6);
      expect(restored.history.length).toBe(1);
      expect(restored.notes).toBe("Nice dinner");
      expect(restored.giftsGiven).toEqual(["rose"]);
    });
  });

  describe("RomanceProfiles", () => {
    it("attraction has correct parameters", () => {
      expect(ROMANCE_ATTRACTION.getParamNames()).toContain("charisma");
      expect(ROMANCE_ATTRACTION.getParamNames()).toContain("compatibility");
      expect(ROMANCE_ATTRACTION.getParamNames()).toContain("mood");
      expect(ROMANCE_ATTRACTION.getParamNames()).toContain("environment");
      expect(ROMANCE_ATTRACTION.getParamNames()).toContain("past_affection");
    });

    it("confession has correct parameters", () => {
      expect(ROMANCE_CONFESSION.getParamNames()).toContain("affection");
      expect(ROMANCE_CONFESSION.getParamNames()).toContain("compatibility");
      expect(ROMANCE_CONFESSION.getParamNames()).toContain("charisma");
    });

    it("date has correct parameters", () => {
      expect(ROMANCE_DATE.getParamNames()).toContain("affection");
      expect(ROMANCE_DATE.getParamNames()).toContain("timing");
    });

    it("kiss has correct parameters", () => {
      expect(ROMANCE_KISS.getParamNames()).toContain("affection");
      expect(ROMANCE_KISS.getParamNames()).toContain("past_moments");
    });

    it("proposal has correct parameters", () => {
      expect(ROMANCE_PROPOSAL.getParamNames()).toContain("affection");
      expect(ROMANCE_PROPOSAL.getParamNames()).toContain("relationship_duration");
      expect(ROMANCE_PROPOSAL.getParamNames()).toContain("family_approval");
    });

    it("breakup has correct parameters", () => {
      expect(ROMANCE_BREAKUP.getParamNames()).toContain("affection");
      expect(ROMANCE_BREAKUP.getParamNames()).toContain("conflict_level");
      expect(ROMANCE_BREAKUP.getParamNames()).toContain("external_pressure");
    });

    it("breakup uses inverted thresholds", () => {
      expect(ROMANCE_BREAKUP.criticalSuccessThreshold).toBe(0.25);
      expect(ROMANCE_BREAKUP.criticalFailureThreshold).toBe(0.75);
    });

    it("confession has higher difficulty", () => {
      expect(ROMANCE_CONFESSION.difficultyModifier).toBeGreaterThan(ROMANCE_ATTRACTION.difficultyModifier);
    });

    it("proposal has highest difficulty", () => {
      expect(ROMANCE_PROPOSAL.difficultyModifier).toBeGreaterThanOrEqual(ROMANCE_CONFESSION.difficultyModifier);
    });
  });
});
