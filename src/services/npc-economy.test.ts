import { describe, test, expect } from "bun:test";
import {
  createNPCWithEconomy, processBribe,
} from "./npc-economy";
import { RankType } from "../models/rank";
import { createDefaultVices } from "../models/npc-stats";

function makeNPC(rank = RankType.COMMONER) {
  return createNPCWithEconomy("npc1", "Test", rank, "farmer", 30, "phlegmatic");
}

describe("processBribe", () => {
  test("returns bribe object with correct fields", () => {
    const giver = makeNPC();
    const taker = makeNPC(RankType.BARON);
    const bribe = processBribe(giver, taker, 500, "promotion");
    expect(bribe.from).toBe("npc1");
    expect(bribe.to).toBe("npc1");
    expect(bribe.amount).toBe(500);
    expect(bribe.type).toBe("promotion");
    expect(typeof bribe.risk).toBe("number");
    expect(typeof bribe.loyaltyCost).toBe("number");
    expect(typeof bribe.wealthGain).toBe("number");
  });

  test("wealthGain is 90% of amount", () => {
    const bribe = processBribe(makeNPC(), makeNPC(), 1000, "favor");
    expect(bribe.wealthGain).toBe(900);
  });

  test("loyaltyCost is 10% of amount", () => {
    const bribe = processBribe(makeNPC(), makeNPC(), 1000, "silence");
    expect(bribe.loyaltyCost).toBe(100);
  });
});
