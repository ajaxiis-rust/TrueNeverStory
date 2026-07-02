/**
 * NPC runtime state models.
 * Replaces world_narrative/memory_optimized.py data structures.
 */

export interface EpisodicMemory {
  id: string;
  timestamp: string;
  description: string;
  importance: number;
  emotion: string;
  involvedEntities: string[];
  location: string;
  consolidated: boolean;
}

export interface NPCSkills {
  strength: number;
  dexterity: number;
  charisma: number;
  intelligence: number;
  wisdom: number;
  luck: number;
  combat_skill: number;
  persuasion: number;
  stealth: number;
}

export interface NPCProfile {
  name: string;
  uid: string;
  shortTerm: EpisodicMemory[];
  longTermEpisodic: EpisodicMemory[];
  location: string;
  health: number;
  mood: string;
  goals: string[];
  inventory: string[];
  tags: Record<string, unknown>;
  updatedAt: string;
  skills: NPCSkills;
}

export function createDefaultNPCProfile(name: string, uid: string, location = "unknown"): NPCProfile {
  return {
    name,
    uid,
    shortTerm: [],
    longTermEpisodic: [],
    location,
    health: 100,
    mood: "neutral",
    goals: [],
    inventory: [],
    tags: {},
    updatedAt: new Date().toISOString(),
    skills: {
      strength: 0.5,
      dexterity: 0.5,
      charisma: 0.5,
      intelligence: 0.5,
      wisdom: 0.5,
      luck: 0.5,
      combat_skill: 0.5,
      persuasion: 0.5,
      stealth: 0.5,
    },
  };
}

export function serializeNPCProfile(p: NPCProfile): Record<string, unknown> {
  return {
    uid: p.uid,
    short_term: p.shortTerm.map((m) => ({
      id: m.id,
      timestamp: m.timestamp,
      description: m.description,
      importance: m.importance,
      emotion: m.emotion,
      involved_entities: m.involvedEntities,
      location: m.location,
      consolidated: m.consolidated,
    })),
    long_term_episodic: p.longTermEpisodic.map((m) => ({
      id: m.id,
      timestamp: m.timestamp,
      description: m.description,
      importance: m.importance,
      emotion: m.emotion,
      involved_entities: m.involvedEntities,
      location: m.location,
      consolidated: m.consolidated,
    })),
    location: p.location,
    health: p.health,
    mood: p.mood,
    goals: p.goals,
    inventory: p.inventory,
    tags: p.tags,
    updated_at: p.updatedAt,
  };
}

export function deserializeNPCProfile(name: string, data: Record<string, unknown>): NPCProfile {
  const deserializeMemory = (m: Record<string, unknown>): EpisodicMemory => ({
    id: m.id as string,
    timestamp: m.timestamp as string,
    description: m.description as string,
    importance: m.importance as number,
    emotion: m.emotion as string,
    involvedEntities: (m.involved_entities as string[]) ?? [],
    location: (m.location as string) ?? "",
    consolidated: (m.consolidated as boolean) ?? false,
  });

  return {
    name,
    uid: data.uid as string,
    shortTerm: ((data.short_term as Record<string, unknown>[]) ?? []).map(deserializeMemory),
    longTermEpisodic: ((data.long_term_episodic as Record<string, unknown>[]) ?? []).map(deserializeMemory),
    location: (data.location as string) ?? "unknown",
    health: (data.health as number) ?? 100,
    mood: (data.mood as string) ?? "neutral",
    goals: (data.goals as string[]) ?? [],
    inventory: (data.inventory as string[]) ?? [],
    tags: (data.tags as Record<string, unknown>) ?? {},
    updatedAt: (data.updated_at as string) ?? new Date().toISOString(),
    skills: (data.skills as NPCSkills) ?? {
      strength: 0.5, dexterity: 0.5, charisma: 0.5,
      intelligence: 0.5, wisdom: 0.5, luck: 0.5,
      combat_skill: 0.5, persuasion: 0.5, stealth: 0.5,
    },
  };
}
