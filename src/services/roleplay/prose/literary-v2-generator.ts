import type { LLMQueue } from '../../../lib/llm-queue';
import type { GameContext } from '../../context-builder';
import type { Intent } from '../../../models/intent';
import type { SimulationResult } from '../../../models/simulation';
import { searchTemplates, type RetrievalKeys } from '../../../mcp/literary-compiler/retrieval';
import { fillTemplate } from '../../../mcp/literary-compiler/fill-template';
import { LiteraryCompilerDB } from '../../../mcp/literary-compiler/schema';
import type { StylistAgent } from '../../agents/stylist';
import { getLogger } from '../../../utils/logger';

const log = getLogger('literary-v2-generator');

interface MicroStyle {
  register: string;
  pacing: string;
  sensory: string[];
  snippets: string[];
  forbidden: string[];
}

const DEFAULT_STYLE: MicroStyle = {
  register: 'medium',
  pacing: 'medium',
  sensory: [],
  snippets: [],
  forbidden: [],
};

export class LiteraryV2Generator {
  constructor(
    private llmQueue: LLMQueue,
    private stylist: StylistAgent,
    private worldFrame: Record<string, unknown>,
    private getLiteraryDb: () => LiteraryCompilerDB | null,
  ) {}

  async generate(
    intent: Intent,
    simulation: SimulationResult,
    gameContext: GameContext,
    rawInput: string,
    playerVoice?: string,
  ): Promise<string> {
    const literaryDb = this.getLiteraryDb();
    if (!literaryDb) {
      return this.generateViaStylist(intent, simulation, gameContext, playerVoice);
    }

    const keys = this.buildRetrievalKeys(intent, rawInput);
    let results: Awaited<ReturnType<typeof searchTemplates>> = [];
    try {
      results = await searchTemplates(literaryDb, keys, 2);
    } catch (err) {
      log.warn({ err }, 'template retrieval failed, falling back to stylist');
    }

    if (results.length === 0) {
      return this.generateViaStylist(intent, simulation, gameContext, playerVoice);
    }

    const v2Start = Date.now();
    const template = results[0]!.template;
    const filled = fillTemplate(template.template_text, this.extractVariables(gameContext));
    const style = await this.getStyleForTemplate(template.id, literaryDb);
    const prompt = this.stylist.buildMicroPrompt(
      filled,
      style,
      { world: (this.worldFrame.name as string) ?? 'unknown', location: gameContext.location?.name ?? 'unknown' },
      simulation.outcome,
      playerVoice,
    );

    const narrative = await this.llmQueue.generateText(
      prompt.system + '\n\n' + prompt.user,
      1,
      0.6,
      'stylist',
    );

    log.info({ templateId: template.id, ms: Date.now() - v2Start }, 'v2 pipeline used');
    return narrative;
  }

  private async generateViaStylist(
    intent: Intent,
    simulation: SimulationResult,
    gameContext: GameContext,
    playerVoice?: string,
  ): Promise<string> {
    const output = await this.stylist.process(intent, simulation, gameContext);
    if (output.text) return output.text;

    const prompt = this.stylist.buildMicroPrompt(
      `The character acts in ${gameContext.location?.name ?? 'the world'}.`,
      DEFAULT_STYLE,
      { world: (this.worldFrame.name as string) ?? 'unknown', location: gameContext.location?.name ?? 'unknown' },
      simulation.outcome,
      playerVoice,
    );
    return this.llmQueue.generateText(prompt.system + '\n\n' + prompt.user, 1, 0.6, 'stylist');
  }

  private buildRetrievalKeys(intent: Intent, rawInput: string): RetrievalKeys {
    switch (intent.type) {
      case 'movement': return { mood: 'movement', queryText: intent.destination };
      case 'dialogue': return { mood: 'dialogue', queryText: intent.content };
      case 'action': return { queryText: [intent.verb, intent.target].filter(Boolean).join(' ') };
      case 'observation': return { mood: 'observation', queryText: intent.target ?? 'surroundings' };
      default: return { queryText: rawInput };
    }
  }

  private extractVariables(ctx: GameContext): Record<string, string> {
    return {
      character: ctx.character?.name ?? '',
      location: ctx.location?.name ?? '',
      world: ctx.world.name,
      time: ctx.time?.toISOString?.() ?? String(ctx.time ?? ''),
    };
  }

  private async getStyleForTemplate(templateId: string, literaryDb: LiteraryCompilerDB): Promise<MicroStyle> {
    try {
      const style = literaryDb.getStyleForTemplate(templateId) as Record<string, unknown> | null;
      if (!style) return DEFAULT_STYLE;
      return {
        register: (style.register as string) ?? 'medium',
        pacing: (style.pacing as string) ?? 'medium',
        sensory: [],
        snippets: (style.example_snippets as string[]) ?? [],
        forbidden: (style.forbidden_phrases as string[]) ?? [],
      };
    } catch {
      return DEFAULT_STYLE;
    }
  }
}
