/**
 * Birth System — character creation/reincarnation with probability rolls, LLM family trees,
 * and narrative generation. Replaces world_narrative/birth.py.
 *
 * Entry point: BirthScenario.generateAndApply()
 */

import { randomUUID } from "node:crypto";
import { TaskPriority } from "../models/director";
import { LayeredProfile, EntityNode } from "../models/entity";
import type { UnifiedEntityStore } from "../store/entity-store";
import type { GraphStore } from "./graph-store";
import type { LLMQueue } from "../lib/llm-queue";
import type { NPCRuntime } from "./npc-runtime";
import type { Chronicler } from "./chronicler";
import type { WorldClock } from "./world-clock";
import { getLogger } from "../utils/logger";

const log = getLogger("birth");

// ═══════════════════════════════════════════════════════════════════
// ENUMS
// ═══════════════════════════════════════════════════════════════════

export type SocialClass = "slave" | "peasant" | "commoner" | "merchant" | "nobility" | "royalty";

export type BirthCircumstance = "normal" | "prophecy" | "omen" | "tragedy" | "miracle" | "secret";

export type Gender = "male" | "female" | "non_binary" | "other";

export type ArcType = "hero" | "villain" | "redemption" | "tragedy" | "coming_of_age";

// ═══════════════════════════════════════════════════════════════════
// DATA TYPES
// ═══════════════════════════════════════════════════════════════════

export interface InnateSkill {
  name: string;
  base_value: number;
  cap: number;
  growth_rate: number;
}

export interface FamilyMember {
  name: string;
  relation: string;
  age?: number;
  occupation?: string;
  personality?: string;
  alive: boolean;
  magic_affinity?: string;
  uid?: string;
}

export interface FamilyTree {
  father?: FamilyMember;
  mother?: FamilyMember;
  paternal_grandparents: FamilyMember[];
  maternal_grandparents: FamilyMember[];
  siblings: FamilyMember[];
  aunts_uncles: FamilyMember[];
  family_head?: string;
  family_motto?: string;
  heirloom_name?: string;
  heirloom_description?: string;
}

export interface ReincarnationData {
  past_name: string;
  past_world: string;
  death_cause: string;
  cheat_ability: string;
  key_memories: string[];
}

export interface ProbabilityRoll {
  attribute: string;
  probability: number;
  roll_result: number;
  success: boolean;
  critical: boolean;
  value: unknown;
}

export interface BirthParameters {
  character_name: string;
  gender: Gender;
  race: string;
  social_class: SocialClass;
  birthplace: string;
  initial_location: string;
  magic_affinity: string | null;
  family: FamilyTree;
  innate_traits: string[];
  innate_skills: InnateSkill[];
  birth_circumstance: BirthCircumstance;
  family_secret: string | null;
  reincarnation: ReincarnationData | null;
  starting_age_years: number;
  opening_narrative: string;
  probability_rolls: ProbabilityRoll[];
}

// ═══════════════════════════════════════════════════════════════════
// DEPS
// ═══════════════════════════════════════════════════════════════════

export interface BirthDeps {
  entityStore: UnifiedEntityStore;
  graphStore: GraphStore;
  llmQueue: LLMQueue;
  npcRuntime: NPCRuntime;
  chronicler: Chronicler;
  clock: WorldClock;
  worldFrame: Record<string, unknown>;
}

// ═══════════════════════════════════════════════════════════════════
// PROBABILITY HELPERS
// ═══════════════════════════════════════════════════════════════════

const CLASS_DEMOGRAPHICS: Record<SocialClass, number> = {
  slave: 0.05,
  peasant: 0.30,
  commoner: 0.40,
  merchant: 0.15,
  nobility: 0.08,
  royalty: 0.02,
};

const CLASS_OCCUPATIONS: Record<SocialClass, string> = {
  slave: "laborer",
  peasant: "farmer",
  commoner: "craftsperson",
  merchant: "trader",
  nobility: "lord",
  royalty: "royal advisor",
};

