import type { Intent } from '../../models/intent';
import type { SimulationResult } from '../../models/simulation';
import type { GameContext, EngineState } from '../context-builder';

export interface PipelineContext {
  rawInput: string;
  parsedInput: string;
  inputLang: string;
  engineState: EngineState;
  intent?: Intent;
  simResult?: SimulationResult;
  gameContext?: GameContext;
  narrative?: string;
  earlyExit?: string;
  v2Used?: boolean;
  agentResponse?: { response: string; agentId: string; agentName: string };
}

export interface StreamYield {
  type: 'heartbeat' | 'chunk' | 'result' | 'done';
  content?: string;
  agent_id?: string;
  agent_name?: string;
  location?: string;
  story_time?: string;
  active_character?: string;
}
