/**
 * NPC Economy System — Slave Economy
 */

import { type NPCWithEconomy, type FoodProduction, type Bribe } from "./npc-economy";
import { RankType } from "../models/rank";
import { getLogger } from "../utils/logger";

const log = getLogger("slave-economy");

export interface SlaveTrade {
  buyer: string;
  seller: string;
  slave: NPCWithEconomy;
  price: number;
}

export interface SlaveProduction {
  consumption: number;
  production: number;
  surplus: number;
}

export function createSlaveProduction(): SlaveProduction {
  return {
    consumption: 30,
    production: 300 + Math.floor(Math.random() * 701),
    surplus: 0,
  };
}

export function calculateSlaveSurplus(production: SlaveProduction): number {
  return production.production - production.consumption;
}

export function processSlaveTrade(buyer: NPCWithEconomy, seller: NPCWithEconomy, slave: NPCWithEconomy, price: number): SlaveTrade {
  return {
    buyer: buyer.id,
    seller: seller.id,
    slave: { ...slave, rank: RankType.SLAVE },
    price,
  };
}

export function calculateSlaveValue(slave: NPCWithEconomy): number {
  let value = 100;

  value += slave.stats.experience * 0.1;
  value += slave.stats.health * 0.05;

  if (slave.vices.greed > 0.5) value -= 20;
  if (slave.vices.wrath > 0.5) value -= 30;
  if (slave.vices.sloth > 0.5) value -= 40;

  return Math.max(10, Math.floor(value));
}

export function canSlaveBeFreed(slave: NPCWithEconomy, treasury: number): boolean {
  return treasury >= 200;
}

export function freeSlave(slave: NPCWithEconomy, cost: number): NPCWithEconomy {
  return {
    ...slave,
    rank: RankType.COMMONER,
    stats: {
      wealth: 0,
      power: 0,
      popularity: 0,
      health: slave.stats.health,
      experience: slave.stats.experience,
      intrigue: slave.stats.intrigue,
    },
    loyalty: 600,
    income: 0,
    taxRate: 0.9,
    totalBribes: 0,
  };
}

export function processSlaveRebellion(slaves: NPCWithEconomy[], guards: NPCWithEconomy[]): {
  success: boolean;
  slaves: NPCWithEconomy[];
  guards: NPCWithEconomy[];
  casualties: number;
} {
  const slaveStrength = slaves.reduce((sum, s) => sum + s.stats.health * 0.01, 0);
  const guardStrength = guards.reduce((sum, g) => sum + g.stats.power * 0.1, 0);

  const successChance = slaveStrength / (slaveStrength + guardStrength + 0.01);
  const success = Math.random() < successChance;

  const casualties = success
    ? Math.floor(guards.length * 0.3)
    : Math.floor(slaves.length * 0.5);

  return {
    success,
    slaves,
    guards,
    casualties,
  };
}

export function createSlaveFamily(parent: NPCWithEconomy, count: number): NPCWithEconomy[] {
  const family: NPCWithEconomy[] = [];
  for (let i = 0; i < count; i++) {
    family.push({
      id: `${parent.id}_slave_child_${i}`,
      name: `${parent.name}_младший`,
      rank: RankType.SLAVE,
      archetype: parent.archetype,
      stats: {
        wealth: 0,
        power: 0,
        popularity: 0,
        health: 500 + Math.floor(Math.random() * 200),
        experience: 10,
        intrigue: 50,
      },
      vices: { ...parent.vices },
      age: 0,
      temperament: parent.temperament,
      loyalty: 500,
      income: 0,
      taxRate: 1.0,
      totalBribes: 0,
      familyExpenses: { wife: 0, children: 0, food: 0, clothing: 0 },
      children: 0,
      treasury: { balance: 0, income: 0, expenses: 0, taxes: 0, tribute: 0 },
    });
  }
  return family;
}

export function getSlaveSummary(slave: NPCWithEconomy): string {
  return [
    `Раб: ${slave.name}`,
    `Возраст: ${slave.age}`,
    `Здоровье: ${slave.stats.health}`,
    `Опыт: ${slave.stats.experience}`,
    `Интриги: ${slave.stats.intrigue}`,
  ].join("\n");
}