const EDUCATION_BONUS: Record<SocialClass, number> = {
  slave: -0.2,
  peasant: 0.0,
  commoner: 0.1,
  merchant: 0.15,
  nobility: 0.25,
  royalty: 0.3,
};

const CIRCUMSTANCE_WEIGHTS: Array<[BirthCircumstance, number]> = [
  ["normal", 0.60],
  ["prophecy", 0.08],
  ["omen", 0.10],
  ["tragedy", 0.10],
  ["miracle", 0.07],
  ["secret", 0.05],
];

const CIRCUMSTANCE_TRAITS: Record<BirthCircumstance, string> = {
  normal: "",
  prophecy: "marked by destiny",
  omen: "sign of power",
  tragedy: "survivor",
  miracle: "blessed",
  secret: "hidden past",
};

function weightedRandom<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

function pickGender(hints: string): Gender {
  const h = hints.toLowerCase();
  if (h.includes("male") && !h.includes("female")) return "male";
  if (h.includes("female")) return "female";
  if (h.includes("non-binary") || h.includes("nonbinary")) return "non_binary";
  const genders: Gender[] = ["male", "female", "non_binary", "other"];
  return genders[Math.floor(Math.random() * genders.length)]!;
}

// ═══════════════════════════════════════════════════════════════════
// ROLL FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

function rollRace(worldFrame: Record<string, unknown>, hints: string): { race: string; probability: number } {
  const races = (worldFrame.races as Array<Record<string, unknown>>) ?? [];
  if (!races.length) return { race: "human", probability: 0.5 };

  const names: string[] = [];
  const weights: number[] = [];
  for (const r of races) {
    const name = (r.name as string) ?? "unknown";
    const rarity = 1.0 - ((r.rarity as number) ?? 0.5);
    const hint = hints.toLowerCase().includes(name.toLowerCase()) ? 0.3 : 0;
    names.push(name);
    weights.push(rarity + hint);
  }

  const total = weights.reduce((s, w) => s + w, 0);
  const normalised = weights.map((w) => w / total);
  const idx = Math.floor(Math.random() * names.length);
  return { race: names[idx]!, probability: normalised[idx]! };
}

function rollSocialClass(hints: string): { socialClass: SocialClass; probability: number } {
  const classes: SocialClass[] = ["slave", "peasant", "commoner", "merchant", "nobility", "royalty"];
  const weights = classes.map((c) => {
    let w = CLASS_DEMOGRAPHICS[c];
    if (hints.toLowerCase().includes(c)) w += 0.3;
    return w;
  });
  const total = weights.reduce((s, w) => s + w, 0);
  const normalised = weights.map((w) => w / total);
  const idx = Math.floor(Math.random() * classes.length);
  return { socialClass: classes[idx]!, probability: normalised[idx]! };
}

function rollMagicAffinity(worldFrame: Record<string, unknown>, parentAffinity?: string | null): { affinity: string | null; probability: number } {
  const magicSystem = (worldFrame.magic_system as Record<string, unknown>) ?? {};
  const affinities = (magicSystem.affinities as Array<Record<string, unknown>>) ?? [];
  if (!affinities.length) return { affinity: null, probability: 0 };

  const density = (magicSystem.density as number) ?? 0.5;
  const baseChance = parentAffinity ? density + 0.2 : density;
  const roll = Math.random();
  if (roll >= baseChance) return { affinity: null, probability: baseChance };

  const names: string[] = [];
  const weights: number[] = [];
  for (const a of affinities) {
    names.push((a.name as string) ?? "unknown");
    weights.push(1.0 - ((a.rarity as number) ?? 0.5));
  }
  const total = weights.reduce((s, w) => s + w, 0);
  const normalised = weights.map((w) => w / total);
  const idx = Math.floor(Math.random() * names.length);
  return { affinity: names[idx]!, probability: normalised[idx]! };
}

