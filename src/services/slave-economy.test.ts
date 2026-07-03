import { describe, test, expect } from "bun:test";
import {
  createSlaveProduction, calculateSlaveSurplus, processSlaveTrade,
  calculateSlaveValue, canSlaveBeFreed, freeSlave,
} from "./slave-economy";
import { createNPCWithEconomy } from "./npc-economy";
import { RankType } from "../models/rank";

function makeSlave() {
  return createNPCWithEconomy("s1", "Slave1", RankType.SLAVE, "farmer", 25, "phlegmatic");
}

describe("createSlaveProduction", () => {
  test("returns production with positive surplus", () => {
    const p = createSlaveProduction();
    expect(p.consumption).toBe(30);
    expect(p.production).toBeGreaterThanOrEqual(300);
  });
});

describe("calculateSlaveSurplus", () => {
  test("surplus = production - consumption", () => {
    const p = { consumption: 30, production: 500, surplus: 0 };
    expect(calculateSlaveSurplus(p)).toBe(470);
  });
});

describe("processSlaveTrade", () => {
  test("changes slave rank to SLAVE", () => {
    const buyer = createNPCWithEconomy("b1", "Buyer", RankType.BARON, "noble", 40, "choleric");
    const seller = createNPCWithEconomy("s1", "Seller", RankType.COMMONER, "merchant", 35, "sanguine");
    const slave = makeSlave();
    const trade = processSlaveTrade(buyer, seller, slave, 500);
    expect(trade.price).toBe(500);
    expect(trade.buyer).toBe("b1");
    expect(trade.seller).toBe("s1");
    expect(trade.slave.rank).toBe(RankType.SLAVE);
  });
});

describe("calculateSlaveValue", () => {
  test("base value is at least 10", () => {
    const s = makeSlave();
    expect(calculateSlaveValue(s)).toBeGreaterThanOrEqual(10);
  });

  test("high wrath reduces value", () => {
    const s = makeSlave();
    s.vices.wrath = 1.0;
    const val = calculateSlaveValue(s);
    const normal = calculateSlaveValue(makeSlave());
    expect(val).toBeLessThan(normal);
  });
});

describe("canSlaveBeFreed", () => {
  test("needs 200 in treasury", () => {
    expect(canSlaveBeFreed(makeSlave(), 200)).toBe(true);
    expect(canSlaveBeFreed(makeSlave(), 199)).toBe(false);
  });
});

describe("freeSlave", () => {
  test("sets rank to commoner", () => {
    const freed = freeSlave(makeSlave(), 200);
    expect(freed.rank).toBe(RankType.COMMONER);
    expect(freed.loyalty).toBe(600);
    expect(freed.income).toBe(0);
  });

  test("wealth resets to 0", () => {
    const freed = freeSlave(makeSlave(), 200);
    expect(freed.stats.wealth).toBe(0);
  });
});
