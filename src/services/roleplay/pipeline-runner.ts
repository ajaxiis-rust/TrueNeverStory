import type { UnifiedEntityStore } from '../../store/entity-store';
import type { LLMQueue } from '../../lib/llm-queue';
import type { HistoryManager } from '../../lib/history-manager';
import type { Intent } from '../../models/intent';
import { isMovementIntent, isDialogueIntent, isActionIntent, isCommandIntent, isObservationIntent } from '../../models/intent';
import type { SimulationResult } from '../../models/simulation';
import type { GameContext, EngineState } from '../context-builder';
import type { SessionState } from './session-state';
import type { PipelineContext, StreamYield } from './pipeline-context';

export interface PipelineDeps {
  entityStore: UnifiedEntityStore;
  llmQueue: LLMQueue;
  historyMgr: HistoryManager;
  worldFrame: Record<string, unknown>;
  session: SessionState;
  // Injected services
  translationService?: { detectLanguage: (text: string) => string; translateToEnglish: (text: string, lang: string) => Promise<string>; translateAndClassify: (text: string, lang: string) => Promise<{ translated: string; intent: Intent } | null> };
  intentParser: { parse: (text: string, ctx: unknown) => Promise<Intent> };
  simulationEngine: { simulate: (intent: Intent, ctx: unknown) => Promise<SimulationResult> };
  stateMutator: { applyChanges: (changes: unknown[]) => Promise<void> };
  contextBuilder: { buildParserContext: (state: EngineState) => unknown; build: (state: EngineState) => Promise<GameContext> };
}

export class PipelineRunner {
  constructor(private deps: PipelineDeps) {}

  /**
   * Build initial pipeline context from user input.
   */
  buildContext(userInput: string): PipelineContext {
    return {
      rawInput: userInput,
      parsedInput: userInput.trim(),
      inputLang: 'en',
      engineState: {
        activeCharacter: this.deps.session.activeCharacter,
        currentLocation: this.deps.session.currentLocation,
        currentTime: this.deps.session.currentTime,
        userRole: this.deps.session.userRole,
        visitedLocations: this.deps.session.visitedLocations,
      },
    };
  }

  /**
   * Translate and classify intent (Steps 0+1).
   */
  async translateAndClassify(ctx: PipelineContext): Promise<Intent> {
    const needsTranslation = this.deps.translationService && this.deps.worldFrame.language && this.deps.worldFrame.language !== 'en';
    const inputLang = needsTranslation ? this.deps.translationService!.detectLanguage(ctx.parsedInput) : 'en';
    ctx.inputLang = inputLang;

    if (needsTranslation && inputLang !== 'en') {
      const combined = await this.deps.translationService!.translateAndClassify(ctx.parsedInput, inputLang);
      if (combined) {
        ctx.parsedInput = combined.translated;
        return combined.intent;
      }
      // Fallback: translate separately, then parse
      ctx.parsedInput = await this.deps.translationService!.translateToEnglish(ctx.parsedInput, inputLang);
      return this.deps.intentParser.parse(ctx.parsedInput, this.deps.contextBuilder.buildParserContext(ctx.engineState));
    }

    return this.deps.intentParser.parse(ctx.parsedInput, this.deps.contextBuilder.buildParserContext(ctx.engineState));
  }

  /**
   * Run simulation (Step 3).
   */
  async runSimulation(ctx: PipelineContext): Promise<SimulationResult> {
    const characterEntity = this.deps.entityStore.getByNameAndType(
      this.deps.session.activeCharacter ?? 'unknown',
      'Character',
    );
    const simContext = {
      characterLevel: typeof characterEntity?.profile?.l2?.['level'] === 'number' ? characterEntity.profile.l2['level'] : 1,
      characterStats: (characterEntity?.profile?.l2 ?? {}) as Record<string, number>,
      locationDanger: 0,
      timeOfDay: 'day' as string,
      weather: 'clear',
      activeBuffs: [] as string[],
      activeDebuffs: [] as string[],
    };
    return this.deps.simulationEngine.simulate(ctx.intent!, simContext);
  }

  /**
   * Build game context from updated state (Step 5).
   */
  async buildGameContext(ctx: PipelineContext): Promise<GameContext> {
    return this.deps.contextBuilder.build(ctx.engineState);
  }
}
