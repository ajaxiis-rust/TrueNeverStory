/**
 * World Validator — validates actions against world rules.
 * Replaces world_narrative/validation.ts.
 */

import type { UnifiedEntityStore } from "../store/entity-store";

interface WorldRule {
  name?: string;
  description?: string;
  category?: string;
}

export class WorldValidator {
  private _entityStore: UnifiedEntityStore;
  private _worldFrame: Record<string, unknown>;
  private _rules: WorldRule[];

  constructor(entityStore: UnifiedEntityStore, worldFrame: Record<string, unknown>) {
    this._entityStore = entityStore;
    this._worldFrame = worldFrame;
    this._rules = (worldFrame.world_rules as WorldRule[]) ?? [];
  }

  async validateAction(
    actorName: string,
    action: string,
    location?: string,
  ): Promise<{ isValid: boolean; message: string; forcedEffects: Array<Record<string, unknown>> }> {
    const forced: Array<Record<string, unknown>> = [];
    const actorNode = this._entityStore.getByNameAndType(actorName, "Character");
    if (!actorNode) {
      return { isValid: false, message: `Actor '${actorName}' is not a known character.`, forcedEffects: forced };
    }

    const actionLow = action.toLowerCase();
    const locLow = location?.toLowerCase() ?? "";

    for (const rule of this._rules) {
      const ruleText = `${rule.name ?? ""} ${rule.description ?? ""}`.toLowerCase();

      if (ruleText.includes("no magic") && actionLow === "cast_magic") {
        const match = ruleText.match(/no magic in (?:the )?([a-z0-9' -]+)/);
        if (match?.[1] && locLow.includes(match[1])) {
          forced.push({ type: "npc_health", entity: actorName, delta: -15 });
          return { isValid: false, message: `Rule '${rule.name}' forbids magic here!`, forcedEffects: forced };
        }
      }

      if (ruleText.includes("no combat") && ["attack", "fight"].includes(actionLow)) {
        const match = ruleText.match(/no (?:combat|violence|fighting) in (?:the )?([a-z0-9' -]+)/);
        if (match?.[1] && locLow.includes(match[1])) {
          return { isValid: false, message: `Rule '${rule.name}' forbids combat here.`, forcedEffects: forced };
        }
      }
    }

    return { isValid: true, message: "ok", forcedEffects: forced };
  }
}