function rollTalents(socialClass: SocialClass, hints: string): InnateSkill[] {
  const categories = [
    "strength", "dexterity", "constitution", "intelligence",
    "wisdom", "charisma", "magic", "artistry", "leadership", "stealth",
  ];
  const classBonus = EDUCATION_BONUS[socialClass];
  const raceBonus = 0.1;
  const talents: InnateSkill[] = [];

  for (const name of categories) {
    const baseChance = 0.3 + classBonus + raceBonus + (hints.toLowerCase().includes(name) ? 0.3 : 0);
    if (Math.random() < baseChance) {
      talents.push({
        name,
        base_value: Math.round((0.4 + Math.random() * 0.3) * 100) / 100,
        cap: Math.round((0.85 + Math.random() * 0.15) * 100) / 100,
        growth_rate: Math.round((0.03 + Math.random() * 0.04) * 100) / 100,
      });
    }
  }
  return talents;
}

function rollCircumstance(): BirthCircumstance {
  return weightedRandom(
    CIRCUMSTANCE_WEIGHTS.map(([c]) => c),
    CIRCUMSTANCE_WEIGHTS.map(([, w]) => w),
  );
}

// ═══════════════════════════════════════════════════════════════════
// FAMILY TREE GENERATOR
// ═══════════════════════════════════════════════════════════════════

function parseMember(d: Record<string, unknown>, relation: string): FamilyMember {
  return {
    name: (d.name as string) ?? "Unknown",
    relation,
    age: d.age as number | undefined,
    occupation: d.occupation as string | undefined,
    personality: d.personality as string | undefined,
    alive: d.alive !== false,
  };
}

function parseFamilyTree(data: Record<string, unknown>): FamilyTree {
  const family: FamilyTree = {
    paternal_grandparents: [],
    maternal_grandparents: [],
    siblings: [],
    aunts_uncles: [],
  };

  if (data.father && typeof data.father === "object") {
    family.father = parseMember(data.father as Record<string, unknown>, "father");
  }
  if (data.mother && typeof data.mother === "object") {
    family.mother = parseMember(data.mother as Record<string, unknown>, "mother");
  }
  if (Array.isArray(data.paternal_grandparents)) {
    family.paternal_grandparents = data.paternal_grandparents.map((p) =>
      parseMember(p as Record<string, unknown>, (p as Record<string, unknown>).relation as string ?? "paternal_grandparent"),
    );
  }
  if (Array.isArray(data.maternal_grandparents)) {
    family.maternal_grandparents = data.maternal_grandparents.map((p) =>
      parseMember(p as Record<string, unknown>, (p as Record<string, unknown>).relation as string ?? "maternal_grandparent"),
    );
  }
  if (Array.isArray(data.siblings)) {
    family.siblings = data.siblings.map((s) => ({
      name: ((s as Record<string, unknown>).name as string) ?? "Unknown",
      relation: "sibling",
      age: (s as Record<string, unknown>).age as number | undefined,
      personality: (s as Record<string, unknown>).personality as string | undefined,
      alive: true,
    }));
  }
  if (Array.isArray(data.aunts_uncles)) {
    family.aunts_uncles = data.aunts_uncles.map((a) =>
      parseMember(a as Record<string, unknown>, (a as Record<string, unknown>).relation as string ?? "aunt_uncle"),
    );
  }

  family.family_head = data.family_head as string | undefined;
  family.family_motto = data.family_motto as string | undefined;

  if (data.heirloom && typeof data.heirloom === "object") {
    const h = data.heirloom as Record<string, unknown>;
    family.heirloom_name = h.name as string | undefined;
    family.heirloom_description = h.description as string | undefined;
  }

  return family;
}

function minimalFamily(socialClass: SocialClass): FamilyTree {
  return {
    father: {
      name: "Unknown Father",
      relation: "father",
      age: 30,
      occupation: CLASS_OCCUPATIONS[socialClass],
      personality: "stern but loving",
      alive: true,
    },
    mother: {
      name: "Unknown Mother",
      relation: "mother",
      age: 28,
      occupation: "homemaker",
      personality: "caring",
      alive: true,
    },
    family_head: "Unknown Father",
    paternal_grandparents: [],
    maternal_grandparents: [],
    siblings: [],
    aunts_uncles: [],
  };
}

