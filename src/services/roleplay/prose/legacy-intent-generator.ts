import type { Intent } from '../../../models/intent';
import { isMovementIntent, isDialogueIntent, isObservationIntent } from '../../../models/intent';
import type { OutcomeQuality } from '../../../models/simulation';
import type { GameContext } from '../../context-builder';
import type { PipelineContext } from '../pipeline-context';
import { MovementHandler } from '../handlers/movement-handler';
import { DialogueHandler } from '../handlers/dialogue-handler';
import { ObservationHandler } from '../handlers/observation-handler';
import { ActionHandler } from '../handlers/action-handler';

export class LegacyIntentGenerator {
  constructor(
    private movement: MovementHandler,
    private dialogue: DialogueHandler,
    private observation: ObservationHandler,
    private action: ActionHandler,
  ) {}

  async generate(
    intent: Intent,
    simResult: { outcome: OutcomeQuality; narrativeHints: string[]; probability: number },
    gameContext: GameContext,
  ): Promise<string> {
    if (isMovementIntent(intent)) {
      return this.movement.handle(intent as Intent & { type: 'movement' }, gameContext);
    }
    if (isDialogueIntent(intent)) {
      return this.dialogue.handle(intent as Intent & { type: 'dialogue' }, gameContext);
    }
    if (isObservationIntent(intent)) {
      return this.observation.handle(intent as Intent & { type: 'observation' }, gameContext);
    }
    return this.action.handle(intent, simResult, gameContext);
  }

  async *generateStream(
    intent: Intent,
    simResult: { outcome: OutcomeQuality; narrativeHints: string[]; probability: number },
    gameContext: GameContext,
  ): AsyncGenerator<{ type: string; content?: string; location?: string; story_time?: string; active_character?: string }> {
    if (isActionIntent(intent)) {
      yield* this.action.handleStream(intent, simResult, gameContext);
      return;
    }
    // Non-action intents: generate sync then yield as single chunk
    const narrative = await this.generate(intent, simResult, gameContext);
    yield { type: 'chunk', content: narrative };
  }
}

function isActionIntent(intent: Intent): boolean {
  return !isMovementIntent(intent) && !isDialogueIntent(intent) && !isObservationIntent(intent);
}
