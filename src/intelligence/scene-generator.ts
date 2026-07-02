/**
 * Narrative scene generation from subgraphs.
 * Replaces world_intelligence/scene_generator.ts.
 */

import type { GraphStore } from "../services/graph-store";
import { getLogger } from "../utils/logger";

const log = getLogger("scene-generator");

export class SceneGenerator {
  private _store: GraphStore;

  constructor(store: GraphStore) {
    this._store = store;
  }

  generateSceneFromCluster(centerUid: string, numCharacters = 3): Record<string, unknown> {
    const entity = this._store.entityStore.get(centerUid);
    if (!entity) return { error: "Entity not found" };

    // Get neighbors
    const neighbors = this._store.getNeighbors(centerUid, 2);

    // Select characters
    const chars: string[] = [];
    for (const [uid] of neighbors) {
      const node = this._store.entityStore.get(uid);
      if (node?.entityType === "Character" && chars.length < numCharacters) {
        chars.push(node.name);
      }
    }
    if (entity.entityType === "Character") chars.unshift(entity.name);

    // Select location
    let locationName = "an unknown place";
    for (const [uid] of neighbors) {
      const node = this._store.entityStore.get(uid);
      if (node?.entityType === "Location") {
        locationName = node.name;
        break;
      }
    }

    return {
      characters: chars.slice(0, numCharacters),
      location: locationName,
      context: `Characters: ${chars.join(", ")} at ${locationName}`,
    };
  }
}
