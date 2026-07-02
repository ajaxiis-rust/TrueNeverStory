/**
 * Story engine models (replaces world_engine/models.py).
 */

export interface StoryContext {
  worldName: string;
  currentTime: string;
  location: string;
  activeCharacter: string | null;
  userRole: string;
  recentTimeline: string[];
  worldRules: string[];
  nearbyNpcs: string[];
  availableItems: string[];
  activeQuests: Record<string, unknown>[];
  directorPlan: string | null;
  // World frame fields (from world_frame.json)
  genre?: string;
  language?: string;
  magicSystem?: string;
  worldDescription?: string;
}

export interface NarratorOutput {
  narrative: string;
  entitiesMentioned: string[];
  suggestedActions: string[];
}

export interface NPCDialogue {
  speaker: string;
  line: string;
  emotion?: string;
  suggestedEffects: Record<string, unknown>[];
}

export interface SceneTransition {
  newLocation: string;
  narrative: string;
  timeAdvanceMinutes: number;
}
