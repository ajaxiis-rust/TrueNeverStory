/**
 * Villain Manager — manages villain agendas with LLM-driven strategic planning.
 * State machine phases: plotting → preparing → executing → climax
 * LLM generates context-aware villain actions based on world state.
 */

import type { LLMQueue } from "../lib/llm-queue";
import type { UnifiedEntityStore } from "../store/entity-store";
import type { Chronicler } from "./chronicler";
import { readJsonFileSync, atomicWriteJson } from "../lib/atomic-io";
import { existsSync } from "node:fs";
import { TaskPriority } from "../models/director";
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

const PHASES = ["plotting", "preparing", "executing", "climax"] as const;

const STRATEGY_PROMPT = `You are the strategic mind of a villain in a fantasy world.
Villain: {name} — {description}
Ultimate goal: {ultimate_goal}
Current phase: {phase} (progress: {progress}/{target})
Minions: {minions}
Recent world events:
{events}
Active entities: {entities}
World rules: {rules}

Based on the current phase, generate a strategic villain action.
Return JSON:
{
  "action": "brief action name",
  "description": "what the villain does (2-3 sentences)",
  "event_type": "sabotage|rumour|minion_attack|theft|spy_infiltration|sabotage|psychological_warfare|alliance_breaking|resource_theft",
  "severity": 0.0-1.0,
  "involved_entities": ["entity names"],
  "success_chance": 0.0-1.0,
  "consequence_if_success": "what happens if this succeeds",
  "consequence_if_fail": "what happens if this fails"
}
Respond with valid JSON only.`;

const PHASE_PROMPT = `The villain "{name}" is transitioning to a new phase: {new_phase}.
Previous phase: {old_phase} (completed {memory_count} actions)
Villain goal: {ultimate_goal}
World state: {world_state}

What does the villain do upon entering this phase? Return a short narrative (1-2 sentences).`;

export class VillainManager {
  private _statePath: string;
  private _villains: Map<string, VillainAgendaData> = new Map();
  private _chronicler: Chronicler | null;
  private _llmQueue: LLMQueue | null;
  private _entityStore: UnifiedEntityStore | null;

  constructor(
    statePath: string,
    chronicler?: Chronicler | null,
    llmQueue?: LLMQueue | null,
    entityStore?: UnifiedEntityStore | null,
  ) {
    this._statePath = statePath;
    this._chronicler = chronicler ?? null;
    this._llmQueue = llmQueue ?? null;
    this._entityStore = entityStore ?? null;
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
        const transition = await this._advancePhase(villain, currentTime);
        if (transition) events.push(transition);
      }

      if (Math.random() < 0.3) {
        const event = await this._generateVillainAction(villain, currentTime);
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
      plotting: [1, 2],
      preparing: [1, 3],
      executing: [2, 4],
      climax: [1, 5],
    };
    const [min, max] = ranges[phase] ?? [1, 2];
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private async _advancePhase(
    villain: VillainAgendaData,
    currentTime: Date,
  ): Promise<Record<string, unknown> | null> {
    const idx = PHASES.indexOf(villain.current_phase as typeof PHASES[number]);
    if (idx >= PHASES.length - 1) {
      villain.progress_clock = 0;
      return null;
    }

    const oldPhase = villain.current_phase;
    villain.current_phase = PHASES[idx + 1]!;
    villain.progress_clock = 0;
    villain.target_clock = Math.floor(villain.target_clock * 1.2);

    let description = `${villain.name} has entered the ${villain.current_phase} phase.`;

    if (this._llmQueue) {
      try {
        const worldState = await this._getWorldContext();
        const prompt = PHASE_PROMPT
          .replace("{name}", villain.name)
          .replace("{new_phase}", villain.current_phase)
          .replace("{old_phase}", oldPhase)
          .replace("{memory_count}", String(villain.memories.length))
          .replace("{ultimate_goal}", villain.ultimate_goal)
          .replace("{world_state}", `Entities:\n${worldState.entities}\n\nRules:\n${worldState.rules}`);

        const llmResponse = await this._llmQueue.generateText(prompt, TaskPriority.NORMAL, 0.7);
        if (llmResponse && llmResponse.trim().length > 10) {
          description = llmResponse.trim();
        }
      } catch (err) {
        log.warn({ err }, "LLM phase transition failed, using default");
      }
    }

    const event: Record<string, unknown> = {
      type: "villain_phase_transition",
      villain: villain.name,
      new_phase: villain.current_phase,
      description,
      severity: 0.6,
      involved_entities: [villain.name, ...villain.minions],
    };

    if (this._chronicler) {
      await this._chronicler.logEvent(
        `Villain ${villain.name} entered ${villain.current_phase} phase`,
        currentTime,
        "villain",
      );
    }

    return event;
  }

