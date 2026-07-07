/**
 * StoryEngine — event generation from story beats + effect application.
 * Replaces world_narrative/story_engine.py.
 */

import type { LLMQueue } from "../lib/llm-queue";
import type { EventBus } from "../lib/event-bus";
import type { UnifiedEntityStore } from "../store/entity-store";
import type { GraphStore } from "./graph-store";
import type { Chronicler } from "./chronicler";
import type { WorldValidator } from "./world-validator";
import type { QuestManager } from "./quest-manager";
import type { SocialSimulator } from "./social-simulator";
import type { WorldClock } from "./world-clock";
import type { NPCRuntime } from "./npc-runtime";
import { EventTopic } from "../lib/event-bus";
import { TaskPriority } from "../models/director";
import { randomUUID } from "node:crypto";
import { getLogger } from "../utils/logger";

const log = getLogger("story-engine");

const EVENT_PROMPT = `You manage a living story world called "{world_name}".
Current story time: {story_time}
Category: {category}
Severity: {severity}
Involved entities: {entities}
Recent timeline:
{timeline}

World rules:
{rules}

Generate a story event (JSON):
{
    "title": "event title",
    "description": "what happens (2-3 sentences)",
    "category": "incident|discovery|conflict|villain_move|npc_event",
    "involved_entities": ["entity1", "entity2"],
    "effects": [
        {"type": "npc_move", "entity": "name", "location": "place"},
        {"type": "relationship_change", "source": "name1", "target": "name2", "delta": 1, "relationship": "knows"},
        {"type": "item_discovery", "item": "item_name", "location": "place"},
        {"type": "add_quest", "quest": {"title": "...", "description": "...", "status": "active"}}
    ]
}
Respond with valid JSON only.`;

export interface StoryEngineDeps {
  llmQueue: LLMQueue;
  entityStore: UnifiedEntityStore;
  graphStore: GraphStore;
  chronicler: Chronicler;
  validator: WorldValidator;
  questMgr: QuestManager;
  socialSim: SocialSimulator;
  clock: WorldClock;
  npcRuntime: NPCRuntime;
  eventBus: EventBus;
  worldName: string;
  worldRules: Array<{ name: string; description: string }>;
  agentId?: string;
}

export class StoryEngine {
  private _llmQueue: LLMQueue;
  private _entityStore: UnifiedEntityStore;
  private _graphStore: GraphStore;
  private _chronicler: Chronicler;
  private _questMgr: QuestManager;
  private _socialSim: SocialSimulator;
  private _clock: WorldClock;
  private _npcRuntime: NPCRuntime;
  private _eventBus: EventBus;
  private _worldName: string;
  private _worldRules: Array<{ name: string; description: string }>;
  private _agentId: string | undefined;

  constructor(deps: StoryEngineDeps) {
    this._llmQueue = deps.llmQueue;
    this._entityStore = deps.entityStore;
    this._graphStore = deps.graphStore;
    this._chronicler = deps.chronicler;
    this._questMgr = deps.questMgr;
    this._socialSim = deps.socialSim;
    this._clock = deps.clock;
    this._npcRuntime = deps.npcRuntime;
    this._eventBus = deps.eventBus;
    this._worldName = deps.worldName;
    this._worldRules = deps.worldRules;
    this._agentId = deps.agentId;
  }

  async generateEvent(
    storyTime: Date,
    involvedEntities: string[],
    category = "incident",
    severity = 0.5,
  ): Promise<Record<string, unknown>> {
    const since = new Date(storyTime.getTime() - 7 * 24 * 60 * 60 * 1000);
    const timeline = await this._chronicler.getTimeline(since, 10);
    const timelineText = timeline.map((e) => `- ${e.description}`).join("\n");
    const rulesText = this._worldRules.map((r) => `- ${r.name}: ${r.description}`).join("\n");

    const prompt = EVENT_PROMPT
      .replace("{world_name}", this._worldName)
      .replace("{story_time}", storyTime.toISOString())
      .replace("{category}", category)
      .replace("{severity}", String(severity))
      .replace("{entities}", involvedEntities.join(", "))
      .replace("{timeline}", timelineText || "No recent events.")
      .replace("{rules}", rulesText || "No world rules defined.");

    try {
      const result = await this._llmQueue.generateJson(prompt, TaskPriority.LOW, 0.8, this._agentId);
      if (!result.involved_entities) {
        result.involved_entities = involvedEntities;
      }
      return result;
    } catch (err) {
      log.warn({ err }, "Event generation failed");
      return {
        title: "Routine incident",
        description: "Nothing remarkable happens.",
        category: "incident",
        involved_entities: involvedEntities,
        effects: [],
      };
    }
  }

