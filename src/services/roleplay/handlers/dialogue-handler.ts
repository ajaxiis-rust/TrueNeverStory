import type { UnifiedEntityStore } from '../../../store/entity-store';
import type { NPCAgent } from '../../npc-agent';
import type { Chronicler } from '../../chronicler';
import type { SessionState } from '../session-state';
import type { Intent } from '../../../models/intent';
import type { GameContext } from '../../context-builder';
import { t } from '../../../i18n';

export class DialogueHandler {
  constructor(
    private entityStore: UnifiedEntityStore,
    private npcAgent: NPCAgent,
    private chronicler: Chronicler,
    private session: SessionState,
  ) {}

  async handle(intent: Intent & { type: 'dialogue' }, context: GameContext): Promise<string> {
    const npcNode = this.entityStore.getByNameAndType(intent.target, 'Character');
    if (!npcNode) {
      const lang = t();
      return lang.noNpc(intent.target);
    }

    const personality = (npcNode.profile.l2.personality as string) ?? 'friendly and neutral';
    const recentEvents = context.recentTimeline.map(e => e.description);

    const response = await this.npcAgent.respond(
      intent.target,
      personality,
      this.session.activeCharacter ?? 'you',
      this.session.currentLocation,
      intent.content,
      recentEvents,
    );

    await this.chronicler.logEvent(
      `${this.session.activeCharacter ?? 'Player'} talked to ${intent.target}: '${intent.content}'`,
      this.session.currentTime,
      'dialogue',
    );

    return `${intent.target} says: "${response}"`;
  }
}
