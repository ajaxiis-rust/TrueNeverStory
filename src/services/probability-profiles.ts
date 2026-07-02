/**
 * Predefined probability profiles for various action types.
 * Replaces world_core/probability/profiles.py.
 */

import {
  ProbabilityProfile,
  ProbabilityParameter,
  ParameterType,
} from "../models/probability";

function param(
  name: string,
  baseValue: number,
  weight: number,
  type: ParameterType,
  dynamicSource?: string,
): ProbabilityParameter {
  return new ProbabilityParameter({
    name,
    base_value: baseValue,
    weight,
    param_type: type,
    dynamic_source: dynamicSource ?? null,
  });
}

function profile(
  name: string,
  params: ProbabilityParameter[],
  formula = "sum_weighted",
  difficultyModifier = 1.0,
  criticalSuccessThreshold = 0.9,
  criticalFailureThreshold = 0.1,
): ProbabilityProfile {
  return new ProbabilityProfile({
    name,
    parameters: Object.fromEntries(params.map((p) => [p.name, p])),
    formula,
    difficulty_modifier: difficultyModifier,
    critical_success_threshold: criticalSuccessThreshold,
    critical_failure_threshold: criticalFailureThreshold,
  });
}

// ── Combat ──
export const COMBAT = profile("combat", [
  param("combat_skill", 0.5, 0.30, ParameterType.DYNAMIC, "actor_combat_skill"),
  param("health_factor", 1.0, 0.15, ParameterType.DYNAMIC, "actor_health"),
  param("weapon_proficiency", 0.0, 0.10, ParameterType.DYNAMIC, "actor_weapon_proficiency"),
  param("target_defense", 0.5, 0.20, ParameterType.DYNAMIC, "target_defense"),
  param("terrain_modifier", 0.0, 0.10, ParameterType.EXTERNAL, "environment_terrain_mod"),
  param("luck", 0.5, 0.15, ParameterType.EXTERNAL),
], "sum_weighted", 1.0, 0.90, 0.10);

// ── Persuasion ──
export const PERSUASION = profile("persuasion", [
  param("charisma", 0.5, 0.25, ParameterType.DYNAMIC, "actor_charisma"),
  param("relationship", 0.3, 0.25, ParameterType.RELATIONSHIP, "relationship_strength"),
  param("argument_quality", 0.5, 0.15, ParameterType.EXTERNAL, "argument_quality"),
  param("target_mood", 0.5, 0.15, ParameterType.DYNAMIC, "target_mood_factor"),
  param("target_resistance", 0.5, 0.10, ParameterType.DYNAMIC, "target_resistance"),
  param("luck", 0.5, 0.10, ParameterType.EXTERNAL),
], "logistic", 0.9, 0.85, 0.15);

// ── Stealth ──
export const STEALTH = profile("stealth", [
  param("dexterity", 0.5, 0.30, ParameterType.DYNAMIC, "actor_dexterity"),
  param("light_level", 0.5, 0.20, ParameterType.EXTERNAL, "environment_light"),
  param("noise_level", 0.5, 0.15, ParameterType.EXTERNAL, "environment_noise"),
  param("actor_mood", 0.5, 0.10, ParameterType.DYNAMIC, "actor_mood_factor"),
  param("luck", 0.5, 0.25, ParameterType.EXTERNAL),
], "product", 1.0, 0.85, 0.15);

// ── Romance (generic) ──
export const ROMANCE = profile("romance", [
  param("charisma", 0.5, 0.25, ParameterType.DYNAMIC, "actor_charisma"),
  param("relationship", 0.5, 0.35, ParameterType.RELATIONSHIP, "relationship_strength"),
  param("romantic_setting", 0.0, 0.15, ParameterType.EXTERNAL, "environment_modifier"),
  param("actor_mood", 0.5, 0.10, ParameterType.DYNAMIC, "actor_mood_factor"),
  param("target_mood", 0.5, 0.10, ParameterType.DYNAMIC, "target_mood_factor"),
  param("luck", 0.5, 0.05, ParameterType.EXTERNAL),
], "sum_weighted", 1.0, 0.85, 0.15);

// ── Investigation ──
export const INVESTIGATION = profile("investigation", [
  param("intelligence", 0.5, 0.35, ParameterType.DYNAMIC, "actor_intelligence"),
  param("perception", 0.5, 0.25, ParameterType.DYNAMIC, "actor_wisdom"),
  param("environment_light", 0.5, 0.15, ParameterType.EXTERNAL, "environment_light"),
  param("time_pressure", 0.5, 0.10, ParameterType.EXTERNAL),
  param("luck", 0.5, 0.15, ParameterType.EXTERNAL),
], "sum_weighted", 1.0, 0.90, 0.10);

// ── Athletics ──
export const ATHLETICS = profile("athletics", [
  param("strength", 0.5, 0.35, ParameterType.DYNAMIC, "actor_strength"),
  param("health", 0.5, 0.20, ParameterType.DYNAMIC, "actor_health"),
  param("terrain", 0.0, 0.20, ParameterType.EXTERNAL, "environment_terrain_mod"),
  param("actor_mood", 0.5, 0.10, ParameterType.DYNAMIC, "actor_mood_factor"),
  param("luck", 0.5, 0.15, ParameterType.EXTERNAL),
], "sum_weighted", 1.0, 0.85, 0.15);

