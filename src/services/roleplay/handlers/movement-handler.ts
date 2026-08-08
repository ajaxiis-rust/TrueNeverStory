import type { UnifiedEntityStore } from '../../../store/entity-store';
import type { SceneAgent } from '../../scene-agent';
import type { Chronicler } from '../../chronicler';
import type { SessionState } from '../session-state';
import type { Intent } from '../../../models/intent';
import type { GameContext } from '../../context-builder';
import { t } from '../../../i18n';

export class MovementHandler {
  constructor(
    private entityStore: UnifiedEntityStore,
    private sceneAgent: SceneAgent,
    private chronicler: Chronicler,
    private session: SessionState,
  ) {}

  async handle(intent: Intent & { type: 'movement' }, context: GameContext): Promise<string> {
    const destination = intent.destination;
    const locNode = this.entityStore.getByNameAndType(destination, 'Location');
    if (!locNode) {
      const lang = t();
      return lang.noPlace(destination);
    }

    const recentEvents = context.recentTimeline.map(e => e.description);
    const worldRules = context.worldRules.map(r => r.description);

    const description = await this.sceneAgent.transition(
      this.session.currentLocation,
      destination,
      this.session.activeCharacter ?? 'you',
      recentEvents,
      worldRules,
    );

    // Update state
    this.session.currentLocation = destination;
    this.session.currentTime = new Date(this.session.currentTime.getTime() + 10 * 60 * 1000);

    await this.chronicler.logEvent(
      `${this.session.activeCharacter ?? 'Player'} moved to ${destination}`,
      this.session.currentTime,
      'movement',
    );

    return description;
  }
}
