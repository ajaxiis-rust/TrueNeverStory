/**
 * Villain Manager — manages villain agendas, memories, and autonomous actions.
 * Replaces world_narrative/villain_manager.ts.
 *
 * TODO: Villain agent needs LLM integration for intelligent planning.
 * Current implementation is state-machine only (random events).
 * Consider: VillainAgent class with LLM for strategic planning.
 */

import { readJsonFileSync } from "../lib/atomic-io";
import { atomicWriteJson } from "../lib/atomic-io";
import { existsSync } from "node:fs";
import { getLogger } from "../utils/logger";

const log = getLogger("villain-manager");

interface VillainMemoryData {
  timestamp: string;
  description: string;
  involved_entities: string[];
  success: boolean;
  consequence?: string;
}

interface VillainAgendaData {
  name: string;
  description: string;
  current_phase: string;
  progress_clock: number;
  target_clock: number;
  memories: VillainMemoryData[];
  minions: string[];
  secret_base?: string;
  ultimate_goal: string;
}

export class VillainManager {
  private _statePath: string;
  private _villains: Map<string, VillainAgendaData> = new Map();
  private _chronicler: { logEvent: (desc: string, time: Date, group?: string) => Promise<string> } | null;

  constructor(statePath: string, chronicler?: { logEvent: (desc: string, time: Date, group?: string) => Promise<string> } | null) {
    this._statePath = statePath;
    this._chronicler = chronicler ?? null;
    this._load();
    if (this._villains.size === 0) this._createDefault();
  }

  private _load(): void {
    if (!existsSync(this._statePath)) return;
    try {
      const data = readJsonFileSync<Record<string, VillainAgendaData>>(this._statePath);
      if (data) {
        for (const [name, v] of Object.entries(data)) {
          this._villains.set(name, v);
        }
      }
    } catch (err) {
      log.warn({ err }, "Failed to load villain state");
    }
  }

  private async _save(): Promise<void> {
    const data: Record<string, VillainAgendaData> = {};
    for (const [name, v] of this._villains) data[name] = v;
    await atomicWriteJson(this._statePath, data);
  }

  private _createDefault(): void {
    this._villains.set("The Shadow", {
      name: "The Shadow",
      description: "A mysterious entity seeking to plunge the world into darkness.",
      current_phase: "plotting",
      progress_clock: 0,
      target_clock: 8,
      memories: [],
      minions: [],
      ultimate_goal: "Extinguish all light sources.",
    });
    this._save();
  }

  async tick(currentTime: Date): Promise<Array<Record<string, unknown>>> {
    const events: Array<Record<string, unknown>> = [];
    for (const [, villain] of this._villains) {
      const increment = this._getIncrement(villain.current_phase);
      villain.progress_clock += increment;

      if (villain.progress_clock >= villain.target_clock) {
        const transition = this._advancePhase(villain);
        if (transition) events.push(transition);
      }

      // 20% chance of minor event
      if (Math.random() < 0.2) {
        const event = this._generateVillainEvent(villain);
        if (event) events.push(event);
      }

      villain.memories.push({
        timestamp: currentTime.toISOString(),
        description: `Advanced ${villain.current_phase} phase`,
        involved_entities: [villain.name, ...villain.minions],
        success: true,
        consequence: `Progress: ${villain.progress_clock}/${villain.target_clock}`,
      });
      if (villain.memories.length > 50) villain.memories = villain.memories.slice(-50);
    }
    await this._save();
    return events;
  }

  private _getIncrement(phase: string): number {
    const ranges: Record<string, [number, number]> = {
      plotting: [1, 2], preparing: [1, 3], executing: [2, 4], climax: [1, 5],
    };
    const [min, max] = ranges[phase] ?? [1, 2];
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private _advancePhase(villain: VillainAgendaData): Record<string, unknown> | null {
    const phases = ["plotting", "preparing", "executing", "climax"];
    const idx = phases.indexOf(villain.current_phase);
    if (idx >= phases.length - 1) {
      villain.progress_clock = 0;
      return null;
    }
    villain.current_phase = phases[idx + 1]!;
    villain.progress_clock = 0;
    villain.target_clock = Math.floor(villain.target_clock * 1.2);

    return {
      type: "villain_phase_transition",
      villain: villain.name,
      new_phase: villain.current_phase,
      description: `${villain.name} has entered the ${villain.current_phase} phase.`,
      severity: 0.6,
      involved_entities: [villain.name, ...villain.minions],
    };
  }

  private _generateVillainEvent(villain: VillainAgendaData): Record<string, unknown> | null {
    const eventTypes = ["sabotage", "rumour", "minion_attack", "theft", "spy_infiltration"];
    const etype = eventTypes[Math.floor(Math.random() * eventTypes.length)] ?? "sabotage";

    return {
      type: "villain_event",
      villain: villain.name,
      event_type: etype,
      description: `${villain.name} ${etype}.`,
      severity: 0.3 + Math.random() * 0.3,
      involved_entities: [villain.name, ...villain.minions],
    };
  }

  getVillain(name: string): VillainAgendaData | undefined {
    return this._villains.get(name);
  }

  listVillains(): string[] {
    return Array.from(this._villains.keys());
  }

  async getStatus(): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {};
    for (const [name, v] of this._villains) {
      result[name] = {
        phase: v.current_phase,
        progress: `${v.progress_clock}/${v.target_clock}`,
        memories_count: v.memories.length,
        minions: v.minions,
        ultimate_goal: v.ultimate_goal,
      };
    }
    return result;
  }
}