async function generateFamilyTree(
  llmQueue: LLMQueue,
  worldFrame: Record<string, unknown>,
  race: string,
  socialClass: SocialClass,
  magicAffinity: string | null,
  hints: string,
): Promise<FamilyTree> {
  const races = ((worldFrame.races as Array<Record<string, unknown>>) ?? []).map((r) => r.name).join(", ") || "unknown";
  const factions = ((worldFrame.factions as Array<Record<string, unknown>>) ?? []).map((f) => f.name).join(", ") || "unknown";

  const prompt = `You are generating a detailed family tree for a newborn character in a fantasy world.
World: ${(worldFrame.world_name as string) ?? "Unknown"}
Available races: ${races}
Available factions: ${factions}
User hints: ${hints || "None"}

The newborn is:
- Race: ${race}
- Social class: ${socialClass}
- Magic affinity: ${magicAffinity ?? "none"}

Generate a JSON object representing this family. Use your creativity to make the family interesting and appropriate for the social class:

{
    "father": {
        "name": "full name appropriate to culture and class",
        "age": 25-40,
        "occupation": "job or role appropriate to social class",
        "personality": "brief personality description",
        "alive": true or false
    },
    "mother": {
        "name": "full name appropriate to culture and class",
        "age": 23-35,
        "occupation": "job or role",
        "personality": "brief personality description",
        "alive": true or false
    },
    "paternal_grandparents": [
        {"name": "name", "relation": "paternal_grandfather", "occupation": "former occupation", "alive": true}
    ],
    "maternal_grandparents": [
        {"name": "name", "relation": "maternal_grandmother", "occupation": "former occupation", "alive": true}
    ],
    "siblings": [
        {"name": "name", "age": 3-18, "personality": "brief description"}
    ],
    "aunts_uncles": [
        {"name": "name", "relation": "paternal_aunt", "occupation": "occupation"}
    ],
    "family_head": "name of the person with authority",
    "family_motto": "optional family motto",
    "heirloom": {
        "name": "name of the heirloom",
        "description": "description of appearance and significance"
    },
    "family_secret": "optional secret that could form a story arc"
}

Return ONLY the JSON object. Be creative but keep it appropriate to the social class.`;

  try {
    const result = await llmQueue.generateJson(prompt, TaskPriority.LOW, 0.8, "npc", 600);
    return parseFamilyTree(result);
  } catch (err) {
    log.warn({ err }, "Failed to generate family tree, using minimal");
    return minimalFamily(socialClass);
  }
}

// ═══════════════════════════════════════════════════════════════════
// REINCARNATION GENERATOR
// ═══════════════════════════════════════════════════════════════════

