/**
 * NPC Economy System — Feudal Rank Hierarchy
 */

export enum RankType {
  SLAVE = "slave",
  COMMONER = "commoner",
  BARONET = "baronet",
  BARON = "baron",
  VISCOUNT = "viscount",
  COUNT = "count",
  MARQUIS = "marquis",
  DUKE = "duke",
  KING = "king",
  EMPEROR = "emperor",
}

export interface RankConfig {
  type: RankType;
  wealthMin: number;
  guards: number;
  baseTaxRate: number;
  foodConsumption: number;
  foodCost: number;
  salary: number;
  familyExpensesPct: number;
  canGiveBribes: boolean;
  canTakeBribes: boolean;
}

export const RANK_CONFIGS: Record<RankType, RankConfig> = {
  [RankType.SLAVE]: {
    type: RankType.SLAVE,
    wealthMin: 0,
    guards: 0,
    baseTaxRate: 1.0,
    foodConsumption: 30,
    foodCost: 1,
    salary: 0,
    familyExpensesPct: 0,
    canGiveBribes: false,
    canTakeBribes: false,
  },
  [RankType.COMMONER]: {
    type: RankType.COMMONER,
    wealthMin: 0,
    guards: 0,
    baseTaxRate: 0.9,
    foodConsumption: 50,
    foodCost: 5,
    salary: 0,
    familyExpensesPct: 0.6,
    canGiveBribes: true,
    canTakeBribes: false,
  },
  [RankType.BARONET]: {
    type: RankType.BARONET,
    wealthMin: 100000,
    guards: 50,
    baseTaxRate: 0.3,
    foodConsumption: 500,
    foodCost: 30,
    salary: 0,
    familyExpensesPct: 0.6,
    canGiveBribes: true,
    canTakeBribes: true,
  },
  [RankType.BARON]: {
    type: RankType.BARON,
    wealthMin: 500000,
    guards: 200,
    baseTaxRate: 0.28,
    foodConsumption: 1000,
    foodCost: 40,
    salary: 0,
    familyExpensesPct: 0.6,
    canGiveBribes: true,
    canTakeBribes: true,
  },
  [RankType.VISCOUNT]: {
    type: RankType.VISCOUNT,
    wealthMin: 2000000,
    guards: 1000,
    baseTaxRate: 0.25,
    foodConsumption: 2000,
    foodCost: 50,
    salary: 0,
    familyExpensesPct: 0.5,
    canGiveBribes: true,
    canTakeBribes: true,
  },
  [RankType.COUNT]: {
    type: RankType.COUNT,
    wealthMin: 10000000,
    guards: 5000,
    baseTaxRate: 0.22,
    foodConsumption: 5000,
    foodCost: 60,
    salary: 0,
    familyExpensesPct: 0.5,
    canGiveBribes: true,
    canTakeBribes: true,
  },
  [RankType.MARQUIS]: {
    type: RankType.MARQUIS,
    wealthMin: 50000000,
    guards: 20000,
    baseTaxRate: 0.2,
    foodConsumption: 10000,
    foodCost: 70,
    salary: 0,
    familyExpensesPct: 0.4,
    canGiveBribes: true,
    canTakeBribes: true,
  },
  [RankType.DUKE]: {
    type: RankType.DUKE,
    wealthMin: 200000000,
    guards: 100000,
    baseTaxRate: 0.18,
    foodConsumption: 20000,
    foodCost: 80,
    salary: 0,
    familyExpensesPct: 0.3,
    canGiveBribes: false,
    canTakeBribes: true,
  },
  [RankType.KING]: {
    type: RankType.KING,
    wealthMin: 2000000000,
    guards: 500000,
    baseTaxRate: 0.1,
    foodConsumption: 50000,
    foodCost: 90,
    salary: 0,
    familyExpensesPct: 0.2,
    canGiveBribes: false,
    canTakeBribes: true,
  },
  [RankType.EMPEROR]: {
    type: RankType.EMPEROR,
    wealthMin: 10000000000,
    guards: 2000000,
    baseTaxRate: 0,
    foodConsumption: 100000,
    foodCost: 100,
    salary: 0,
    familyExpensesPct: 0.1,
    canGiveBribes: false,
    canTakeBribes: true,
  },
};

export const RANK_ORDER: RankType[] = [
  RankType.SLAVE,
  RankType.COMMONER,
  RankType.BARONET,
  RankType.BARON,
  RankType.VISCOUNT,
  RankType.COUNT,
  RankType.MARQUIS,
  RankType.DUKE,
  RankType.KING,
  RankType.EMPEROR,
];

export function getRankConfig(rank: RankType): RankConfig {
  return RANK_CONFIGS[rank];
}

export function getRankIndex(rank: RankType): number {
  return RANK_ORDER.indexOf(rank);
}

export function canPromote(currentRank: RankType, wealth: number): boolean {
  const currentIdx = getRankIndex(currentRank);
  if (currentIdx >= RANK_ORDER.length - 1) return false;
  const nextRank = RANK_CONFIGS[RANK_ORDER[currentIdx + 1]!];
  return wealth >= nextRank.wealthMin;
}

export function getNextRank(currentRank: RankType): RankType | null {
  const currentIdx = getRankIndex(currentRank);
  if (currentIdx >= RANK_ORDER.length - 1) return null;
  return RANK_ORDER[currentIdx + 1] ?? null;
}

export function calculateTaxCollectorsCount(peasants: number, craftsmen: number): number {
  return Math.ceil((peasants + craftsmen) / 100);
}
