/**
 * Cognitive pipeline — processes conversation turns with memory integration.
 * Replaces world_core/memory/cognitive_pipeline.py.
 */

import { randomUUID } from "node:crypto";
import type { LLMClient } from "../lib/llm-client";
import { WorldMemoryEntry } from "../models/memory";
import type { WorldMemory, WorldMemoryEntryResult } from "./world-memory";
import { EntityExtractor } from "./entity-extractor";
import { ContradictionDetector } from "./contradiction-detector";
import { PainSignalManager } from "./pain-signals";
import { getLogger } from "../utils/logger";

const log = getLogger("cognitive-pipeline");

export interface PipelineResult {
  extractedFacts: string[];
  entityMemoryIds: string[];
  episodicMemoryIds: string[];
  contradictedEntries: string[];
  context: WorldMemoryEntryResult[];
  painWarnings: Array<{ content: string; score: number; painId: string }>;
  turnId: number;
}

export class CognitivePipeline {
  private _memory: WorldMemory;
  private _llm: LLMClient;
  private _entityExtractor: EntityExtractor;
  private _painMgr: PainSignalManager;
  private _detector: ContradictionDetector;
  private _stats = {
    turnsProcessed: 0,
    factsExtracted: 0,
    entitiesExtracted: 0,
    contradictionsFound: 0,
    warningsRaised: 0,
  };

  constructor(
    memory: WorldMemory,
    llm: LLMClient,
    entityExtractor: EntityExtractor,
    painMgr: PainSignalManager,
    detector: ContradictionDetector,
  ) {
    this._memory = memory;
    this._llm = llm;
    this._entityExtractor = entityExtractor;
    this._painMgr = painMgr;
    this._detector = detector;
  }

  async processTurn(
    userMessage: string,
    assistantResponse: string,
    turnId: number,
    sessionId?: string,
  ): Promise<PipelineResult> {
    this._stats.turnsProcessed++;
    const combined = `User: ${userMessage}\nAssistant: ${assistantResponse}`;

    // Step 1: Extract facts
    const facts = await this._extractFacts(combined);
    this._stats.factsExtracted += facts.length;

    // Step 2: Store episodic memories
    const episodicIds: string[] = [];
    for (const fact of facts) {
      const entry = new WorldMemoryEntry({
        id: randomUUID(),
        content: fact,
        timestamp: new Date().toISOString(),
        source_type: "turn",
        source_id: `turn_${turnId}`,
        memory_type: "episodic",
        importance: 0.6,
        metadata: { story_relevance: 0.5, importance: 0.6 },
      });
      const id = await this._memory.addMemory(entry);
      episodicIds.push(id);
    }

    // Step 3: Extract entities
    const entityEntries = await this._entityExtractor.extractFromText(combined);
    this._stats.entitiesExtracted += entityEntries.length;

    const entityMemoryIds: string[] = [];
    for (const ent of entityEntries) {
      const entry = new WorldMemoryEntry({
        id: randomUUID(),
        content: `${ent.name} (${ent.type}): ${JSON.stringify(ent.attributes)}`,
        timestamp: new Date().toISOString(),
        source_type: "entity",
        source_id: ent.canonical,
        memory_type: "entity",
        importance: 0.4,
        entity_uid: ent.canonical,
      });
      const id = await this._memory.addMemory(entry);
      entityMemoryIds.push(id);
    }

    // Step 4: Check contradictions
    const contradictedIds: string[] = [];
    for (const eid of episodicIds) {
      const entry = this._memory.activeEntries.get(eid);
      if (entry) {
        const results = await this._detector.checkAndHandle(entry.content, []);
        contradictedIds.push(...results.map((r) => r.contradictedId));
        this._stats.contradictionsFound += results.length;
      }
    }

    // Step 5: Retrieve context
    const lastSeen = sessionId ? this._memory.getLastSeen(sessionId) : undefined;
    const context = await this._memory.retrieve({
      query: userMessage,
      topK: 15,
      sessionId,
      lastSeen,
    });

    // Step 6: Check pain warnings
    const warnings = await this._painMgr.getWarnings(userMessage);
    this._stats.warningsRaised += warnings.length;

    // Step 7: Update access counts
    for (const r of context.slice(0, 5)) {
      await this._memory.updateAccess(r.id);
    }

    return {
      extractedFacts: facts,
      entityMemoryIds,
      episodicMemoryIds: episodicIds,
      contradictedEntries: contradictedIds,
      context,
      painWarnings: warnings,
      turnId,
    };
  }

  async getContextForResponse(userMessage: string): Promise<{ warnings: string[]; facts: string[] }> {
    const warnings = await this._painMgr.getWarnings(userMessage, 3);
    return {
      warnings: warnings.map((w) => w.content),
      facts: [],
    };
  }

  private async _extractFacts(text: string): Promise<string[]> {
    const prompt = `Extract important facts from this conversation turn. Return a JSON array of strings, each a concise fact.
Focus on: user preferences, decisions, corrections, knowledge updates, entity attributes, and significant events.

Conversation: ${text}

Facts (JSON array):`;

    try {
      const result = await this._llm.generateJson(prompt, { temperature: 0.3 });
      return Array.isArray(result) ? result.filter((r): r is string => typeof r === "string") : [];
    } catch (err) {
      log.debug({ err }, "Failed to extract facts from conversation");
      return [];
    }
  }

  getStatistics() {
    return { ...this._stats };
  }
}
