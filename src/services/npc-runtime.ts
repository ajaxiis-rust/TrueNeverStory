/**
 * NPC Runtime — OptimizedMemoryStore for NPC state management.
 * Replaces world_narrative/memory_optimized.py.
 */

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { UnifiedEntityStore } from "../store/entity-store";
import type { LLMQueue } from "../lib/llm-queue";
import type { Chronicler } from "./chronicler";
import {
  type NPCProfile,
  type EpisodicMemory,
  createDefaultNPCProfile,
  serializeNPCProfile,
  deserializeNPCProfile,
} from "../models/npc-state";
import { readJsonFileSync } from "../lib/atomic-io";
import { atomicWriteJson } from "../lib/atomic-io";
import { getLogger } from "../utils/logger";

const log = getLogger("npc-runtime");

export class NPCRuntime {
  private _statePath: string;
  private _entityStore: UnifiedEntityStore;
  private _llmQueue: LLMQueue;
  private _chronicler: Chronicler | null;
  private _npcs: Map<string, NPCProfile> = new Map();
  private _shortTermLimit = 20;
  private _importanceThreshold = 0.4;

  constructor(
    statePath: string,
    entityStore: UnifiedEntityStore,
    llmQueue: LLMQueue,
    chronicler?: Chronicler | null,
  ) {
    this._statePath = statePath;
    this._entityStore = entityStore;
    this._llmQueue = llmQueue;
    this._chronicler = chronicler ?? null;

    const dir = join(statePath, "npc_profiles");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    this._load();
    this._syncFromEntities();
  }

  private _load(): void {
    const profilesPath = join(this._statePath, "npc_profiles.json");
    if (!existsSync(profilesPath)) return;
    try {
      const data = readJsonFileSync<Record<string, Record<string, unknown>>>(profilesPath);
      if (data) {
        for (const [name, d] of Object.entries(data)) {
          this._npcs.set(name, deserializeNPCProfile(name, d));
        }
      }
    } catch (err) {
      log.warn({ err }, "Failed to load NPC profiles");
    }
  }

  async _save(): Promise<void> {
    const data: Record<string, Record<string, unknown>> = {};
    for (const [name, p] of this._npcs) {
      data[name] = serializeNPCProfile(p);
    }
    await atomicWriteJson(join(this._statePath, "npc_profiles.json"), data);
  }

  private _syncFromEntities(): void {
    const characters = this._entityStore.listByType("Character");
    for (const node of characters) {
      if (!this._npcs.has(node.name)) {
        const loc = (node.profile.l2.current_location as string) ?? "unknown";
        const uid = node.uid;
        this._npcs.set(node.name, createDefaultNPCProfile(node.name, uid, loc));
      }
    }
    if (characters.length > 0) this._save();
  }

  async register(name: string, uid: string, location = "unknown"): Promise<NPCProfile> {
    if (!this._npcs.has(name)) {
      this._npcs.set(name, createDefaultNPCProfile(name, uid, location));
      await this._save();
    }
    return this._npcs.get(name)!;
  }

  async addMemory(
    name: string,
    description: string,
    emotion = "neutral",
    importance = 0.5,
    involvedEntities: string[] = [],
    location?: string,
  ): Promise<string> {
    const profile = this._npcs.get(name);
    if (!profile) throw new Error(`NPC '${name}' not found`);

    const memId = `${name}_mem_${profile.shortTerm.length + profile.longTermEpisodic.length}_${Date.now()}`;
    const memory: EpisodicMemory = {
      id: memId,
      timestamp: new Date().toISOString(),
      description,
      importance,
      emotion,
      involvedEntities,
      location: location ?? profile.location,
      consolidated: false,
    };
    profile.shortTerm.push(memory);

    // Consolidate: move important memories to long-term
    this._consolidate(profile);

    await this._save();
    return memId;
  }

