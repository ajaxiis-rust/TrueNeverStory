/**
 * Social Simulator — NPC social interactions with relationship-aware pair selection
 * and context-driven interaction types.
 */

import type { UnifiedEntityStore } from "../store/entity-store";
import type { Chronicler } from "./chronicler";
import { readJsonFileSync, atomicWriteJson } from "../lib/atomic-io";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getLogger } from "../utils/logger";

const log = getLogger("social-simulator");

export interface SocialInteraction {
  type: string;
  participants: [string, string];
  description: string;
  timestamp: string;
}

interface InteractionHistory {
  pairs: Record<string, number>;
  lastInteraction: Record<string, string>;
}

interface InteractionWeights {
  same_location: string[];
  same_faction: string[];
  different_faction: string[];
}

const INTERACTION_WEIGHTS: InteractionWeights = {
  same_location: ["conversation", "gossip", "cooperation", "trade"],
  same_faction: ["trade", "cooperation", "gossip"],
  different_faction: ["gossip", "argument", "trade"],
};

const DEFAULT_POOL = ["conversation", "trade", "gossip", "argument", "cooperation"];

export class SocialSimulator {
  private _entityStore: UnifiedEntityStore;
  private _chronicler: Chronicler | null;
  private _statePath: string;
  private _history: InteractionHistory = { pairs: {}, lastInteraction: {} };
  private _cooldownMs = 5 * 60 * 1000;

  constructor(entityStore: UnifiedEntityStore, chronicler?: Chronicler | null, statePath?: string) {
    this._entityStore = entityStore;
    this._chronicler = chronicler ?? null;
    this._statePath = statePath ?? "";
    if (this._statePath) this._load();
  }

  private _load(): void {
    const path = join(this._statePath, "social", "interaction_history.json");
    if (!existsSync(path)) return;
    try {
      this._history = readJsonFileSync<InteractionHistory>(path) ?? this._history;
    } catch { /* ignore */ }
  }

  private _save(): void {
    if (!this._statePath) return;
    const path = join(this._statePath, "social", "interaction_history.json");
    atomicWriteJson(path, this._history);
  }

  async simulateInteraction(): Promise<SocialInteraction | null> {
    const characters = this._entityStore.listByType("Character");
    if (characters.length < 2) return null;

    const pair = this._selectPair(characters);
    if (!pair) return null;

    const [a, b] = pair;
    const type = this._determineType(a.name, b.name);
    const description = this._generateDescription(a.name, b.name, type);

    const interaction: SocialInteraction = {
      type,
      participants: [a.name, b.name],
      description,
      timestamp: new Date().toISOString(),
    };

    const pairKey = [a.name, b.name].sort().join(":");
    this._history.pairs[pairKey] = (this._history.pairs[pairKey] ?? 0) + 1;
    this._history.lastInteraction[pairKey] = interaction.timestamp;
    this._save();

    if (this._chronicler) {
      await this._chronicler.logEvent(
        `Social: ${a.name} and ${b.name} ${type}`,
        new Date(),
        "social",
      );
    }

    log.info({ a: a.name, b: b.name, type }, "Social interaction");
    return interaction;
  }

  private _selectPair(characters: Array<{ name: string; uid: string; profile: { l2: Record<string, unknown> } }>): [typeof characters[0], typeof characters[0]] | null {
    const now = Date.now();
    const scored: Array<{ a: typeof characters[0]; b: typeof characters[0]; score: number }> = [];

    for (let i = 0; i < characters.length; i++) {
      for (let j = i + 1; j < characters.length; j++) {
        const a = characters[i]!;
        const b = characters[j]!;
        let score = 1;

        const locA = a.profile.l2.current_location as string | undefined;
        const locB = b.profile.l2.current_location as string | undefined;
        if (locA && locB && locA === locB) score += 5;

        const factionA = a.profile.l2.faction as string | undefined;
        const factionB = b.profile.l2.faction as string | undefined;
        if (factionA && factionB && factionA === factionB) score += 3;

        const pairKey = [a.name, b.name].sort().join(":");
        const lastStr = this._history.lastInteraction[pairKey];
        if (lastStr) {
          const lastMs = new Date(lastStr).getTime();
          if (now - lastMs < this._cooldownMs) score *= 0.1;
        }
        const count = this._history.pairs[pairKey] ?? 0;
        score *= Math.pow(0.9, Math.min(count, 10));

        scored.push({ a, b, score });
      }
    }

    if (scored.length === 0) return null;

    const totalScore = scored.reduce((s, x) => s + x.score, 0);
    let roll = Math.random() * totalScore;
    for (const entry of scored) {
      roll -= entry.score;
      if (roll <= 0) return [entry.a, entry.b];
    }
    const last = scored[scored.length - 1]!;
    return [last.a, last.b];
  }

  private _determineType(nameA: string, nameB: string): string {
    const charA = this._entityStore.getByNameAndType(nameA, "Character");
    const charB = this._entityStore.getByNameAndType(nameB, "Character");

    const locA = charA?.profile.l2.current_location as string | undefined;
    const locB = charB?.profile.l2.current_location as string | undefined;
    const factionA = charA?.profile.l2.faction as string | undefined;
    const factionB = charB?.profile.l2.faction as string | undefined;

    let pool: string[];
    if (locA && locB && locA === locB) {
      pool = factionA && factionA === factionB
        ? INTERACTION_WEIGHTS.same_faction
        : INTERACTION_WEIGHTS.same_location;
    } else if (factionA && factionB && factionA !== factionB) {
      pool = INTERACTION_WEIGHTS.different_faction;
    } else {
      pool = DEFAULT_POOL;
    }

    return pool[Math.floor(Math.random() * pool.length)] ?? "conversation";
  }

  private _generateDescription(nameA: string, nameB: string, type: string): string {
    switch (type) {
      case "conversation":
        return `${nameA} and ${nameB} chat casually.`;
      case "trade":
        return `${nameA} trades goods with ${nameB}.`;
      case "gossip":
        return `${nameA} shares rumors with ${nameB}.`;
      case "argument":
        return `${nameA} and ${nameB} have a heated disagreement.`;
      case "cooperation":
        return `${nameA} and ${nameB} work together on a task.`;
      default:
        return `${nameA} interacts with ${nameB}.`;
    }
  }

  getInteractionCount(): number {
    return Object.values(this._history.pairs).reduce((s, n) => s + n, 0);
  }
}
