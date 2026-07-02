/**
 * Romance probability profiles for the romantic relationships system.
 * Replaces world_core/romance/profiles.py.
 */

import {
  ProbabilityProfile,
  ParameterType,
} from "../models/probability";
import type { ProbabilityParameterData } from "../models/probability";

function p(
  name: string,
  baseValue: number,
  weight: number,
  paramType: ParameterType,
  dynamicSource?: string,
): ProbabilityParameterData {
  return {
    name,
    base_value: baseValue,
    weight,
    param_type: paramType,
    dynamic_source: dynamicSource ?? null,
  };
}

function makeProfile(
  name: string,
  params: ProbabilityParameterData[],
  formula = "sum_weighted",
  difficultyModifier = 1.0,
  criticalSuccessThreshold = 0.85,
  criticalFailureThreshold = 0.15,
): ProbabilityProfile {
  const paramMap: Record<string, ProbabilityParameterData> = {};
  for (const param of params) {
    paramMap[param.name] = param;
  }
  return new ProbabilityProfile({
    name,
    parameters: paramMap,
    formula,
    difficulty_modifier: difficultyModifier,
    critical_success_threshold: criticalSuccessThreshold,
    critical_failure_threshold: criticalFailureThreshold,
  });
}

// ── Romance Attraction ──
export const ROMANCE_ATTRACTION = makeProfile("romance_attraction", [
  p("charisma", 0.5, 0.25, ParameterType.DYNAMIC, "actor_charisma"),
  p("compatibility", 0.5, 0.30, ParameterType.RELATIONSHIP, "compatibility"),
  p("mood", 0.5, 0.15, ParameterType.DYNAMIC, "target_mood_factor"),
  p("environment", 0.0, 0.10, ParameterType.EXTERNAL, "environment_modifier"),
  p("past_affection", 0.3, 0.20, ParameterType.EXTERNAL, "current_affection"),
], "logistic", 1.0, 0.85, 0.15);

// ── Romance Confession ──
export const ROMANCE_CONFESSION = makeProfile("romance_confession", [
  p("affection", 0.5, 0.35, ParameterType.EXTERNAL, "current_affection"),
  p("compatibility", 0.5, 0.25, ParameterType.RELATIONSHIP, "compatibility"),
  p("charisma", 0.5, 0.15, ParameterType.DYNAMIC, "actor_charisma"),
  p("location_romance", 0.0, 0.10, ParameterType.EXTERNAL, "environment_modifier"),
  p("luck", 0.5, 0.15, ParameterType.EXTERNAL),
], "logistic", 1.2, 0.80, 0.20);

// ── Romance Date ──
export const ROMANCE_DATE = makeProfile("romance_date", [
  p("affection", 0.5, 0.30, ParameterType.EXTERNAL, "current_affection"),
  p("charisma", 0.5, 0.20, ParameterType.DYNAMIC, "actor_charisma"),
  p("compatibility", 0.5, 0.20, ParameterType.RELATIONSHIP, "compatibility"),
  p("location_romance", 0.0, 0.15, ParameterType.EXTERNAL, "environment_modifier"),
  p("timing", 0.5, 0.15, ParameterType.EXTERNAL, "time_of_day_modifier"),
], "logistic", 1.0, 0.85, 0.15);

// ── Romance Kiss ──
export const ROMANCE_KISS = makeProfile("romance_kiss", [
  p("affection", 0.6, 0.35, ParameterType.EXTERNAL, "current_affection"),
  p("mood", 0.5, 0.20, ParameterType.DYNAMIC, "target_mood_factor"),
  p("charisma", 0.5, 0.15, ParameterType.DYNAMIC, "actor_charisma"),
  p("environment", 0.0, 0.15, ParameterType.EXTERNAL, "environment_modifier"),
  p("past_moments", 0.3, 0.15, ParameterType.EXTERNAL, "past_positive_interactions"),
], "logistic", 1.1, 0.85, 0.15);

// ── Romance Proposal ──
export const ROMANCE_PROPOSAL = makeProfile("romance_proposal", [
  p("affection", 0.7, 0.35, ParameterType.EXTERNAL, "current_affection"),
  p("compatibility", 0.6, 0.25, ParameterType.RELATIONSHIP, "compatibility"),
  p("charisma", 0.5, 0.10, ParameterType.DYNAMIC, "actor_charisma"),
  p("relationship_duration", 0.5, 0.15, ParameterType.EXTERNAL, "relationship_duration"),
  p("family_approval", 0.5, 0.15, ParameterType.EXTERNAL, "family_approval"),
], "logistic", 1.3, 0.75, 0.25);

// ── Romance Breakup ──
export const ROMANCE_BREAKUP = makeProfile("romance_breakup", [
  p("affection", 0.5, 0.35, ParameterType.EXTERNAL, "current_affection"),
  p("conflict_level", 0.3, 0.25, ParameterType.EXTERNAL, "conflict_level"),
  p("external_pressure", 0.0, 0.20, ParameterType.EXTERNAL, "external_pressure"),
  p("luck", 0.5, 0.20, ParameterType.EXTERNAL),
], "sum_weighted", 0.8, 0.25, 0.75);

// ── Profile Registry ──
const ROMANCE_PROFILES_MAP: Record<string, ProbabilityProfile> = {
  romance_attraction: ROMANCE_ATTRACTION,
  attraction: ROMANCE_ATTRACTION,
  romance_confession: ROMANCE_CONFESSION,
  confess: ROMANCE_CONFESSION,
  confession: ROMANCE_CONFESSION,
  romance_date: ROMANCE_DATE,
  date: ROMANCE_DATE,
  romance_proposal: ROMANCE_PROPOSAL,
  proposal: ROMANCE_PROPOSAL,
  propose: ROMANCE_PROPOSAL,
  romance_breakup: ROMANCE_BREAKUP,
  breakup: ROMANCE_BREAKUP,
  romance_kiss: ROMANCE_KISS,
  kiss: ROMANCE_KISS,
};

export function getRomanceProfile(name: string): ProbabilityProfile | undefined {
  return ROMANCE_PROFILES_MAP[name.toLowerCase()];
}

export const ROMANCE_PROFILES = ROMANCE_PROFILES_MAP;