  private _consolidate(profile: NPCProfile): void {
    const toPromote = profile.shortTerm.filter((m) => m.importance >= this._importanceThreshold);
    for (const mem of toPromote) {
      mem.consolidated = true;
      const exists = profile.longTermEpisodic.some((e) => e.description === mem.description);
      if (!exists) {
        profile.longTermEpisodic.push(mem);
      }
    }
    profile.shortTerm = profile.shortTerm.filter((m) => m.importance >= this._importanceThreshold || profile.shortTerm.indexOf(m) < this._shortTermLimit);
    if (profile.shortTerm.length > this._shortTermLimit) {
      profile.shortTerm.sort((a, b) => b.importance - a.importance);
      profile.shortTerm = profile.shortTerm.slice(0, this._shortTermLimit);
    }
  }

  async getMemories(name: string, limit = 20, minImportance = 0): Promise<EpisodicMemory[]> {
    const profile = this._npcs.get(name);
    if (!profile) return [];

    const all = [...profile.shortTerm, ...profile.longTermEpisodic];
    return all
      .filter((m) => m.importance >= minImportance)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);
  }

  async move(name: string, location: string, storyTime: Date): Promise<void> {
    const profile = this._npcs.get(name);
    if (!profile) return;
    const oldLoc = profile.location;
    profile.location = location;
    profile.updatedAt = storyTime.toISOString();
    if (oldLoc !== location) {
      await this.addMemory(name, `Moved to ${location}`, "neutral", 0.3, [], location);
    }
    await this._save();
  }

  async adjustHealth(name: string, delta: number): Promise<number> {
    const profile = this._npcs.get(name);
    if (!profile) return 100;
    profile.health = Math.max(0, Math.min(100, profile.health + delta));
    if (Math.abs(delta) >= 15) {
      await this.addMemory(name, `Health changed by ${delta}`, delta < 0 ? "fear" : "joy", 0.4);
    }
    await this._save();
    return profile.health;
  }

  async setMood(name: string, mood: string): Promise<void> {
    const profile = this._npcs.get(name);
    if (!profile) return;
    const old = profile.mood;
    profile.mood = mood;
    profile.updatedAt = new Date().toISOString();
    if (old !== mood) {
      await this.addMemory(name, `Mood changed from ${old} to ${mood}`, mood, 0.2);
    }
    await this._save();
  }

  async addGoal(name: string, goal: string): Promise<void> {
    const profile = this._npcs.get(name);
    if (profile && !profile.goals.includes(goal)) {
      profile.goals.push(goal);
      await this.addMemory(name, `Gained new goal: ${goal}`, "determined", 0.5);
      await this._save();
    }
  }

  async addItem(name: string, itemName: string): Promise<void> {
    const profile = this._npcs.get(name);
    if (profile) {
      profile.inventory.push(itemName);
      await this.addMemory(name, `Acquired ${itemName}`, "joy", 0.3);
      await this._save();
    }
  }

  async removeItem(name: string, itemName: string): Promise<void> {
    const profile = this._npcs.get(name);
    if (profile) {
      profile.inventory = profile.inventory.filter((i) => i !== itemName);
      await this.addMemory(name, `Lost ${itemName}`, "sadness", 0.3);
      await this._save();
    }
  }

  get(name: string): NPCProfile | undefined {
    return this._npcs.get(name);
  }

  listAll(): Map<string, NPCProfile> {
    return new Map(this._npcs);
  }

  async simulateTurn(currentTime: Date): Promise<void> {
    // Random mood drift for each NPC
    for (const [name, profile] of this._npcs) {
      if (Math.random() < 0.1) {
        const moods = ["neutral", "happy", "anxious", "determined", "content", "restless"];
        const newMood = moods[Math.floor(Math.random() * moods.length)] ?? "neutral";
        if (newMood !== profile.mood) {
          profile.mood = newMood;
          profile.updatedAt = currentTime.toISOString();
        }
      }
    }
    await this._save();
  }
}
