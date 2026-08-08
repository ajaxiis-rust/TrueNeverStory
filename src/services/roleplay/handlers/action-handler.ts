import type { Intent } from '../../../models/intent';
import type { OutcomeQuality } from '../../../models/simulation';
import type { GameContext } from '../../context-builder';
import type { StoryContext } from '../../../models/story';
import type { SessionState } from '../session-state';
import type { NarratorAgent } from '../../narrator-agent';
import { MemoryManager } from '../../memory-manager';

interface SimResult {
  outcome: OutcomeQuality;
  narrativeHints: string[];
  probability: number;
}

export class ActionHandler {
  constructor(
    private narrator: NarratorAgent,
    private memory: MemoryManager,
    private session: SessionState,
    private worldFrame: Record<string, unknown>,
  ) {}

  private buildStoryContext(context: GameContext): StoryContext {
    const nearbyNpcs = context.nearbyNpcs.map(n => n.name);
    const worldRules = context.worldRules.map(r => `- ${r.name}: ${r.description}`);
    const recentTimeline = context.recentTimeline.map(e => e.description);

    return {
      worldName: context.world.name,
      currentTime: context.time.toISOString(),
      location: context.location?.name ?? this.session.currentLocation,
      activeCharacter: this.session.activeCharacter,
      userRole: this.session.userRole,
      recentTimeline,
      worldRules,
      nearbyNpcs,
      availableItems: [],
      activeQuests: context.activeQuests.map(q => ({ title: q.title, status: q.status })),
      directorPlan: null,
      genre: (this.worldFrame.genre as string) ?? undefined,
      language: (this.worldFrame.language as string) ?? undefined,
      magicSystem: ((this.worldFrame.magic_system as Record<string, string>)?.rules) ?? undefined,
      worldDescription: (this.worldFrame.description as string) ?? undefined,
    };
  }

  async handle(
    _intent: Intent,
    simResult: SimResult,
    context: GameContext,
  ): Promise<string> {
    const storyContext = this.buildStoryContext(context);
    const conversation = this.memory.getRecent(5);
    const hints = simResult.narrativeHints.join('\n');

    return this.narrator.generate(
      storyContext,
      [],
      [`Simulation outcome: ${simResult.outcome} (${(simResult.probability * 100).toFixed(0)}%)\nHints: ${hints}`],
      conversation,
    );
  }

  async *handleStream(
    _intent: Intent,
    simResult: SimResult,
    context: GameContext,
  ): AsyncGenerator<{ type: string; content?: string; location?: string; story_time?: string; active_character?: string }> {
    const storyContext = this.buildStoryContext(context);
    const conversation = this.memory.getRecent(5);
    const hints = simResult.narrativeHints.join('\n');

    const fullPrompt = `Generate a narrative response based on context. Simulation outcome: ${simResult.outcome} (${(simResult.probability * 100).toFixed(0)}%)\nHints: ${hints}`;

    // Yield chunks by generating and splitting
    const narrative = await this.narrator.generate(
      storyContext,
      [],
      [fullPrompt],
      conversation,
    );

    // Yield the narrative as a single chunk (streaming approximation)
    yield { type: 'chunk', content: narrative };
    yield { type: 'done', location: this.session.currentLocation, story_time: this.session.currentTime.toISOString(), active_character: this.session.activeCharacter ?? undefined };
  }
}
