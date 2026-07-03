import { describe, it, expect } from "bun:test";
import {
  cosineSimilarityFull,
  l2DistanceFull,
  dotProductFull,
  batchCosineSimilarity,
  batchAgeDecay,
  batchViceDecay,
  batchTax,
  batchWealthSum,
  batchLoyaltyCheck,
  batchRandomRoll,
  rrfFusion,
  batchRelationshipStrength,
  batchReputation,
  batchSuccessChance,
  batchRoll,
  getBackend,
  isMojoAvailable,
} from "./mojo-ffi";

describe("Mojo FFI - Full Vector Operations", () => {
  it("cosineSimilarityFull returns correct value", () => {
    const a = new Float32Array([1, 0, 0, 1, 0.5, 0.3]);
    const b = new Float32Array([0.5, 0.5, 0, 1, 0.2, 0.8]);
    const result = cosineSimilarityFull(a, b);
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThan(1);
  });

  it("cosineSimilarityFull returns 1.0 for identical vectors", () => {
    const a = new Float32Array([1, 2, 3, 4]);
    const b = new Float32Array([1, 2, 3, 4]);
    const result = cosineSimilarityFull(a, b);
    expect(result).toBeCloseTo(1.0, 5);
  });

  it("cosineSimilarityFull returns 0.0 for orthogonal vectors", () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([0, 1]);
    const result = cosineSimilarityFull(a, b);
    expect(result).toBeCloseTo(0.0, 5);
  });

  it("l2DistanceFull returns correct distance", () => {
    const a = new Float32Array([0, 0]);
    const b = new Float32Array([3, 4]);
    const result = l2DistanceFull(a, b);
    expect(result).toBeCloseTo(5.0, 5);
  });

  it("dotProductFull returns correct dot product", () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([4, 5, 6]);
    const result = dotProductFull(a, b);
    expect(result).toBeCloseTo(32.0, 5);
  });

  it("batchCosineSimilarity returns correct count", () => {
    const query = new Float32Array([1, 0, 0, 1]);
    const db = [
      new Float32Array([1, 0, 0, 1]),
      new Float32Array([0, 1, 1, 0]),
    ];
    const results = batchCosineSimilarity(query, db, 4);
    expect(results).toHaveLength(2);
    expect(results[0]).toBeCloseTo(1.0, 2);
    expect(results[1]).toBeCloseTo(0.0, 2);
  });

  it("batchCosineSimilarity handles empty database", () => {
    const query = new Float32Array([1, 0, 0, 1]);
    const db: Float32Array[] = [];
    const results = batchCosineSimilarity(query, db, 4);
    expect(results).toHaveLength(0);
  });

  it("getBackend returns valid backend", () => {
    const backend = getBackend();
    expect(["mojo", "mojo-partial", "typescript"]).toContain(backend);
  });

  it("isMojoAvailable returns boolean", () => {
    const available = isMojoAvailable();
    expect(typeof available).toBe("boolean");
  });
});

describe("Mojo FFI - Batch Operations", () => {
  it("batchAgeDecay modifies health correctly", () => {
    const health = new Float32Array([100, 200, 300]);
    const ages = new Int32Array([10, 50, 90]);
    batchAgeDecay(health, ages, 10);
    // Age 10: factor -0.5, health = 100 - 10*(-0.5) = 105
    // Age 50: factor 0.3, health = 200 - 10*0.3 = 197
    // Age 90: factor 1.0, health = 300 - 10*1.0 = 290
    expect(health[0]).toBeCloseTo(105, 0);
    expect(health[1]).toBeCloseTo(197, 0);
    expect(health[2]).toBeCloseTo(290, 0);
  });

  it("batchTax calculates tax correctly", () => {
    const income = new Float32Array([1000, 2000, 3000]);
    const taxRate = new Float32Array([0.1, 0.2, 0.3]);
    const result = batchTax(income, taxRate);
    expect(result[0]).toBe(100);
    expect(result[1]).toBe(400);
    expect(result[2]).toBe(900);
  });

  it("batchWealthSum sums correctly", () => {
    const wealth = new Float32Array([100, 200, 300]);
    const result = batchWealthSum(wealth);
    expect(result).toBe(600);
  });

  it("batchLoyaltyCheck identifies low loyalty", () => {
    const loyalty = new Float32Array([0.3, 0.7, 0.5]);
    const result = batchLoyaltyCheck(loyalty, 0.5);
    expect(result[0]).toBe(1); // 0.3 < 0.5
    expect(result[1]).toBe(0); // 0.7 >= 0.5
    expect(result[2]).toBe(0); // 0.5 >= 0.5
  });

  it("batchRandomRoll returns correct count", () => {
    const probs = new Float32Array([0.5, 0.5, 0.5]);
    const result = batchRandomRoll(probs);
    expect(result).toHaveLength(3);
    // Each result should be 0 or 1
    for (let i = 0; i < result.length; i++) {
      expect([0, 1]).toContain(result[i]!);
    }
  });
});

