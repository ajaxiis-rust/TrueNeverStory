import type { LLMQueue } from '../../../lib/llm-queue';
import type { GameContext } from '../../context-builder';
import type { PipelineContext } from '../pipeline-context';
import { getFeatureFlagManager } from '../../../lib/feature-flags';
import { searchTemplates, type RetrievalKeys } from '../../../mcp/literary-compiler/retrieval';
import { fillTemplate } from '../../../mcp/literary-compiler/fill-template';
import { LiteraryCompilerDB } from '../../../mcp/literary-compiler/schema';
import type { StylistAgent } from '../../agents/stylist';
import { getLogger } from '../../../utils/logger';

const log = getLogger('literary-v2-generator');

export class LiteraryV2Generator {
  constructor(
    private llmQueue: LLMQueue,
    private stylist: StylistAgent,
    private worldFrame: Record<string, unknown>,
    private getLiteraryDb: () => LiteraryCompilerDB | null,
  ) {}

  canHandle(): boolean {
    return getFeatureFlagManager().isEnabled('literary-compiler-v2') && this.getLiteraryDb() !== null;
  }

  async generate(
    ctx: PipelineContext,
    gameContext: GameContext,
    _simOutcome: string,
  ): Promise<string> {
    const literaryDb = this.getLiteraryDb();
    if (!literaryDb) throw new Error('literary db not available');

    const v2Start = Date.now();
    const keys: RetrievalKeys = {
      archetype: undefined,
      mood: undefined,
      domain: undefined,
      position: undefined,
    };

    const results = await searchTemplates(literaryDb, keys, 2);
    if (results.length === 0) throw new Error('no templates found');

    const ranked = results[0]!;
    const template = ranked.template;
    const filled = fillTemplate(template.template_text, this.extractVariables(gameContext));

    const style = await this.getStyleForTemplate(template.id, literaryDb);
    const prompt = this.stylist.buildMicroPrompt(
      filled,
      style,
      { world: (this.worldFrame.name as string) ?? 'unknown', location: gameContext.location?.name ?? 'unknown' },
      _simOutcome,
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

  private extractVariables(ctx: GameContext): Record<string, string> {
    return {
      character: ctx.activeCharacter ?? '',
      location: ctx.location?.name ?? '',
      world: ctx.world.name,
      time: ctx.time?.toISOString?.() ?? String(ctx.time ?? ''),
    };
  }

  private async getStyleForTemplate(templateId: string, literaryDb: LiteraryCompilerDB): Promise<Record<string, string>> {
    try {
      const style = literaryDb.getStyleForTemplate(templateId);
      return style ? { mood: style.mood, tone: style.tone, pacing: style.pacing } : {};
    } catch {
      return {};
    }
  }
}
