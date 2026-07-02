/**
 * WorldBuilder — layered world building orchestrator.
 * Replaces world_builder/builder.py.
 *
 * Phases: create_world → build_L1 → build_L2 → build_L3 → build_relationships
 */

import type { LLMClient } from "../lib/llm-client";
import type { LLMQueue } from "../lib/llm-queue";
import type { UnifiedEntityStore } from "../store/entity-store";
import type { EventBus } from "../lib/event-bus";
import { EventTopic } from "../lib/event-bus";
import { TaskPriority } from "../models/director";
import { LayeredProfile, EntityNode, type LayerDict } from "../models/entity";
import { PromptBuilder } from "./prompt-builder";
import { atomicWriteJson, readJsonFileSync } from "../lib/atomic-io";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { getLogger } from "../utils/logger";
import { NPCGenerator } from "./npc-generator";

const log = getLogger("world-builder");

function safeNames(nodes: EntityNode[]): string {
  return nodes.map((n) => n.name).join(", ");
}

export interface WorldBuilderDeps {
  llmQueue: LLMQueue;
  entityStore: UnifiedEntityStore;
  eventBus: EventBus;
  dbPath: string;
}

export class WorldBuilder {
  private _llmQueue: LLMQueue;
  private _entityStore: UnifiedEntityStore;
  private _eventBus: EventBus;
  private _dbPath: string;
  worldFrame: Record<string, unknown> | null = null;

  constructor(deps: WorldBuilderDeps) {
    this._llmQueue = deps.llmQueue;
    this._entityStore = deps.entityStore;
    this._eventBus = deps.eventBus;
    this._dbPath = deps.dbPath;
  }

  async loadWorldFrame(): Promise<Record<string, unknown>> {
    const path = join(this._dbPath, "world_frame.json");
    if (!existsSync(path)) throw new Error("World frame not found");
    this.worldFrame = readJsonFileSync<Record<string, unknown>>(path);
    if (!this.worldFrame) throw new Error("Failed to load world frame");
    return this.worldFrame;
  }

  async createWorld(): Promise<Record<string, unknown>> {
    const prompt = PromptBuilder.WORLD_FRAME_PROMPT;
    try {
      this.worldFrame = await this._llmQueue.generateJson(prompt, TaskPriority.NORMAL, 0.8);
    } catch (err) {
      throw new Error(`Failed to generate world frame: ${err}`);
    }

    this._sanitiseWorldFrame();
    await this._buildL1();
    await this._saveWorldFrame();

    await this._eventBus.publishSimple(
      EventTopic.WORLD_CREATED,
      { world_name: this.worldFrame.world_name ?? "" },
      "world_builder",
    );
    return this.worldFrame;
  }

  private _sanitiseWorldFrame(): void {
    if (!this.worldFrame) return;
    for (const key of ["races", "factions", "characters", "locations", "items", "historical_events", "world_rules"]) {
      const lst = this.worldFrame[key] as unknown[];
      if (!Array.isArray(lst)) {
        this.worldFrame[key] = [];
        continue;
      }
      for (let i = 0; i < lst.length; i++) {
        const item = lst[i];
        if (typeof item === "string") {
          lst[i] = { name: item };
        } else if (typeof item === "object" && item !== null && !("name" in item)) {
          (item as Record<string, unknown>).name = `Unnamed_${key}_${i}`;
        }
      }
    }
  }

  private _getRulesText(): string {
    if (!this.worldFrame) return "";
    return ((this.worldFrame.world_rules as Array<Record<string, unknown>>) ?? [])
      .map((r) => `- ${r.name}: ${r.description}`)
      .join("\n");
  }

  async buildL1(): Promise<void> {
    await this._buildL1();
  }

