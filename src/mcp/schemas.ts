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
