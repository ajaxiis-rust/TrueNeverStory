/**
 * StartResolver — resolves user starting point specification.
 * Replaces world_engine/start_resolver.py.
 */

import type { UnifiedEntityStore } from "../store/entity-store";
import type { LLMQueue } from "../lib/llm-queue";
import { TaskPriority } from "../models/director";
import { getLogger } from "../utils/logger";

const log = getLogger("start-resolver");

export interface StartingPoint {
  character: string | null;
  location: string | null;
  storyTime: Date | null;
  scenario: string | null;
  customContext: string | null;
}

export class StartResolver {
  private _entityStore: UnifiedEntityStore;
  private _llmQueue: LLMQueue;
  private _agentId: string | undefined;

  constructor(entityStore: UnifiedEntityStore, llmQueue: LLMQueue, agentId?: string) {
    this._entityStore = entityStore;
    this._llmQueue = llmQueue;
    this._agentId = agentId;
  }

  private _findClosestEntity(name: string, entityType: string): string | null {
    const entities = this._entityStore.listByType(entityType);
    if (entities.length === 0) return null;

    const names = entities.map((e) => e.name);
    const lowerName = name.toLowerCase();

    // Simple fuzzy match: find closest by Levenshtein-like distance
    let bestMatch: string | null = null;
    let bestScore = 0;

    for (const candidate of names) {
      const lowerCandidate = candidate.toLowerCase();
      if (lowerCandidate === lowerName) return candidate;

      // Simple substring match
      if (lowerCandidate.includes(lowerName) || lowerName.includes(lowerCandidate)) {
        const score = Math.min(lowerName.length, lowerCandidate.length) /
          Math.max(lowerName.length, lowerCandidate.length);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = candidate;
        }
      }
    }

    return bestScore >= 0.6 ? bestMatch : null;
  }

  private _getDefaultLocation(): string | null {
    const locations = this._entityStore.listByType("Location");
    const first = locations[0];
    return first ? first.name : null;
  }

  async resolve(
    userSpec: string,
    _defaultWorldName: string,
    _defaultTime: Date,
  ): Promise<StartingPoint> {
    // Try JSON
    try {
      const data = JSON.parse(userSpec) as Record<string, unknown>;
      return {
        character: (data.character as string) ?? null,
        location: (data.location as string) ?? null,
        storyTime: data.time ? new Date(data.time as string) : null,
        scenario: (data.scenario as string) ?? null,
        customContext: (data.custom_context as string) ?? null,
      };
    } catch {
      // Not JSON — try key=value format below
    }

    // Try key=value format
    if (userSpec.includes("=")) {
      const parts = userSpec.split(/\s+/);
      const data: Record<string, string> = {};
      for (const part of parts) {
        if (part.includes("=")) {
          const [k, v] = part.split("=", 2) as [string, string];
          if (k && v) data[k] = v;
        }
      }
      return {
        character: data.character ?? null,
        location: data.location ?? null,
        storyTime: data.time ? new Date(data.time) : null,
        scenario: data.scenario ?? null,
        customContext: data.context ?? null,
      };
    }

    // Free-form: use LLM to extract
    const prompt = `Extract story starting parameters from the following user input.
Return a JSON object with keys: character, location, time (ISO format if mentioned), scenario (short description), custom_context (any extra description).
If not present, leave null.

User input: "${userSpec}"`;

    try {
      const result = await this._llmQueue.generateJson(prompt, TaskPriority.HIGH, 0.3, this._agentId);
      return {
        character: (result.character as string) ?? null,
        location: (result.location as string) ?? null,
        storyTime: result.time ? new Date(result.time as string) : null,
        scenario: (result.scenario as string) ?? null,
        customContext: (result.custom_context as string) ?? null,
      };
    } catch {
      return {
        character: null,
        location: null,
        storyTime: null,
        scenario: userSpec,
        customContext: userSpec,
      };
    }
  }

  applyToSession(
    session: { activeCharacter: string | null; currentLocation: string; currentTime: Date },
    start: StartingPoint,
  ): void {
    if (start.character) {
      const node = this._entityStore.getByNameAndType(start.character, "Character");
      if (!node) {
        const closest = this._findClosestEntity(start.character, "Character");
        if (closest) {
          log.warn({ expected: start.character, found: closest }, "Unknown character, using fuzzy match");
          start.character = closest;
        } else {
          throw new Error(`Unknown character: ${start.character}`);
        }
      }
      session.activeCharacter = start.character;
    }

    if (start.location) {
      const locNode = this._entityStore.getByNameAndType(start.location, "Location");
      if (!locNode) {
        const closest = this._findClosestEntity(start.location, "Location");
        if (closest) {
          log.warn({ expected: start.location, found: closest }, "Unknown location, using fuzzy match");
          start.location = closest;
        } else {
          const defaultLoc = this._getDefaultLocation();
          if (defaultLoc) {
            log.warn({ expected: start.location, found: defaultLoc }, "Unknown location, using default");
            start.location = defaultLoc;
          } else {
            start.location = null;
          }
        }
      }
      if (start.location) {
        session.currentLocation = start.location;
      }
    }

    if (start.storyTime) {
      session.currentTime = start.storyTime;
    }
  }
}