async function generateReincarnation(llmQueue: LLMQueue, worldFrame: Record<string, unknown>, hints: string): Promise<ReincarnationData> {
  const worldName = (worldFrame.world_name as string) ?? "Unknown Fantasy World";

  const prompt = `You are generating a reincarnation (isekai) backstory for a character being reborn into a fantasy world.
Target world: ${worldName}
User hints: ${hints || "None"}

Generate a JSON object representing their past life:

{
    "past_name": "full name from past life",
    "past_world": "description of the past world",
    "death_cause": "how they died (creative — truck isekai, illness, accident, heroics, etc.)",
    "cheat_ability": "a special ability they bring from their past life",
    "key_memories": [
        "a fading memory from their past life",
        "another fragment — perhaps a skill they had",
        "one more — maybe something about people they loved"
    ]
}

Return ONLY the JSON object. Be creative!`;

  try {
    const result = await llmQueue.generateJson(prompt, TaskPriority.LOW, 0.9, "npc", 600);
    return {
      past_name: (result.past_name as string) ?? "Unknown",
      past_world: (result.past_world as string) ?? "Unknown",
      death_cause: (result.death_cause as string) ?? "unknown",
      cheat_ability: (result.cheat_ability as string) ?? "Unknown Power",
      key_memories: Array.isArray(result.key_memories) ? result.key_memories as string[] : ["A fading memory"],
    };
  } catch (err) {
    log.warn({ err }, "Failed to generate reincarnation data");
    return {
      past_name: "Unknown",
      past_world: "Unknown",
      death_cause: "mysterious",
      cheat_ability: "Mysterious Power",
      key_memories: ["A fading memory"],
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// NAME GENERATOR
// ═══════════════════════════════════════════════════════════════════

async function generateName(
  llmQueue: LLMQueue,
  entityStore: UnifiedEntityStore,
  race: string,
  socialClass: SocialClass,
  family: FamilyTree,
  hints: string,
  explicitName?: string,
): Promise<string> {
  if (explicitName) {
    let base = explicitName;
    let counter = 1;
    let name = base;
    while (entityStore.getByNameAndType(name, "Character")) {
      name = `${base}_${counter}`;
      counter++;
    }
    return name;
  }

  const nameMatch = hints.match(/name[:\s]+([\p{L}]+)/iu);
  if (nameMatch?.[1]) {
    let base = nameMatch[1];
    let counter = 1;
    let name = base;
    while (entityStore.getByNameAndType(name, "Character")) {
      name = `${base}_${counter}`;
      counter++;
    }
    return name;
  }

  const parentName = family.father?.name ?? "Unknown";
  const prompt = `Generate a unique name appropriate for:
- Race: ${race}
- Social class: ${socialClass}
- Parent name: ${parentName}

Return ONLY a first name, no last name. Be creative and appropriate to the culture implied by the race and class.`;

  let baseName = "Newborn";
  try {
    const result = await llmQueue.generateJson(prompt, TaskPriority.LOW, 0.8, "npc", 600);
    baseName = (result.name as string) ?? "Newborn";
  } catch {
    // Use default
  }

  let counter = 1;
  let name = baseName;
  while (entityStore.getByNameAndType(name, "Character")) {
    name = `${baseName}_${counter}`;
    counter++;
  }
  return name;
}

// ═══════════════════════════════════════════════════════════════════
// LOCATION FINDER
// ═══════════════════════════════════════════════════════════════════

function determineLocations(worldFrame: Record<string, unknown>): { birthplace: string; initialLocation: string } {
  const locations = (worldFrame.locations as Array<Record<string, unknown>>) ?? [];
  if (!locations.length) return { birthplace: "The Capital City", initialLocation: "The Capital City" };
  const names = locations.map((l) => (l.name as string) ?? "Unknown");
  const idx = Math.min(Math.floor(Math.random() * names.length), 4);
  const place = names[idx]!;
  return { birthplace: place, initialLocation: place };
}

// ═══════════════════════════════════════════════════════════════════
// TRAIT DERIVER
// ═══════════════════════════════════════════════════════════════════

function deriveTraits(talents: InnateSkill[], circumstance: BirthCircumstance, magicAffinity: string | null): string[] {
  const traits: string[] = [];
  for (const t of talents) {
    if (t.base_value > 0.6) traits.push(`high ${t.name}`);
  }
  const circum = CIRCUMSTANCE_TRAITS[circumstance];
  if (circum) traits.push(circum);
  if (magicAffinity) traits.push("magically awakened");
  return traits;
}

// ═══════════════════════════════════════════════════════════════════
// OPENING NARRATIVE GENERATOR
// ═══════════════════════════════════════════════════════════════════

const CIRCUMSTANCE_DESC: Record<BirthCircumstance, string> = {
  normal: "a quiet, uneventful birth",
  prophecy: "a birth accompanied by prophecies of greatness",
  omen: "a birth marked by strange omens in the sky",
  tragedy: "a birth shadowed by tragedy and loss",
  miracle: "a miraculous birth that defied expectation",
  secret: "a birth kept secret from the world",
};

async function generateOpeningNarrative(
  llmQueue: LLMQueue,
  name: string,
  race: string,
  socialClass: SocialClass,
  circumstance: BirthCircumstance,
  birthplace: string,
  reincarnation: ReincarnationData | null,
): Promise<string> {
  let isekaiIntro = "";
  if (reincarnation) {
    isekaiIntro = `\n\nIn another life, they were ${reincarnation.past_name} from ${reincarnation.past_world}. They died ${reincarnation.death_cause}, only to wake in this new world with fragments of their past life lingering like fading dreams...`;
  }

  const prompt = `Write a 2-3 paragraph novel-grade opening narrative for a character birth.

Character: ${name}
Race: ${race}
Social class: ${socialClass}
Birthplace: ${birthplace}
Circumstance: ${CIRCUMSTANCE_DESC[circumstance]}
${isekaiIntro}

Write in third person, immersive and atmospheric. Focus on:
- The moment of birth and first sensations
- The setting and atmosphere of the birthplace
- Any unusual elements from the circumstance
- A hint of the character's future potential

Keep it to 3 paragraphs maximum. Make it feel like the opening of a high-quality anime or fantasy novel.
Return ONLY the narrative text, no JSON.`;

  try {
    const result = await llmQueue.generateText(prompt, TaskPriority.LOW, 0.9, "npc", 600);
    return result || `${name} was born into the world.`;
  } catch {
    return `${name} was born to a ${socialClass} family in ${birthplace}. The world awaits their journey.`;
  }
}

// ═══════════════════════════════════════════════════════════════════
// BIRTH GENERATOR
// ═══════════════════════════════════════════════════════════════════

async function generateBirthParams(
  deps: BirthDeps,
  userHints: string,
  isekai: boolean,
  startingAge: number,
  characterName?: string,
): Promise<BirthParameters> {
  const { race, probability: raceProb } = rollRace(deps.worldFrame, userHints);
  const raceRoll = Math.random();
  const raceCritical = raceRoll < raceProb * 0.3;

  const { socialClass, probability: classProb } = rollSocialClass(userHints);
  const classRoll = Math.random();

  const { affinity, probability: magicProb } = rollMagicAffinity(deps.worldFrame);

  const circumstance = rollCircumstance();

  log.info("Generating family tree...");
  const family = await generateFamilyTree(deps.llmQueue, deps.worldFrame, race, socialClass, affinity, userHints);

  const talents = rollTalents(socialClass, userHints);
  const innateTraits = deriveTraits(talents, circumstance, affinity);

  let reincarnation: ReincarnationData | null = null;
  if (isekai) {
    log.info("Generating reincarnation data...");
    reincarnation = await generateReincarnation(deps.llmQueue, deps.worldFrame, userHints);
  }

  const name = await generateName(deps.llmQueue, deps.entityStore, race, socialClass, family, userHints, characterName);
  const { birthplace, initialLocation } = determineLocations(deps.worldFrame);
  const gender = pickGender(userHints);

  const openingNarrative = await generateOpeningNarrative(deps.llmQueue, name, race, socialClass, circumstance, birthplace, reincarnation);

  const rolls: ProbabilityRoll[] = [
    { attribute: "race", probability: raceProb, roll_result: raceRoll, success: raceRoll < raceProb, critical: raceCritical, value: race },
    { attribute: "social_class", probability: classProb, roll_result: classRoll, success: classRoll < classProb, critical: false, value: socialClass },
    { attribute: "magic_affinity", probability: magicProb, roll_result: Math.random(), success: affinity !== null, critical: false, value: affinity },
  ];

  return {
    character_name: name,
    gender,
    race,
    social_class: socialClass,
    birthplace,
    initial_location: initialLocation,
    magic_affinity: affinity,
    family,
    innate_traits: innateTraits,
    innate_skills: talents,
    birth_circumstance: circumstance,
    family_secret: family.family_head ?? null,
    reincarnation,
    starting_age_years: startingAge,
    opening_narrative: openingNarrative,
    probability_rolls: rolls,
  };
}

// ═══════════════════════════════════════════════════════════════════
// BIRTH APPLIER
// ═══════════════════════════════════════════════════════════════════

async function createCharacterEntity(
  entityStore: UnifiedEntityStore,
  params: BirthParameters,
): Promise<EntityNode> {
  const l1 = {
    name: params.character_name,
    type: "Character",
    group: "characters",
    summary: `A ${params.race} ${params.social_class} born in ${params.birthplace}`,
    tags: [params.race, params.social_class],
    relationships: [] as Array<Record<string, unknown>>,
  };

  const l2: Record<string, unknown> = {
    age: params.starting_age_years,
    gender: params.gender,
    birthplace: params.birthplace,
    current_location: params.initial_location,
    social_class: params.social_class,
    family_head: params.family.family_head,
    family_motto: params.family.family_motto,
    affiliations: [params.social_class],
    backstory_short: `Born to a ${params.social_class} family in ${params.birthplace}`,
    circumstance_of_birth: params.birth_circumstance,
  };

  const l3: Record<string, unknown> = {
    innate_traits: params.innate_traits,
    innate_skills: params.innate_skills,
    family_secret: params.family_secret,
  };

  if (params.magic_affinity) l3.magic_affinity = params.magic_affinity;
  if (params.reincarnation) {
    l3.reincarnation = {
      past_name: params.reincarnation.past_name,
      past_world: params.reincarnation.past_world,
      death_cause: params.reincarnation.death_cause,
      cheat_ability: params.reincarnation.cheat_ability,
      memories_unlocked: false,
    };
  }

  const profile = new LayeredProfile(l1, l2, l3);
  const node = new EntityNode({
    uid: `Character:${params.character_name}`,
    name: params.character_name,
    entity_type: "Character",
    profile: profile.toDict(),
    group_id: "characters",
  });

  entityStore.add(node);
  log.info({ name: params.character_name }, "Created character entity");
  return node;
}

async function createFamilyMembers(
  entityStore: UnifiedEntityStore,
  graphStore: GraphStore,
  params: BirthParameters,
  charUid: string,
): Promise<void> {
  const createMember = async (member: FamilyMember): Promise<void> => {
    if (!member.name || member.name === "Unknown") return;

    const existing = entityStore.getByNameAndType(member.name, "Character");
    if (existing) {
      member.uid = existing.uid;
      return;
    }

    const l1 = {
      name: member.name,
      type: "Character",
      group: "family",
      summary: `${member.relation} of ${params.character_name}`,
      tags: ["family", member.relation],
      relationships: [] as Array<Record<string, unknown>>,
    };

    const l2: Record<string, unknown> = {
      age: member.age,
      occupation: member.occupation,
      personality: member.personality,
      alive: member.alive,
    };
    if (member.magic_affinity) l2.magic_affinity = member.magic_affinity;

    const profile = new LayeredProfile(l1, l2, {});
    const node = new EntityNode({
      uid: `Character:${member.name}`,
      name: member.name,
      entity_type: "Character",
      profile: profile.toDict(),
      group_id: "family",
    });

    entityStore.add(node);
    member.uid = node.uid;

    graphStore.addEdge(charUid, node.uid, member.relation);
    graphStore.addEdge(node.uid, charUid, "child_of");
  };

  const members: FamilyMember[] = [];
  if (params.family.father) members.push(params.family.father);
  if (params.family.mother) members.push(params.family.mother);
  members.push(...params.family.paternal_grandparents);
  members.push(...params.family.maternal_grandparents);
  members.push(...params.family.siblings);
  members.push(...params.family.aunts_uncles);

  for (const m of members) {
    await createMember(m);
  }

  // Sibling cross-links
  for (const sib of params.family.siblings) {
    if (sib.uid) graphStore.addEdge(charUid, sib.uid, "sibling_of");
  }
}

async function createHeirloom(
  entityStore: UnifiedEntityStore,
  params: BirthParameters,
): Promise<void> {
  if (!params.family.heirloom_name) return;

  const existing = entityStore.getByNameAndType(params.family.heirloom_name, "Item");
  if (existing) return;

  const profile = new LayeredProfile(
    {
      name: params.family.heirloom_name,
      type: "Item",
      group: "items",
      summary: params.family.heirloom_description ?? "A family heirloom",
      tags: ["heirloom", "family"],
      relationships: [],
    },
    {
      description: params.family.heirloom_description,
      type: "heirloom",
      owned_by: params.family.family_head,
      generations: 3 + Math.floor(Math.random() * 8),
    },
    {},
  );

  const node = new EntityNode({
    uid: `Item:${params.family.heirloom_name}`,
    name: params.family.heirloom_name,
    entity_type: "Item",
    profile: profile.toDict(),
    group_id: "items",
  });

  entityStore.add(node);
  log.info("Created heirloom: %s", params.family.heirloom_name);
}

async function registerInMemory(
  npcRuntime: NPCRuntime,
  params: BirthParameters,
): Promise<void> {
  const nodeUid = `Character:${params.character_name}`;
  await npcRuntime.register(params.character_name, nodeUid, params.initial_location);

  const profile = npcRuntime.get(params.character_name);
  if (profile) {
    profile.health = 100;
    profile.mood = "neutral";
    profile.goals = ["grow up", "discover abilities"];
  }
}

async function initializeMemories(npcRuntime: NPCRuntime, params: BirthParameters): Promise<void> {
  await npcRuntime.addMemory(
    params.character_name,
    `Born in ${params.birthplace} to a ${params.social_class} family.`,
    "confusion",
    0.9,
    [],
    params.initial_location,
  );

  if (params.birth_circumstance !== "normal") {
    await npcRuntime.addMemory(
      params.character_name,
      `My birth was marked by ${params.birth_circumstance}.`,
      "wonder",
      0.7,
    );
  }
}

async function scheduleChildhoodMilestones(clock: WorldClock, params: BirthParameters): Promise<void> {
  if (params.starting_age_years >= 15) return;

  const now = clock.currentTime;
  const milestones: Array<[number, string, string]> = [
    [30, "first_word", "First word spoken"],
    [180, "first_step", "First steps taken"],
    [365, "first_friend", "First friend met"],
    [730, "basic_education", "Started basic education"],
  ];

  if (params.magic_affinity) milestones.push([1095, "magic_awakening", "Magic awakening"]);

  for (const [offsetDays, eventType, description] of milestones) {
    const when = new Date(now.getTime() + offsetDays * 24 * 60 * 60 * 1000);
    await clock.scheduleEvent(when, "childhood_event", {
      type: eventType,
      description,
      character: params.character_name,
      age_at_event: Math.floor(offsetDays / 365),
    });
  }

  log.info({ count: milestones.length, character: params.character_name }, "Scheduled childhood milestones");
}

// ═══════════════════════════════════════════════════════════════════
// MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════════

export class BirthScenario {
  private _deps: BirthDeps;

  constructor(deps: BirthDeps) {
    this._deps = deps;
  }

  async generateAndApply(
    userHints = "",
    isekai = false,
    startingAge = 5,
    characterName?: string,
  ): Promise<{ openingNarrative: string; params: BirthParameters }> {
    // Generate
    const params = await generateBirthParams(this._deps, userHints, isekai, startingAge, characterName);

    // Apply to world
    log.info("Applying birth for %s", params.character_name);

    const charNode = await createCharacterEntity(this._deps.entityStore, params);
    await createFamilyMembers(this._deps.entityStore, this._deps.graphStore, params, charNode.uid);

    if (params.family.heirloom_name) {
      await createHeirloom(this._deps.entityStore, params);
    }

    await registerInMemory(this._deps.npcRuntime, params);
    await initializeMemories(this._deps.npcRuntime, params);
    await scheduleChildhoodMilestones(this._deps.clock, params);

    await this._deps.chronicler.logEvent(
      `${params.character_name} was born into the world. Race: ${params.race}, Class: ${params.social_class}, Birthplace: ${params.birthplace}`,
      new Date(),
      "birth",
    );

    return { openingNarrative: params.opening_narrative, params };
  }
}
