/**
 * WorldEvolver — periodically adds new NPCs, locations, and items to the world.
 * Replaces world_director/world_evolver.py.
 */

import type { WorldBuilder } from "./world-builder";
import type { Chronicler } from "./chronicler";
import type { EntityNode } from "../models/entity";
import { getLogger } from "../utils/logger";

const log = getLogger("world-evolver");

export interface WorldEvolverDeps {
  worldBuilder: WorldBuilder;
  chronicler: Chronicler;
}

export class WorldEvolver {
  private _builder: WorldBuilder;
  private _chronicler: Chronicler;

  constructor(deps: WorldEvolverDeps) {
    this._builder = deps.worldBuilder;
    this._chronicler = deps.chronicler;
  }

  private _pickRandomFaction(): string {
    const wf = this._builder.worldFrame;
    if (!wf) return "unknown";
    const factions = (wf.factions as Array<Record<string, unknown>> ?? []);
    const races = (wf.races as Array<Record<string, unknown>> ?? []);
    const candidates = [
      ...factions.map((f) => f.name as string),
      ...races.map((r) => r.name as string),
    ];
    if (candidates.length === 0) return "unknown";
    return candidates[Math.floor(Math.random() * candidates.length)] ?? "unknown";
  }

  async addRandomNPC(factionOrRace?: string): Promise<string> {
    const faction = factionOrRace ?? this._pickRandomFaction();
    const node: EntityNode = await this._builder.addNPC(faction);
    await this._chronicler.logEvent(
      `New NPC ${node.name} appeared in the world.`,
      new Date(),
      "evolution",
    );
    log.info(`Added NPC: ${node.name} (${faction})`);
    return node.name;
  }

  async addRandomLocation(): Promise<string> {
    const name = `Location_${Math.floor(100 + Math.random() * 900)}`;
    await this._chronicler.logEvent(
      `New location discovered: ${name}`,
      new Date(),
      "evolution",
    );
    log.info(`Added location: ${name}`);
    return name;
  }

  async addRandomItem(itemType = "artifact"): Promise<string> {
    const rarities = ["common", "uncommon", "rare"];
    const rarity = rarities[Math.floor(Math.random() * rarities.length)];
    const name = `${itemType}_${rarity}_${Math.floor(100 + Math.random() * 900)}`;
    await this._chronicler.logEvent(
      `New item: ${name} appears in the world.`,
      new Date(),
      "evolution",
    );
    log.info(`Added item: ${name} (${itemType}, ${rarity})`);
    return name;
  }

  async evolveWorld(): Promise<void> {
    if (Math.random() < 0.2) {
      await this.addRandomNPC();
    }
    if (Math.random() < 0.1) {
      await this.addRandomLocation();
    }
    if (Math.random() < 0.15) {
      await this.addRandomItem();
    }
  }
}
