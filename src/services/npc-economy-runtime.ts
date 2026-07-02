/**
 * NPC Economy Runtime — Интеграция экономики с NPCRuntime
 */

import { type NPCWithEconomy, createNPCWithEconomy, updateNPCStats, processFood, processTreasury, bribeRisk, checkBetrayalRisk, losePowerToSlavery } from "./npc-economy";
import { RankType, getRankConfig, getRankIndex, RANK_CONFIGS } from "../models/rank";
import { type Vices, type Temperament, createDefaultVices, ageDecay, viceDecay } from "../models/npc-stats";
import { type ArchetypeConfig, ALL_ARCHETYPES, selectArchetype } from "../models/archetype";
import { getLogger } from "../utils/logger";

const log = getLogger("npc-economy-runtime");

export interface EconomyState {
  npcs: Map<string, NPCWithEconomy>;
  turn: number;
  foodStockpile: number;
  totalWealth: number;
}

export function createEconomyState(): EconomyState {
  return {
    npcs: new Map(),
    turn: 0,
    foodStockpile: 0,
    totalWealth: 0,
  };
}

export function addNPCToEconomy(
  state: EconomyState,
  id: string,
  name: string,
  rank: RankType,
  archetype: string,
  age: number,
  temperament: Temperament,
): EconomyState {
  const npc = createNPCWithEconomy(id, name, rank, archetype, age, temperament);
  const newNpcs = new Map(state.npcs);
  newNpcs.set(id, npc);
  return { ...state, npcs: newNpcs };
}

export function processTurn(state: EconomyState): EconomyState {
  const newNpcs = new Map<string, NPCWithEconomy>();
  let totalFoodConsumption = 0;
  let totalFoodProduction = 0;

  for (const [id, npc] of state.npcs) {
    let updated = { ...npc };

    // 1. Возраст +1
    updated.age = npc.age + 1;

    // 2. Динамика статов
    updated = updateNPCStats(updated);

    // 3. Взятки (если может брать)
    const rankConfig = getRankConfig(updated.rank);
    if (rankConfig.canTakeBribes) {
      const bribeAmount = Math.floor(updated.income * 0.15);
      if (bribeAmount > 0) {
        const risk = bribeRisk(updated.stats.intrigue, updated.stats.intrigue, bribeAmount, 1);
        if (Math.random() < risk) {
          updated.stats.wealth += bribeAmount;
          updated.stats.popularity -= 2;
          updated.totalBribes += bribeAmount;
        }
      }
    }

    // 4. Налоги
    const taxes = Math.floor(updated.income * updated.taxRate);
    updated.stats.wealth -= taxes;
    updated.treasury.taxes = taxes;

    // 5. Еда
    const food = processFood(updated);
    totalFoodConsumption += food.consumption;
    totalFoodProduction += food.production;

    // 6. Проверка на банкротство
    if (updated.stats.wealth < 0 && updated.rank !== RankType.SLAVE) {
      updated = losePowerToSlavery(updated);
      log.info({ npc: updated.name }, "NPC became slave due to bankruptcy");
    }

    // 7. Проверка на предательство
    const betrayalRisk = checkBetrayalRisk(updated.taxRate, updated.income, updated.totalBribes, updated.loyalty);
    if (betrayalRisk > 0.8 && Math.random() < betrayalRisk) {
      updated.loyalty = Math.max(0, updated.loyalty - 100);
      updated.stats.intrigue += 50;
      log.info({ npc: updated.name }, "NPC reached betrayal threshold");
    }

    newNpcs.set(id, updated);
  }

  return {
    npcs: newNpcs,
    turn: state.turn + 1,
    foodStockpile: state.foodStockpile + totalFoodProduction - totalFoodConsumption,
    totalWealth: Array.from(newNpcs.values()).reduce((sum, n) => sum + n.stats.wealth, 0),
  };
}

export function processBribes(state: EconomyState): EconomyState {
  const newNpcs = new Map(state.npcs);

  for (const [id, npc] of state.npcs) {
    if (!getRankConfig(npc.rank).canTakeBribes) continue;

    // Ищем нижестоящих для взяток
    const subordinates = Array.from(state.npcs.values()).filter(
      (n) => n.rank < npc.rank && getRankIndex(n.rank) === getRankIndex(npc.rank) - 1,
    );

    for (const sub of subordinates) {
      if (Math.random() < 0.2) {
        const bribe = Math.floor(sub.income * 0.1);
        const subUpdated = { ...sub };
        subUpdated.stats.wealth -= bribe;
        subUpdated.stats.popularity -= 1;
        subUpdated.loyalty -= 5;
        newNpcs.set(sub.id, subUpdated);

        const npcUpdated = { ...npc };
        npcUpdated.stats.wealth += bribe;
        npcUpdated.stats.power += Math.floor(bribe * 0.01);
        newNpcs.set(npc.id, npcUpdated);
      }
    }
  }

  return { ...state, npcs: newNpcs };
}

