import type { Intent } from '../../../models/intent';
import type { GameContext } from '../../context-builder';
import type { PipelineContext } from '../pipeline-context';

/** Marker interface — can prevent duplication. Not exported. */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface _ProseContext { }

export interface ProseGenerator {
  canHandle(intent: Intent): boolean;
  generate(ctx: PipelineContext, intent: Intent, gameContext: GameContext): Promise<string>;
  generateStream?(ctx: PipelineContext, intent: Intent, gameContext: GameContext): AsyncGenerator<{ type: string; content?: string; location?: string; story_time?: string; active_character?: string }>;
}
