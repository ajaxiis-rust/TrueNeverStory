import { isValidArchetype } from './archetypes';

export interface RoleMapping {
  span: string;
  role: string;
}

export interface SensoryDetail {
  visual: string;
  auditory: string;
  tactile: string;
}

export interface ExtractResult {
  archetype_primary: string;
  archetype_secondary: string | null;
  roles: RoleMapping[];
  variables: string[];
  skeleton: string;
  mood: string;
  sensory: SensoryDetail;
  pacing: string;
  register: string;
  snippets: string[];
  confidence: number;
}

export const EXTRACTOR_SYSTEM_PROMPT = `You are a literary data extractor. Given a text chunk, extract structured narrative data and return it as a single JSON object — no markdown fences, no commentary.

Return ONLY valid JSON matching this schema:
{
  "archetype_primary": "<one of: escape_liberation, judgment_trial, loyalty, betrayal, inheritance_return, endurance_suffering, rescue, rise_fall_rise, wisdom_counsel, political_intrigue, quest_journey, temptation_fall, everyday_life>",
  "archetype_secondary": "<nullable, same options or null if single-archetype>",
  "roles": [{"span": "<character name/phrase from text>", "role": "<leader|follower|savior|mentor|tyrant|judge|witness|heir|wise_one|tempter|guide|betrayer|other>"}],
  "variables": ["<template variable names derived from the narrative>"],
  "skeleton": "<1-2 sentence summary of the core narrative beat, 10+ chars>",
  "mood": "<emotional tone: dark, hopeful, tense, epic, melancholic, neutral, etc.>",
  "sensory": {"visual": "<visual imagery>", "auditory": "<sounds>", "tactile": "<touch/texture>"},
  "pacing": "<fast|medium|slow>",
  "register": "<formal|informal|archaic|colloquial>",
  "snippets": ["<2-3 of the most vivid or important spans from the text>"],
  "confidence": <0.0-1.0 how confident you are in this extraction>
}`;

export function buildExtractPrompt(chunkText: string): string {
  return `Analyze the following text chunk and extract structured literary data as JSON.

Text chunk:
"""
${chunkText}
"""

Return ONLY the JSON object. No explanation.`;
}

export function validateExtractResult(result: unknown): result is ExtractResult {
  if (result === null || typeof result !== 'object') return false;
  const r = result as Record<string, unknown>;

  if (typeof r.archetype_primary !== 'string') return false;
  if (!isValidArchetype(r.archetype_primary)) return false;

  if (r.archetype_secondary !== null && typeof r.archetype_secondary !== 'string') return false;

  if (!Array.isArray(r.roles)) return false;
  for (const role of r.roles) {
    if (typeof role !== 'object' || role === null) return false;
    if (typeof (role as RoleMapping).span !== 'string') return false;
    if (typeof (role as RoleMapping).role !== 'string') return false;
  }

  if (!Array.isArray(r.variables) || r.variables.length === 0) return false;
  for (const v of r.variables) {
    if (typeof v !== 'string') return false;
  }

  if (typeof r.skeleton !== 'string' || r.skeleton.length < 10) return false;
  if (typeof r.mood !== 'string') return false;

  if (typeof r.sensory !== 'object' || r.sensory === null) return false;
  const s = r.sensory as Record<string, unknown>;
  if (typeof s.visual !== 'string') return false;
  if (typeof s.auditory !== 'string') return false;
  if (typeof s.tactile !== 'string') return false;

  if (typeof r.pacing !== 'string') return false;
  if (typeof r.register !== 'string') return false;

  if (!Array.isArray(r.snippets)) return false;

  if (typeof r.confidence !== 'number' || r.confidence < 0 || r.confidence > 1) return false;

  return true;
}