export function processInheritance(state: EconomyState, deadNpcId: string): EconomyState {
  const deadNpc = state.npcs.get(deadNpcId);
  if (!deadNpc) return state;

  const newNpcs = new Map(state.npcs);
  newNpcs.delete(deadNpcId);

  // Дети наследуют
  const children = Array.from(state.npcs.values()).filter(
    (n) => n.id.startsWith(deadNpcId + "_child"),
  );

  if (children.length > 0) {
    const sharePerChild = Math.floor(deadNpc.stats.wealth / children.length);

    for (const child of children) {
      const heir = {
        ...child,
        rank: deadNpc.rank,
        stats: {
          ...child.stats,
          wealth: sharePerChild,
          power: Math.floor(child.stats.power * 0.5),
        },
      };
      newNpcs.set(child.id, heir);
    }
  }

  // Семья в рабство
  const family = Array.from(state.npcs.values()).filter(
    (n) => n.id.startsWith(deadNpcId + "_family"),
  );

  for (const member of family) {
    const slave = {
      ...member,
      rank: RankType.SLAVE,
      stats: { ...member.stats, wealth: 0, power: 0, popularity: 0 },
    };
    newNpcs.set(member.id, slave);
  }

  return { ...state, npcs: newNpcs };
}

export function processPlayerAction(
  state: EconomyState,
  playerId: string,
  targetId: string,
  action: "help" | "betray" | "gift",
  amount: number,
): EconomyState {
  const player = state.npcs.get(playerId);
  const target = state.npcs.get(targetId);
  if (!player || !target) return state;

  const newNpcs = new Map(state.npcs);

  switch (action) {
    case "help": {
      const updatedTarget = {
        ...target,
        stats: {
          ...target.stats,
          power: target.stats.power + amount,
          popularity: target.stats.popularity + 50,
        },
        loyalty: target.loyalty + 100,
      };
      newNpcs.set(targetId, updatedTarget);

      // Соседи теряют
      const neighbors = Array.from(state.npcs.values()).filter(
        (n) => n.rank === target.rank && n.id !== targetId,
      );
      for (const n of neighbors) {
        const updated = {
          ...n,
          stats: { ...n.stats, power: n.stats.power - 20, popularity: n.stats.popularity - 10 },
        };
        newNpcs.set(n.id, updated);
      }
      break;
    }

    case "betray": {
      const updatedPlayer = {
        ...player,
        stats: { ...player.stats, wealth: player.stats.wealth + amount, popularity: player.stats.popularity - 50 },
        loyalty: player.loyalty - 100,
      };
      newNpcs.set(playerId, updatedPlayer);

      const updatedTarget = {
        ...target,
        stats: { ...target.stats, power: target.stats.power - 200, popularity: target.stats.popularity - 100 },
        loyalty: target.loyalty - 50,
      };
      newNpcs.set(targetId, updatedTarget);
      break;
    }

    case "gift": {
      const updatedPlayer = {
        ...player,
        stats: { ...player.stats, wealth: player.stats.wealth - amount },
      };
      newNpcs.set(playerId, updatedPlayer);

      const updatedTarget = {
        ...target,
        stats: { ...target.stats, wealth: target.stats.wealth + amount, popularity: target.stats.popularity + 20 },
        loyalty: target.loyalty + 30,
      };
      newNpcs.set(targetId, updatedTarget);
      break;
    }
  }

  return { ...state, npcs: newNpcs };
}

export function getEconomySummary(state: EconomyState): string {
  const npcs = Array.from(state.npcs.values());
  const byRank = new Map<RankType, number>();

  for (const npc of npcs) {
    byRank.set(npc.rank, (byRank.get(npc.rank) ?? 0) + 1);
  }

  return [
    `Ход: ${state.turn}`,
    `NPC: ${npcs.length}`,
    `Запас еды: ${state.foodStockpile}`,
    `Общее богатство: ${state.totalWealth}`,
    `По рангам:`,
    ...Array.from(byRank.entries()).map(([rank, count]) => `  ${rank}: ${count}`),
  ].join("\n");
}