  private async _buildL1(): Promise<void> {
    if (!this.worldFrame) return;
    log.info("Building Level 1 (classification)...");

    const storeL1 = async (
      name: string,
      etype: string,
      group: string,
      summary: string,
      tags: string[] = [],
    ) => {
      const profile = new LayeredProfile(
        { name, type: etype, group, summary, tags, relationships: [] },
        {},
        {},
      );
      const node = new EntityNode({
        uid: `${etype}:${name}`,
        name,
        entity_type: etype,
        profile: profile.toDict(),
        group_id: group,
      });
      this._entityStore.add(node);
    };

    const arrays: Array<[string, string, string, (item: Record<string, unknown>) => string, (item: Record<string, unknown>) => string[]]> = [
      ["races", "Race", "races", (r) => (r.traits as string) ?? "", () => []],
      ["factions", "Faction", "factions", (f) => (f.goal as string) ?? "", (f) => [f.type as string ?? ""]],
      ["characters", "Character", "characters", (c) => ((c.personality as string) ?? "").slice(0, 100), (c) => [c.race as string ?? "", c.role as string ?? ""]],
      ["locations", "Location", "locations", (l) => ((l.description as string) ?? "").slice(0, 100), (l) => [l.type as string ?? ""]],
      ["items", "Item", "items", (i) => ((i.power as string) ?? "").slice(0, 100), (i) => [i.type as string ?? ""]],
      ["historical_events", "Event", "events", (e) => ((e.description as string) ?? "").slice(0, 100), () => []],
      ["world_rules", "WorldRule", "world_rules", (r) => ((r.description as string) ?? "").slice(0, 200), (r) => [r.category as string ?? ""]],
    ];

    for (const [key, etype, group, getSummary, getTags] of arrays) {
      const items = (this.worldFrame[key] as Record<string, unknown>[]) ?? [];
      for (const item of items) {
        const name = (item.name as string) ?? "Unknown";
        await storeL1(name, etype, group, getSummary(item), getTags(item));
      }
    }

    log.info({ count: this._entityStore.count() }, "L1 built");
  }

  async buildL2(): Promise<void> {
    if (!this.worldFrame) return;
    log.info("Building Level 2 (details)...");

    const rulesSummary = this._getRulesText();
    const allNodes = this._entityStore.allNodes();
    const existingNames = safeNames(allNodes);

    for (const node of allNodes) {
      if (node.profile.l2 && Object.keys(node.profile.l2).length > 0) continue;

      try {
        const l2 = await this._expandL2(node, rulesSummary, existingNames);
        this._entityStore.updateEntityLevel(node.uid, "l2", l2);
        log.info({ type: node.entityType, name: node.name }, "L2 generated");
      } catch (err) {
        log.error({ err, name: node.name }, "L2 generation failed");
      }
    }

    log.info("L2 build complete");
  }

  private async _expandL2(node: EntityNode, rulesSummary: string, existingNames: string): Promise<LayerDict> {
    const prompt = PromptBuilder.buildEntityL2Prompt(
      node.entityType,
      JSON.stringify(node.profile.l1),
      rulesSummary,
      existingNames,
    );
    try {
      return await this._llmQueue.generateJson(prompt, TaskPriority.NORMAL, 0.7);
    } catch {
      return {};
    }
  }

  async buildRelationships(): Promise<void> {
    if (!this.worldFrame) return;
    log.info("Building relationships...");

    const allNodes = this._entityStore.allNodes();
    const entityDescriptions = allNodes.map(
      (n) => `- ${n.uid} (${n.entityType}): ${n.profile.summary}`,
    ).join("\n");

    const prompt = PromptBuilder.buildRelationshipPrompt(entityDescriptions);

    try {
      const response = await this._llmQueue.generateJson(prompt, TaskPriority.NORMAL, 0.7);
      const rels = Array.isArray(response) ? response : [];
      for (const rel of rels) {
        const srcUid = rel.source as string;
        const tgtUid = rel.target as string;
        const relType = (rel.type as string) ?? "related";
        const srcNode = this._entityStore.get(srcUid);
        const tgtNode = this._entityStore.get(tgtUid);
        if (srcNode && tgtNode) {
          srcNode.profile.relationships.push({ target: tgtUid, type: relType });
        }
      }
      await this._eventBus.publishSimple(
        EventTopic.RELATIONSHIP_ADDED,
        { count: rels.length },
        "world_builder",
      );
      log.info({ count: rels.length }, "Relationships built");
    } catch (err) {
      log.error({ err }, "Relationship generation failed");
    }
  }

  private async _saveWorldFrame(): Promise<void> {
    if (this.worldFrame) {
      await atomicWriteJson(join(this._dbPath, "world_frame.json"), this.worldFrame);
    }
  }

  async addNPC(factionOrRace: string): Promise<EntityNode> {
    if (!this.worldFrame) throw new Error("World must be created first");

    const generator = new NPCGenerator({
      llmQueue: this._llmQueue,
      entityStore: this._entityStore,
      eventBus: this._eventBus,
      worldFrame: this.worldFrame,
    });

    const result = await generator.generate(factionOrRace);

    (this.worldFrame.characters as Record<string, unknown>[]).push({ name: result.name });
    await this._saveWorldFrame();

    return result.node;
  }
}
