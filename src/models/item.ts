/**
 * Item Model — Уникальные предметы с бустами
 */

export interface ItemBoost {
  stat: "wealth" | "power" | "popularity" | "health" | "experience" | "intrigue";
  multiplier: number; // 0.01-0.10 (1-10%)
  targetGroup?: string;
  reason: string;
}

export interface Item {
  id: string;
  name: string;
  nameRu?: string;
  description: string;
  isUnique: boolean;
  boost?: ItemBoost;
  owner?: string;
  evaluatedAt?: string;
  category?: string;
}

export interface ItemEvaluation {
  itemId: string;
  evaluatedAt: string;
  historianResult: {
    isUnique: boolean;
    precedent: string;
  };
  researcherResult: {
    isUseful: boolean;
    boost?: ItemBoost;
  };
}

export function createItem(
  id: string,
  name: string,
  description: string,
  category?: string,
): Item {
  return {
    id,
    name,
    description,
    isUnique: false,
    category,
  };
}

export function applyItemBoost(
  baseValue: number,
  boost: ItemBoost,
): number {
  return Math.floor(baseValue * (1 + boost.multiplier));
}

export function canAddBoost(
  currentBoosts: number,
  maxBoosts: number = 10,
): boolean {
  return currentBoosts < maxBoosts;
}

export function formatItemWithBoost(item: Item): string {
  const boostStr = item.boost
    ? ` [УНИКАЛЬНЫЙ] → +${item.boost.multiplier * 100}% ${item.boost.stat} (${item.boost.reason})`
    : "";
  return `${item.name}${boostStr}`;
}
