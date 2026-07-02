/**
 * NPC Economy System — Stats, Vices, Family
 */

export type Temperament = "choleric" | "sanguine" | "melancholic" | "phlegmatic";

export type ViceType =
  | "gluttony"
  | "drunkenness"
  | "greed"
  | "lust"
  | "sloth"
  | "wrath"
  | "pride"
  | "envy";

export interface NPCStats {
  wealth: number;
  power: number;
  popularity: number;
  health: number;
  experience: number;
  intrigue: number;
}

export interface Vices {
  gluttony: number;
  drunkenness: number;
  greed: number;
  lust: number;
  sloth: number;
  wrath: number;
  pride: number;
  envy: number;
}

export interface FamilyExpenses {
  wife: number;
  children: number;
  food: number;
  clothing: number;
}

export interface Inheritance {
  wealth: number;
  profession: string;
  traits: string[];
  vices: Partial<Vices>;
}

export interface NPCEconomyState {
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
}

export function createDefaultStats(rank: string): NPCStats {
  const defaults: Record<string, NPCStats> = {
    slave: { wealth: 0, power: 0, popularity: 0, health: 600, experience: 50, intrigue: 100 },
    commoner: { wealth: 100, power: 10, popularity: 50, health: 700, experience: 100, intrigue: 50 },
    baronet: { wealth: 100000, power: 100, popularity: 200, health: 750, experience: 200, intrigue: 150 },
    baron: { wealth: 500000, power: 300, popularity: 400, health: 750, experience: 300, intrigue: 200 },
    viscount: { wealth: 2000000, power: 800, popularity: 600, health: 750, experience: 400, intrigue: 300 },
    count: { wealth: 10000000, power: 2000, popularity: 800, health: 700, experience: 500, intrigue: 400 },
    marquis: { wealth: 50000000, power: 5000, popularity: 900, health: 700, experience: 600, intrigue: 500 },
    duke: { wealth: 200000000, power: 15000, popularity: 950, health: 650, experience: 700, intrigue: 600 },
    king: { wealth: 2000000000, power: 50000, popularity: 980, health: 600, experience: 800, intrigue: 700 },
    emperor: { wealth: 10000000000, power: 200000, popularity: 990, health: 550, experience: 900, intrigue: 800 },
  };
  return defaults[rank] ?? defaults.commoner!;
}

export function createDefaultVices(): Vices {
  return {
    gluttony: 0,
    drunkenness: 0,
    greed: 0,
    lust: 0,
    sloth: 0,
    wrath: 0,
    pride: 0,
    envy: 0,
  };
}

export function createDefaultFamilyExpenses(income: number): FamilyExpenses {
  return {
    wife: Math.floor(income * 0.5),
    children: Math.floor(income * 0.1),
    food: 0,
    clothing: 0,
  };
}

export function childrenCount(age: number, temperament: Temperament): number {
  let base = 0;
  if (age < 25) base = 0;
  else if (age < 35) base = 2;
  else if (age < 45) base = 3;
  else if (age < 55) base = 2;
  else if (age < 65) base = 1;
  else base = 0;

  const tempMod: Record<Temperament, number> = {
    choleric: 1,
    sanguine: 0,
    melancholic: -1,
    phlegmatic: -1,
  };
  return Math.max(0, base + (tempMod[temperament] ?? 0));
}

export function ageDecay(base: number, age: number, stamina: number): number {
  const peak = 25 + stamina * 10;
  if (age < peak) return base + (age / peak) * 200;
  if (age < 60) return base - (age - peak) * 2;
  if (age < 80) return base - (age - peak) * 5;
  return base - (age - peak) * 10;
}

export function viceDecay(stat: number, vices: Vices): number {
  let decay = 0;
  decay += vices.gluttony * vices.gluttony * 2;
  decay += vices.drunkenness * 3;
  decay += vices.lust * 2;
  decay += vices.sloth * vices.sloth;
  decay += vices.wrath * 4;
  return Math.max(0, stat - decay);
}

export function createInheritance(parent: NPCEconomyState): Inheritance {
  const wealthPct = 0.5 + Math.random() * 0.5;
  return {
    wealth: Math.floor(parent.stats.wealth * wealthPct),
    profession: "",
    traits: [],
    vices: {
      gluttony: parent.vices.gluttony * 0.3,
      drunkenness: parent.vices.drunkenness * 0.3,
      greed: parent.vices.greed * 0.3,
      lust: parent.vices.lust * 0.3,
      sloth: parent.vices.sloth * 0.3,
      wrath: parent.vices.wrath * 0.3,
      pride: parent.vices.pride * 0.3,
      envy: parent.vices.envy * 0.3,
    },
  };
}
