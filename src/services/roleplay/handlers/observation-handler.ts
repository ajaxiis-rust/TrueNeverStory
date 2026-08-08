import type { UnifiedEntityStore } from '../../../store/entity-store';
import type { Intent } from '../../../models/intent';
import type { GameContext } from '../../context-builder';

export class ObservationHandler {
  constructor(private entityStore: UnifiedEntityStore) {}

  async handle(intent: Intent & { type: 'observation' }, context: GameContext): Promise<string> {
    if (intent.target) {
      const entity = this.entityStore.getByName(intent.target);
      if (entity) {
        const description = (entity.profile.l2.description as string) ?? (entity.profile.summary as string);
        return `You examine ${intent.target}. ${description}`;
      }
      return `You look at ${intent.target} but see nothing noteworthy.`;
    }

    const locNode = context.location;
    if (locNode) {
      const desc = (locNode.profile.l2.description as string) ?? 'You see nothing special.';
      return `You look around. ${desc}`;
    }
    return 'You look around but see nothing of note.';
  }
}