describe("Mojo FFI - Graph Operations", () => {
  it("rrfFusion computes correct scores", () => {
    const scores = new Float32Array([0.9, 0.8, 0.7, 0.6, 0.5, 0.4]);
    const ranks = new Int32Array([0, 1, 2, 0, 1, 2]);
    const result = rrfFusion(scores, ranks, 2, 3, 60);
    expect(result).toHaveLength(3);
    // Item 0: rank 0 in both lists => 1/(60+0+1) + 1/(60+0+1) = 2/61
    expect(result[0]).toBeCloseTo(2 / 61, 5);
  });

  it("batchRelationshipStrength finds relationships", () => {
    const srcUids = new Int32Array([1, 2, 1, 3]);
    const tgtUids = new Int32Array([10, 20, 30, 40]);
    const strengths = new Float32Array([0.8, 0.6, 0.9, 0.7]);
    const result = batchRelationshipStrength(srcUids, tgtUids, strengths, 1);
    expect(result.count).toBe(2);
    expect(result.strengths[0]).toBeCloseTo(0.8, 5);
    expect(result.strengths[1]).toBeCloseTo(0.9, 5);
  });

  it("batchReputation computes reputation scores", () => {
    const relStrengths = new Float32Array([0.8, 0.6, 0.5]);
    const relTypes = new Int32Array([0, 1, 3]); // friend, enemy, romantic
    const result = batchReputation(relStrengths, relTypes);
    expect(result).toHaveLength(3);
    // friend: 0.5 + 0.8*0.1 = 0.58
    expect(result[0]).toBeCloseTo(0.58, 2);
    // enemy: 0.5 - 0.6*0.15 = 0.41
    expect(result[1]).toBeCloseTo(0.41, 2);
    // romantic: 0.5 + 0.5*0.05 = 0.525
    expect(result[2]).toBeCloseTo(0.525, 2);
  });
});

describe("Mojo FFI - Batch Probability Operations", () => {
  it("batchSuccessChance computes correctly", () => {
    const skill = new Float32Array([0.8, 0.5]);
    const difficulty = new Float32Array([0.2, 0.8]);
    const luck = new Float32Array([0.5, 0.5]);
    const modSum = new Float32Array([0.1, 0.1]);
    const result = batchSuccessChance(skill, difficulty, luck, modSum);
    expect(result).toHaveLength(2);
    // skill=0.8, diff=0.2: base = 0.8*(1-0.2*0.5) = 0.8*0.9 = 0.72
    // base *= 0.7+0.5*0.3 = 0.85 => 0.72*0.85 = 0.612
    // result = 0.612 + 0.1 = 0.712
    expect(result[0]).toBeCloseTo(0.712, 2);
  });

  it("batchRoll returns correct outcomes", () => {
    const prob = new Float32Array([0.5, 0.5, 0.5]);
    const roll = new Float32Array([0.6, 0.4, 0.2]); // fail, fail, success
    const result = batchRoll(prob, roll);
    expect(result).toHaveLength(3);
    // roll=0.6 > prob=0.5, diff=0.1 < 0.3 => quality 1
    expect(result[0]).toBe(1);
    // roll=0.4 < prob=0.5, ratio=0.8 > 0.6 => quality 2
    expect(result[1]).toBe(2);
    // roll=0.2 < prob=0.5, ratio=0.4 < 0.6 but > 0.3 => quality 3
    expect(result[2]).toBe(3);
  });
});