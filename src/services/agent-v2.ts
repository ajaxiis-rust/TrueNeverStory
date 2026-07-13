import { Intent } from '@/models/intent';
import { SimulationResult, StateChange } from '@/models/simulation';
import { GameContext } from '@/services/context-builder';

// ─── Agent ID ────────────────────────────────────────────────────────────────

export type AgentId = 'dramaturg' | 'validator' | 'stylist' | 'actor' | 'censor' | 'chronicler';

// ─── Agent Output ────────────────────────────────────────────────────────────

export interface AgentOutput {
  text?: string;
  stateChanges?: StateChange[];
  metadata?: Record<string, unknown>;
}

// ─── Narrative Pattern ───────────────────────────────────────────────────────

export interface NarrativePattern {
  archetype: string;
  name: string;
  description: string;
  verses: string[];
  mood: string;
}

// ─── Agent V2 Interface ──────────────────────────────────────────────────────

export interface AgentV2 {
  readonly id: AgentId;
  readonly name: string;
  readonly description: string;
  readonly mcpTools: string[];

  process(
    intent: Intent,
    simulation: SimulationResult,
    context: GameContext,
    pattern?: NarrativePattern,
  ): Promise<AgentOutput>;
}

// ─── Base Agent V2 ───────────────────────────────────────────────────────────

export abstract class BaseAgentV2 implements AgentV2 {
  abstract readonly id: AgentId;
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly mcpTools: string[];

  abstract process(
    intent: Intent,
    simulation: SimulationResult,
    context: GameContext,
    pattern?: NarrativePattern,
  ): Promise<AgentOutput>;
}