  private async _generateVillainAction(
    villain: VillainAgendaData,
    currentTime: Date,
  ): Promise<Record<string, unknown> | null> {
    if (this._llmQueue) {
      try {
        const worldContext = await this._getWorldContext();
        const recentMemories = villain.memories.slice(-5)
          .map(m => `- ${m.description}`)
          .join("\n") || "No recent actions.";

        const prompt = STRATEGY_PROMPT
          .replace("{name}", villain.name)
          .replace("{description}", villain.description)
          .replace("{ultimate_goal}", villain.ultimate_goal)
          .replace("{phase}", villain.current_phase)
          .replace("{progress}", String(villain.progress_clock))
          .replace("{target}", String(villain.target_clock))
          .replace("{minions}", villain.minions.join(", ") || "none")
          .replace("{events}", recentMemories)
          .replace("{entities}", worldContext.entities)
          .replace("{rules}", worldContext.rules);

        const response = await this._llmQueue.generateText(prompt, TaskPriority.HIGH, 0.8);

        const parsed = this._parseJsonResponse(response);
        if (parsed) {
          const event: Record<string, unknown> = {
            type: "villain_action",
            villain: villain.name,
            action: parsed.action,
            description: parsed.description,
            event_type: parsed.event_type,
            severity: parsed.severity ?? 0.5,
            involved_entities: parsed.involved_entities ?? [villain.name],
            success_chance: parsed.success_chance ?? 0.5,
          };

          const success = Math.random() < Number(parsed.success_chance ?? 0.5);
          event.success = success;
          event.consequence = success
            ? (parsed.consequence_if_success ?? "The plan succeeds.")
            : (parsed.consequence_if_fail ?? "The plan is thwarted.");

          villain.memories.push({
            timestamp: currentTime.toISOString(),
            description: `${parsed.action}: ${parsed.description}`,
            involved_entities: (parsed.involved_entities as string[]) ?? [villain.name],
            success,
            consequence: event.consequence as string,
          });

          if (this._chronicler) {
            await this._chronicler.logEvent(
              `Villain ${villain.name}: ${parsed.description}`,
              currentTime,
              "villain",
            );
          }

          return event;
        }
      } catch (err) {
        log.warn({ err }, "LLM villain action failed, using fallback");
      }
    }

    return this._fallbackEvent(villain);
  }

  private _fallbackEvent(villain: VillainAgendaData): Record<string, unknown> {
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

  private async _getWorldContext(): Promise<{ entities: string; rules: string }> {
    const entities = this._entityStore
      ? this._entityStore.allNodes()
          .filter(n => n.entityType === "Character" || n.entityType === "Location")
          .slice(0, 15)
          .map(n => `${n.name} (${n.entityType}): ${n.profile.summary}`)
          .join("\n")
      : "No entity data available.";

    const rules = this._entityStore
      ? this._entityStore.allNodes()
          .filter(n => n.entityType === "WorldRule")
          .map(n => n.profile.summary)
          .join("\n")
      : "No world rules.";

    return { entities, rules };
  }

  private _parseJsonResponse(text: string): Record<string, unknown> | null {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch { /* not json */ }
    return null;
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
