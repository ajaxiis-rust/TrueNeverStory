/**
 * Social Simulator — NPC social interactions.
 * Replaces world_narrative/social_sim.ts.
 */

import type { UnifiedEntityStore } from "../store/entity-store";
import { getLogger } from "../utils/logger";

const log = getLogger("social-simulator");

export interface SocialInteraction {
  type: string;
  participants: [string, string];
  description: string;
  timestamp: string;
}

export class SocialSimulator {
  private _entityStore: UnifiedEntityStore;

  constructor(entityStore: UnifiedEntityStore) {
    this._entityStore = entityStore;
  }

  async simulateInteraction(): Promise<SocialInteraction | null> {
    const pair = this._selectPair();
    if (!pair) return null;

    const [npc1, npc2] = pair;
    const interaction = this._generateInteraction(npc1, npc2);

    log.info({ npc1, npc2, type: interaction.type }, "Simulated social interaction");
    return interaction;
  }

  private _selectPair(): [string, string] | null {
    const characters = this._entityStore.listByType("Character");
    if (characters.length < 2) return null;

    const i = Math.floor(Math.random() * characters.length);
    let j = Math.floor(Math.random() * characters.length);
    while (j === i) j = Math.floor(Math.random() * characters.length);

    const a = characters[i];
    const b = characters[j];
    if (a && b) return [a.name, b.name];
    return null;
  }

  private _generateInteraction(npc1: string, npc2: string): SocialInteraction {
    const types = ["conversation", "trade", "gossip", "argument", "cooperation"];
    const type = types[Math.floor(Math.random() * types.length)] ?? "conversation";
    return {
      type,
      participants: [npc1, npc2],
      description: `${npc1} and ${npc2} ${type === "conversation" ? "have a conversation" : `engage in ${type}`}.`,
      timestamp: new Date().toISOString(),
    };
  }
}
