import { describe, test, expect } from "bun:test";
import {
  RankType, RANK_CONFIGS, RANK_ORDER, getRankConfig, getRankIndex,
  canPromote, getNextRank, calculateTaxCollectorsCount,
} from "./rank";

describe("rank hierarchy", () => {
  test("RANK_ORDER has 10 ranks", () => {
    expect(RANK_ORDER).toHaveLength(10);
  });

  test("slave is first, emperor is last", () => {
    expect(RANK_ORDER[0]).toBe(RankType.SLAVE);
    expect(RANK_ORDER[9]).toBe(RankType.EMPEROR);
  });

  test("all rank types have configs", () => {
    for (const rank of RANK_ORDER) {
      expect(RANK_CONFIGS[rank]).toBeDefined();
      expect(RANK_CONFIGS[rank].type).toBe(rank);
    }
  });
});

describe("getRankConfig", () => {
  test("returns correct config", () => {
    expect(getRankConfig(RankType.KING).guards).toBe(500000);
    expect(getRankConfig(RankType.SLAVE).salary).toBe(0);
  });
});

describe("getRankIndex", () => {
  test("returns position in hierarchy", () => {
    expect(getRankIndex(RankType.SLAVE)).toBe(0);
    expect(getRankIndex(RankType.COMMONER)).toBe(1);
    expect(getRankIndex(RankType.EMPEROR)).toBe(9);
  });
});

describe("canPromote", () => {
  test("commoner can promote with enough wealth", () => {
    expect(canPromote(RankType.COMMONER, 200000)).toBe(true);
  });

  test("commoner cannot promote without wealth", () => {
    expect(canPromote(RankType.COMMONER, 0)).toBe(false);
  });

  test("emperor cannot promote", () => {
    expect(canPromote(RankType.EMPEROR, Infinity)).toBe(false);
  });
});

describe("getNextRank", () => {
  test("returns next rank in hierarchy", () => {
    expect(getNextRank(RankType.SLAVE)).toBe(RankType.COMMONER);
    expect(getNextRank(RankType.KING)).toBe(RankType.EMPEROR);
  });

  test("emperor returns null", () => {
    expect(getNextRank(RankType.EMPEROR)).toBeNull();
  });
});

describe("calculateTaxCollectorsCount", () => {
  test("calculates ceiling of total/100", () => {
    expect(calculateTaxCollectorsCount(100, 0)).toBe(1);
    expect(calculateTaxCollectorsCount(50, 50)).toBe(1);
    expect(calculateTaxCollectorsCount(150, 0)).toBe(2);
    expect(calculateTaxCollectorsCount(0, 0)).toBe(0);
  });
});
