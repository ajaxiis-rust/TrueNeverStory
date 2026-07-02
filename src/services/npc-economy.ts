/**
 * NPC Economy System — Core Logic
 */

import {
  type NPCStats,
  type Vices,
  type FamilyExpenses,
  type NPCEconomyState,
  type Temperament,
  createDefaultStats,
  createDefaultVices,
  createDefaultFamilyExpenses,
  childrenCount,
  ageDecay,
  viceDecay,
} from "../models/npc-stats";
import {
  RankType,
  type RankConfig,
  RANK_CONFIGS,
  RANK_ORDER,
  getRankConfig,
  getRankIndex,
  calculateTaxCollectorsCount,
} from "../models/rank";
import { type ArchetypeConfig, ALL_ARCHETYPES, selectArchetype } from "../models/archetype";
import { getLogger } from "../utils/logger";

const log = getLogger("npc-economy");

export type BribeType = "protection" | "favor" | "silence" | "access" | "promotion" | "exemption";

export interface Bribe {
  from: string;
  to: string;
  amount: number;
  type: BribeType;
  loyaltyCost: number;
  wealthCost: number;
  wealthGain: number;
  powerGain: number;
  popularityLoss: number;
  risk: number;
}

export interface Treasury {
  balance: number;
  income: number;
  expenses: number;
  taxes: number;
  tribute: number;
}

export interface FoodProduction {
  consumption: number;
  production: number;
  surplus: number;
}

export interface NPCWithEconomy {
  id: string;
  name: string;
  rank: RankType;
  archetype: string;
  stats: NPCStats;
  vices: Vices;
  age: number;
  temperament: Temperament;
  loyalty: number;
  income: number;
  taxRate: number;
  totalBribes: number;
  familyExpenses: FamilyExpenses;
  children: number;
  treasury: Treasury;
}

export function createNPCWithEconomy(
  id: string,
  name: string,
  rank: RankType,
  archetype: string,
  age: number,
  temperament: Temperament,
): NPCWithEconomy {
  const rankConfig = getRankConfig(rank);
  const stats = createDefaultStats(rank);
  const vices = createDefaultVices();
  const income = rankConfig.salary;
  const familyExpenses = createDefaultFamilyExpenses(income);

  return {
    id,
    name,
    rank,
    archetype,
    stats,
    vices,
    age,
    temperament,
    loyalty: 500,
    income,
    taxRate: rankConfig.baseTaxRate,
    totalBribes: 0,
    familyExpenses,
    children: childrenCount(age, temperament),
    treasury: {
      balance: 0,
      income: 0,
      expenses: 0,
      taxes: 0,
      tribute: 0,
    },
  };
}

export function calculateTaxRate(power: number, popularity: number, rank: RankType): number {
  const rankConfig = getRankConfig(rank);
  const baseTax = rankConfig.baseTaxRate;
  const powerDiscount = Math.min(0.9, power / 10000);
  const popDiscount = Math.min(0.3, popularity / 3000);
  return Math.max(0, baseTax * (1 - powerDiscount - popDiscount));
}

export function bribeRisk(
  giverIntrigue: number,
  takerIntrigue: number,
  amount: number,
  witnesses: number,
): number {
  const baseRisk = 0.1;
  const amountRisk = amount / 10000;
  const witnessRisk = witnesses * 0.15;
  const takerSkill = Math.min(0.5, takerIntrigue * 0.001);
  return Math.max(0, Math.min(0.95, baseRisk + amountRisk + witnessRisk - takerSkill));
}

export function checkBetrayalRisk(
  taxRate: number,
  income: number,
  totalBribes: number,
  loyalty: number,
): number {
  if (income <= 0) return 1;
  const taxBurden = taxRate * income;
  const totalBurden = taxBurden + totalBribes;
  const burdenRatio = totalBurden / income;
  const loyaltyFactor = loyalty / 1000;
  return burdenRatio * (1 - loyaltyFactor);
}

export function processBribe(giver: NPCWithEconomy, taker: NPCWithEconomy, amount: number, type: BribeType): Bribe {
  const risk = bribeRisk(giver.stats.intrigue, taker.stats.intrigue, amount, 1);
  const loyaltyCost = Math.floor(amount * 0.1);
  const wealthGain = Math.floor(amount * 0.9);
  const powerGain = Math.floor(amount * 0.01);

  return {
    from: giver.id,
    to: taker.id,
    amount,
    type,
    loyaltyCost,
    wealthCost: amount,
    wealthGain,
    powerGain,
    popularityLoss: 2,
    risk,
  };
}

export function canBuyFreedom(treasury: number, rank: RankType): boolean {
  const rankConfig = getRankConfig(rank);
  const freedomCost = rankConfig.wealthMin * 0.5;
  return treasury >= freedomCost;
}

export function losePowerToSlavery(npc: NPCWithEconomy): NPCWithEconomy {
  return {
    ...npc,
    rank: RankType.SLAVE,
    stats: {
      wealth: 0,
      power: 0,
      popularity: 0,
      health: npc.stats.health,
      experience: npc.stats.experience,
      intrigue: npc.stats.intrigue,
    },
    loyalty: 500,
    income: 0,
    taxRate: 1.0,
    totalBribes: 0,
    familyExpenses: createDefaultFamilyExpenses(0),
    treasury: {
      balance: 0,
      income: 0,
      expenses: 0,
      taxes: 0,
      tribute: 0,
    },
  };
}