// ── Deception ──
export const DECEPTION = profile("deception", [
  param("charisma", 0.5, 0.30, ParameterType.DYNAMIC, "actor_charisma"),
  param("target_wisdom", 0.5, 0.20, ParameterType.DYNAMIC, "target_resistance"),
  param("relationship", 0.3, 0.15, ParameterType.RELATIONSHIP, "relationship_strength"),
  param("lie_quality", 0.5, 0.15, ParameterType.EXTERNAL),
  param("actor_mood", 0.5, 0.05, ParameterType.DYNAMIC, "actor_mood_factor"),
  param("target_mood", 0.5, 0.10, ParameterType.DYNAMIC, "target_mood_factor"),
  param("luck", 0.5, 0.05, ParameterType.EXTERNAL),
], "logistic", 1.2, 0.85, 0.15);

// ── Intimidation ──
export const INTIMIDATION = profile("intimidation", [
  param("strength", 0.5, 0.25, ParameterType.DYNAMIC, "actor_strength"),
  param("charisma", 0.5, 0.20, ParameterType.DYNAMIC, "actor_charisma"),
  param("target_wisdom", 0.5, 0.20, ParameterType.DYNAMIC, "target_resistance"),
  param("actor_reputation", 0.5, 0.15, ParameterType.EXTERNAL, "faction_reputation"),
  param("target_mood", 0.5, 0.10, ParameterType.DYNAMIC, "target_mood_factor"),
  param("luck", 0.5, 0.10, ParameterType.EXTERNAL),
], "sum_weighted", 1.1, 0.85, 0.15);

// ── Generic ──
export const GENERIC = profile("generic", [
  param("skill", 0.5, 0.60, ParameterType.DYNAMIC, "extra_skill"),
  param("difficulty", 0.5, 0.20, ParameterType.EXTERNAL, "extra_difficulty"),
  param("luck", 0.5, 0.20, ParameterType.EXTERNAL),
], "sum_weighted", 1.0, 0.90, 0.10);

// ── Birth: Race ──
export const BIRTH_RACE = profile("birth_race", [
  param("world_rarity", 0.5, 0.40, ParameterType.EXTERNAL, "race_rarity"),
  param("user_hint", 0.0, 0.30, ParameterType.EXTERNAL, "hint_weight"),
  param("demographic_weight", 0.3, 0.20, ParameterType.EXTERNAL, "race_demographic"),
  param("luck", 0.5, 0.10, ParameterType.EXTERNAL),
], "sum_weighted", 1.0, 0.85, 0.15);

// ── Birth: Social Class ──
export const BIRTH_SOCIAL_CLASS = profile("birth_social_class", [
  param("demographic_weight", 0.3, 0.35, ParameterType.EXTERNAL, "class_demographic"),
  param("parental_influence", 0.5, 0.25, ParameterType.EXTERNAL, "parent_class"),
  param("user_hint", 0.0, 0.25, ParameterType.EXTERNAL, "hint_weight"),
  param("luck", 0.5, 0.15, ParameterType.EXTERNAL),
], "logistic", 0.9, 0.80, 0.20);

// ── Birth: Magic Affinity ──
export const BIRTH_MAGIC_AFFINITY = profile("birth_magic_affinity", [
  param("world_magic_density", 0.5, 0.30, ParameterType.EXTERNAL, "magic_density"),
  param("bloodline_magic", 0.3, 0.35, ParameterType.EXTERNAL, "parent_magic_affinity"),
  param("luck", 0.5, 0.35, ParameterType.EXTERNAL),
], "sum_weighted", 1.0, 0.85, 0.15);

// ── Birth: Talent ──
export const BIRTH_TALENT = profile("birth_talent", [
  param("base_chance", 0.3, 0.40, ParameterType.EXTERNAL),
  param("social_class_bonus", 0.0, 0.30, ParameterType.EXTERNAL, "class_education_bonus"),
  param("race_bonus", 0.0, 0.20, ParameterType.EXTERNAL, "race_talent_bonus"),
  param("luck", 0.5, 0.10, ParameterType.EXTERNAL),
], "logistic", 1.0, 0.90, 0.10);

// ── Profile Registry ──
const PROFILES_MAP: Record<string, ProbabilityProfile> = {
  combat: COMBAT,
  persuasion: PERSUASION,
  persuade: PERSUASION,
  stealth: STEALTH,
  sneak: STEALTH,
  romance: ROMANCE,
  investigation: INVESTIGATION,
  investigate: INVESTIGATION,
  search: INVESTIGATION,
  athletics: ATHLETICS,
  climb: ATHLETICS,
  swim: ATHLETICS,
  deception: DECEPTION,
  lie: DECEPTION,
  bluff: DECEPTION,
  intimidation: INTIMIDATION,
  intimidate: INTIMIDATION,
  generic: GENERIC,
  default: GENERIC,
  birth_race: BIRTH_RACE,
  birth_social_class: BIRTH_SOCIAL_CLASS,
  birth_magic_affinity: BIRTH_MAGIC_AFFINITY,
  birth_talent: BIRTH_TALENT,
};

export function getProfile(name: string): ProbabilityProfile {
  return PROFILES_MAP[name.toLowerCase()] ?? GENERIC;
}

export function listProfiles(): string[] {
  return [...new Set(Object.keys(PROFILES_MAP))].sort();
}

export function registerProfile(profile: ProbabilityProfile): void {
  PROFILES_MAP[profile.name.toLowerCase()] = profile;
}

export const PROFILES = PROFILES_MAP;