  async applyEffects(
    effects: Record<string, unknown>[],
    storyTime: Date,
    involvedEntities?: string[],
  ): Promise<void> {
    for (const eff of effects) {
      const etype = eff.type as string;
      try {
        switch (etype) {
          case "npc_move": {
            const name = eff.entity as string;
            const loc = eff.location as string;
            await this._npcRuntime.move(name, loc, storyTime);
            const node = this._entityStore.getByNameAndType(name, "Character");
            if (node) {
              node.profile.l2.current_location = loc;
              this._entityStore.updateEntityLevel(node.uid, "l2", node.profile.l2);
            }
            await this._chronicler.logEvent(`${name} moved to ${loc}`, storyTime);
            break;
          }
          case "relationship_change": {
            const src = eff.source as string;
            const tgt = eff.target as string;
            const delta = (eff.delta as number) ?? 0;
            const relType = (eff.relationship as string) ?? "knows";
            this._graphStore.addEdge(src, tgt, relType, delta);
            await this._chronicler.logEvent(
              `Relationship ${src}↔${tgt} changed by ${delta} (${relType})`,
              storyTime,
            );
            break;
          }
          case "item_discovery": {
            const itemName = eff.item as string;
            const location = (eff.location as string) ?? "unknown";
            const discoverer = involvedEntities?.[0] ?? "unknown";
            await this._npcRuntime.addItem(discoverer, itemName);
            await this._chronicler.logEvent(
              `${discoverer} discovered ${itemName} at ${location}`,
              storyTime,
            );
            break;
          }
          case "add_quest": {
            const questData = (eff.quest as Record<string, unknown>) ?? {};
            if (questData.title) {
              this._questMgr.addQuest({
                id: (questData.id as string) ?? randomUUID(),
                title: questData.title as string,
                description: (questData.description as string) ?? "",
                giver: (questData.giver as string) ?? involvedEntities?.[0] ?? "Unknown",
                objectives: [],
                status: "active",
                created_at: storyTime.toISOString(),
              });
              await this._chronicler.logEvent(`New quest: ${questData.title}`, storyTime);
            }
            break;
          }
          case "npc_mood": {
            await this._npcRuntime.setMood(eff.entity as string, eff.mood as string);
            break;
          }
          case "npc_health": {
            await this._npcRuntime.adjustHealth(eff.entity as string, eff.delta as number);
            break;
          }
          case "add_goal": {
            await this._npcRuntime.addGoal(eff.entity as string, eff.goal as string);
            break;
          }
          case "record_incident": {
            await this._chronicler.logEvent(eff.label as string, storyTime);
            break;
          }
          case "villain_progress": {
            await this._chronicler.logEvent(
              `Villain ${(eff.villain as string) ?? "unknown"} advanced`,
              storyTime,
            );
            break;
          }
          default:
            log.debug({ etype }, "Unknown effect type");
        }
      } catch (err) {
        log.error({ err, etype }, "Failed to apply effect");
      }
    }
  }

  async tick(
    storyTime: Date,
    involvedEntities?: string[],
    severity = 0.5,
  ): Promise<{ event: Record<string, unknown> | null; nextStoryTime: Date }> {
    await this._clock.tick(10);

    if (Math.random() < 0.2) {
      await this._socialSim.simulateInteraction();
    }

    if (Math.random() < 0.45) {
      const event = await this.generateEvent(
        storyTime,
        involvedEntities ?? [],
        "incident",
        severity,
      );
      await this.applyEffects(
        (event.effects as Record<string, unknown>[]) ?? [],
        storyTime,
        (event.involved_entities as string[]) ?? [],
      );
      await this._chronicler.logEvent(
        (event.description as string) ?? "An event occurred",
        storyTime,
      );
      return { event, nextStoryTime: new Date(storyTime.getTime() + 60 * 60 * 1000) };
    }

    return { event: null, nextStoryTime: new Date(storyTime.getTime() + 30 * 60 * 1000) };
  }
}
