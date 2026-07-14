import { z } from 'zod';

// ─── Bible Tool Schemas ──────────────────────────────────────────────────────

export const SearchVersesSchema = z.object({
  query: z.string().describe('Search text to find matching verses'),
  book: z.string().optional().describe('Filter by book name (e.g., "Genesis", "Psalms")'),
  chapter: z.number().optional().describe('Filter by chapter number'),
  limit: z.number().optional().describe('Max results (default 10)'),
});

export const GetPatternSchema = z.object({
  archetype: z.string().optional().describe('Filter by archetype (e.g., "tragic_hero", "reluctant_leader")'),
  mood: z.string().optional().describe('Filter by mood (e.g., "dark", "hopeful", "ambiguous")'),
  narrativeFunction: z.string().optional().describe('Filter by narrative function (e.g., "climax", "resolution")'),
});

export const GetArchetypeSchema = z.object({
  name: z.string().describe('Archetype name to search for'),
});

// ─── Gutenberg Tool Schemas ──────────────────────────────────────────────────

export const GetStyleSchema = z.object({
  query: z.string().describe('Search text to find matching styles'),
  mood: z.string().optional().describe('Filter by mood tag'),
  limit: z.number().optional().describe('Max results (default 5)'),
});

export const ApplyStyleSchema = z.object({
  text: z.string().describe('Text to apply style to'),
  styleId: z.string().optional().describe('Style ID to apply (if known)'),
  mood: z.string().optional().describe('Mood to match style to'),
});

// ─── Wikipedia Tool Schemas ──────────────────────────────────────────────────

export const VerifyFactSchema = z.object({
  claim: z.string().describe('The factual claim to verify'),
  context: z.string().optional().describe('Additional context for verification'),
});

export const GetContextSchema = z.object({
  topic: z.string().describe('Topic to get Wikipedia context for'),
});

// ─── Entity Tool Schemas ─────────────────────────────────────────────────────

export const QueryEntitySchema = z.object({
  name: z.string().describe('Entity name to query'),
  type: z.string().optional().describe('Entity type (e.g., "Character", "Location", "Item")'),
});

export const GetRelationshipsSchema = z.object({
  entityUid: z.string().describe('Entity UID to get relationships for'),
  depth: z.number().optional().describe('Relationship depth (default 1)'),
});

// ─── Literary Compiler Schemas ──────────────────────────────────────────────

export const GetQuestTemplatesSchema = z.object({
  position: z.string().optional().describe('Player position: leader, follower, tyrant, judge, etc.'),
  archetype: z.string().optional().describe('Archetype: escape, judgment, loyalty, wisdom, etc.'),
  mood: z.string().optional().describe('Mood: epic, dark, hopeful, tense, neutral'),
  difficulty: z.string().optional().describe('Difficulty: low, medium, high'),
  limit: z.number().optional().describe('Max results (default 5)'),
});

export const SearchQuestTemplatesSchema = z.object({
  query: z.string().describe('Search text'),
  limit: z.number().optional().describe('Max results (default 10)'),
});

// ─── Economic Tool Schemas ──────────────────────────────────────────────────

export const GetEconomicPhaseSchema = z.object({
  worldId: z.string().describe('World ID to check economic phase for'),
});

export const GetPriceModifierSchema = z.object({
  worldId: z.string().describe('World ID to get price modifier for'),
});

export const CalculatePriceSchema = z.object({
  worldId: z.string().describe('World ID'),
  basePrice: z.number().describe('Base price to calculate'),
});

export const GetWageSchema = z.object({
  faction: z.string().describe('Faction/rank to calculate wage for'),
  baseWage: z.number().describe('Base wage amount'),
  workedHours: z.number().describe('Hours worked'),
  productivity: z.number().optional().describe('Productivity multiplier (default 1.0)'),
});

export const GenerateDilemmaSchema = z.object({
  worldId: z.string().describe('World ID'),
  factionA: z.string().describe('First faction name'),
  factionB: z.string().describe('Second faction name'),
});

export const CheckJubileeSchema = z.object({
  worldId: z.string().describe('World ID'),
  currentYear: z.number().describe('Current in-game year'),
});

export const GetJubileeInfoSchema = z.object({
  worldId: z.string().describe('World ID'),
  currentYear: z.number().describe('Current in-game year'),
});

// ─── Inferred Types ──────────────────────────────────────────────────────────

export type SearchVersesInput = z.infer<typeof SearchVersesSchema>;
export type GetPatternInput = z.infer<typeof GetPatternSchema>;
export type GetArchetypeInput = z.infer<typeof GetArchetypeSchema>;
export type GetStyleInput = z.infer<typeof GetStyleSchema>;
export type ApplyStyleInput = z.infer<typeof ApplyStyleSchema>;
export type VerifyFactInput = z.infer<typeof VerifyFactSchema>;
export type GetContextInput = z.infer<typeof GetContextSchema>;
export type QueryEntityInput = z.infer<typeof QueryEntitySchema>;
export type GetRelationshipsInput = z.infer<typeof GetRelationshipsSchema>;
export type GetQuestTemplatesInput = z.infer<typeof GetQuestTemplatesSchema>;
export type SearchQuestTemplatesInput = z.infer<typeof SearchQuestTemplatesSchema>;
export type GetEconomicPhaseInput = z.infer<typeof GetEconomicPhaseSchema>;
export type GetPriceModifierInput = z.infer<typeof GetPriceModifierSchema>;
export type CalculatePriceInput = z.infer<typeof CalculatePriceSchema>;
export type GetWageInput = z.infer<typeof GetWageSchema>;
export type GenerateDilemmaInput = z.infer<typeof GenerateDilemmaSchema>;
export type CheckJubileeInput = z.infer<typeof CheckJubileeSchema>;
export type GetJubileeInfoInput = z.infer<typeof GetJubileeInfoSchema>;