export function slaveEconomy(slave: NPCWithEconomy): FoodProduction {
  const consumption = 30;
  const production = 300 + Math.floor(Math.random() * 701);
  return {
    consumption,
    production,
    surplus: production - consumption,
  };
}

export function updateNPCStats(npc: NPCWithEconomy): NPCWithEconomy {
  const rankConfig = getRankConfig(npc.rank);

  const healthAfterAge = ageDecay(npc.stats.health, npc.age, 0.5);
  const healthAfterVices = viceDecay(healthAfterAge, npc.vices);

  const experienceAfterVices = viceDecay(npc.stats.experience, {
    ...npc.vices,
    sloth: npc.vices.sloth * 2,
  });

  const popularityAfterVices = viceDecay(npc.stats.popularity, {
    ...npc.vices,
    wrath: npc.vices.wrath * 2,
    pride: npc.vices.pride * 0.5,
    envy: npc.vices.envy,
  });

  const intrigueAfterVices = viceDecay(npc.stats.intrigue, {
    ...npc.vices,
    sloth: npc.vices.sloth * 2,
    lust: npc.vices.lust * 0.5,
  });

  const powerAfterVices = viceDecay(npc.stats.power, {
    ...npc.vices,
    sloth: npc.vices.sloth * 3,
    wrath: npc.vices.wrath * 0.5,
    pride: npc.vices.pride * 0.5,
  });

  return {
    ...npc,
    age: npc.age + 1,
    stats: {
      wealth: npc.stats.wealth,
      power: Math.max(0, powerAfterVices),
      popularity: Math.max(0, popularityAfterVices),
      health: Math.max(0, Math.min(1000, healthAfterVices)),
      experience: Math.max(0, experienceAfterVices),
      intrigue: Math.max(0, intrigueAfterVices),
    },
    taxRate: calculateTaxRate(npc.stats.power, npc.stats.popularity, npc.rank),
  };
}

export function processFood(npc: NPCWithEconomy): FoodProduction {
  const rankConfig = getRankConfig(npc.rank);

  if (npc.rank === RankType.SLAVE) {
    return slaveEconomy(npc);
  }

  const consumption = rankConfig.foodConsumption;

  // Фермеры и рыбаки производят еду
  let production = 0;
  if (npc.archetype === "farmer" || npc.archetype === "fisherman") {
    production = 500 + Math.floor(Math.random() * 501); // 500-1000
  }

  return {
    consumption,
    production,
    surplus: production - consumption,
  };
}

export function processTreasury(npc: NPCWithEconomy): Treasury {
  const rankConfig = getRankConfig(npc.rank);
  const income = npc.income;
  const taxes = Math.floor(income * npc.taxRate);
  const tribute = Math.floor(npc.stats.power * 0.01);

  return {
    balance: npc.treasury.balance + income + tribute - taxes,
    income: income + tribute,
    expenses: npc.familyExpenses.wife + npc.familyExpenses.children + npc.familyExpenses.food + npc.familyExpenses.clothing,
    taxes,
    tribute,
  };
}

export function processInheritance(parent: NPCWithEconomy): NPCWithEconomy[] {
  const inheritance = {
    wealth: Math.floor(parent.stats.wealth * (0.5 + Math.random() * 0.5)),
  };

  const childrenNPCs: NPCWithEconomy[] = [];
  for (let i = 0; i < parent.children; i++) {
    childrenNPCs.push(
      createNPCWithEconomy(
        `${parent.id}_child_${i}`,
        `${parent.name}_младший`,
        parent.rank,
        parent.archetype,
        18,
        parent.temperament,
      ),
    );
  }

  return childrenNPCs;
}

export function getNPCRankTitle(rank: RankType): string {
  const titles: Record<RankType, string> = {
    [RankType.SLAVE]: "Раб",
    [RankType.COMMONER]: "Простолюдин",
    [RankType.BARONET]: "Баронет",
    [RankType.BARON]: "Барон",
    [RankType.VISCOUNT]: "Виконт",
    [RankType.COUNT]: "Граф",
    [RankType.MARQUIS]: "Маркиз",
    [RankType.DUKE]: "Герцог",
    [RankType.KING]: "Король",
    [RankType.EMPEROR]: "Император",
  };
  return titles[rank];
}

export function getNPCSummary(npc: NPCWithEconomy): string {
  return [
    `${npc.name} (${getNPCRankTitle(npc.rank)})`,
    `Возраст: ${npc.age}`,
    `Богатство: ${npc.stats.wealth}`,
    `Могущество: ${npc.stats.power}`,
    `Популярность: ${npc.stats.popularity}`,
    `Здоровье: ${npc.stats.health}`,
    `Опыт: ${npc.stats.experience}`,
    `Интриги: ${npc.stats.intrigue}`,
    `Лояльность: ${npc.loyalty}`,
    `Дети: ${npc.children}`,
  ].join("\n");
}
