/**
 * WorldMemory — main memory class integrating all memory subsystems.
 * Replaces world_core/memory/world_memory.py.
 */

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { LLMClient } from "../lib/llm-client";
import {
  MemoryConfig,
  DEFAULT_CONFIG,
  WorldMemoryEntry,
  type WorldMemoryEntryData,
  type MemoryMetadataData,
  SessionDeltaTracker,
  SpeculativeCache,
} from "../models/memory";
import { MemoryScoringEngine } from "./scoring";
import { VectorIndex } from "./faiss-index";
import { EmbeddingQueue } from "./embedding-queue";
import { MemoryPartitionManager } from "./partition";
import { SQLiteStore } from "../lib/sqlite-store";
import { getLogger } from "../utils/logger";

const log = getLogger("world-memory");

const FAISS_REBUILD_THRESHOLD = 200;

export interface WorldMemoryEntryResult {
  id: string;
  content: string;
  source_type: string;
  source: string;
  timestamp: string;
  relevance: number;
  importance: number;
  tags: string[];
  memory_type: string;
}

export class WorldMemory {
  private _storagePath: string;
  private _llm: LLMClient;
  private _config: MemoryConfig;
  private _activeEntries: Map<string, WorldMemoryEntry> = new Map();
  private _scorer: MemoryScoringEngine;
  private _vectorIndex: VectorIndex;
  private _embeddingQueue: EmbeddingQueue;
  private _partitionManager: MemoryPartitionManager;
  private _sessionDelta: SessionDeltaTracker;
  private _speculativeCache: SpeculativeCache;
  private _broadcastCallback: ((entry: WorldMemoryEntry) => Promise<void>) | null = null;
  private _sqliteStore: SQLiteStore | null = null;

  private _sourceTypeToIds: Map<string, Set<string>> = new Map();
  private _sourceIdToIds: Map<string, Set<string>> = new Map();
  private _newEntriesSinceRebuild = 0;

  constructor(storagePath: string, llm: LLMClient, config?: MemoryConfig) {
    this._storagePath = storagePath;
    this._llm = llm;
    this._config = config ?? DEFAULT_CONFIG;

    if (!existsSync(storagePath)) mkdirSync(storagePath, { recursive: true });

    this._scorer = new MemoryScoringEngine(
      this._config.scoringWeights,
      this._config.halfLifeDays,
    );
    this._vectorIndex = new VectorIndex(storagePath);
    this._embeddingQueue = new EmbeddingQueue(
      llm,
      this._config.batchEmbedSize,
      this._config.flushIntervalSeconds * 1000,
      this._config.embeddingDimension,
    );
    this._partitionManager = new MemoryPartitionManager(
      join(storagePath, "partitions"),
      this._config.retentionMonths,
      this._config.activePartitionsCount,
    );
    this._sessionDelta = new SessionDeltaTracker();
    this._speculativeCache = new SpeculativeCache();
    this._sqliteStore = this._vectorIndex.store;
  }

  get activeEntries(): Map<string, WorldMemoryEntry> {
    return this._activeEntries;
  }

  get partitionMgr(): MemoryPartitionManager {
    return this._partitionManager;
  }

  get llm(): LLMClient {
    return this._llm;
  }

  get config(): MemoryConfig {
    return this._config;
  }

  get faissIndex(): VectorIndex {
    return this._vectorIndex;
  }

  get sqliteStore(): SQLiteStore | null {
    return this._sqliteStore;
  }

  async start(): Promise<void> {
    await this._loadActiveEntries();
    await this._embeddingQueue.start();
    log.info("WorldMemory started");
  }

  async stop(): Promise<void> {
    await this._embeddingQueue.stop();
    log.info("WorldMemory stopped");
  }

  setBroadcastCallback(callback: (entry: WorldMemoryEntry) => Promise<void>): void {
    this._broadcastCallback = callback;
  }

  private async _loadActiveEntries(): Promise<void> {
    try {
      const entries = await this._partitionManager.getActiveEntries();
      for (const eDict of entries) {
        const entry = WorldMemoryEntry.fromDict(eDict);
        this._activeEntries.set(entry.id, entry);
        if (entry.embedding && entry.embedding.length > 0) {
          await this._vectorIndex.add(entry.embedding, { id: entry.id, content: entry.content });
        }
        this._addToInvertedIndex(entry);
      }
      log.info({ count: this._activeEntries.size }, "Loaded active entries from partitions");
    } catch (err) {
      log.warn({ err }, "Failed to load active entries");
    }
  }

  private _addToInvertedIndex(entry: WorldMemoryEntry): void {
    const stList = this._sourceTypeToIds.get(entry.sourceType) ?? new Set();
    stList.add(entry.id);
    this._sourceTypeToIds.set(entry.sourceType, stList);

    const srcList = this._sourceIdToIds.get(entry.sourceId) ?? new Set();
    srcList.add(entry.id);
    this._sourceIdToIds.set(entry.sourceId, srcList);
  }

  private _removeFromInvertedIndex(entry: WorldMemoryEntry): void {
    this._sourceTypeToIds.get(entry.sourceType)?.delete(entry.id);
    this._sourceIdToIds.get(entry.sourceId)?.delete(entry.id);
  }

  // ── Public API ──

  async addMemory(entry: WorldMemoryEntry | Partial<WorldMemoryEntryData>): Promise<string> {
    let fullEntry: WorldMemoryEntry;
    if (entry instanceof WorldMemoryEntry) {
      fullEntry = entry;
    } else {
      fullEntry = new WorldMemoryEntry({
        id: entry.id ?? randomUUID(),
        content: entry.content ?? "",
        timestamp: entry.timestamp ?? new Date().toISOString(),
        source_type: entry.source_type ?? "episodic",
        source_id: entry.source_id ?? "",
        importance: entry.importance ?? 0.5,
        tags: entry.tags ?? [],
        embedding: entry.embedding ?? undefined,
        version: entry.version ?? 1,
        memory_type: entry.memory_type,
        entity_uid: entry.entity_uid,
        linked_entity_uids: entry.linked_entity_uids,
      });
    }

    if (!fullEntry.embedding || fullEntry.embedding.length === 0) {
      try {
        fullEntry.embedding = await this._embeddingQueue.embed(fullEntry.content);
      } catch (err) {
        log.warn({ err }, "Failed to generate embedding");
      }
    }

    if (fullEntry.embedding && fullEntry.embedding.length > 0) {
      await this._vectorIndex.add(fullEntry.embedding, { id: fullEntry.id, content: fullEntry.content });
      this._newEntriesSinceRebuild++;
      if (this._newEntriesSinceRebuild >= FAISS_REBUILD_THRESHOLD) {
        await this._vectorIndex.rebuild();
        this._newEntriesSinceRebuild = 0;
      }
    }

    if (this._sqliteStore && fullEntry.embedding && fullEntry.embedding.length > 0) {
      this._sqliteStore.upsertEntity({
        uid: fullEntry.id,
        name: fullEntry.sourceId || fullEntry.sourceType,
        description: fullEntry.content,
        tags: JSON.stringify(fullEntry.tags),
      });
      this._sqliteStore.storeEmbedding(fullEntry.id, new Float32Array(fullEntry.embedding), fullEntry.sourceType);
    }

    this._activeEntries.set(fullEntry.id, fullEntry);
    this._addToInvertedIndex(fullEntry);

    await this._partitionManager.saveEntry(fullEntry.toDict() as unknown as Record<string, unknown>);
    this._speculativeCache.invalidate(fullEntry.sourceType);

    if (this._broadcastCallback) {
      try { await this._broadcastCallback(fullEntry); } catch { /* */ }
    }

    return fullEntry.id;
  }

  async deleteEntry(entryId: string): Promise<void> {
    const entry = this._activeEntries.get(entryId);
    if (!entry) return;
    this._removeFromInvertedIndex(entry);
    this._activeEntries.delete(entryId);
    await this._partitionManager.removeEntry(entryId);
  }

  async addEvent(params: { eventDescription: string; group?: string; importance?: number; metadata?: Record<string, unknown> }): Promise<string> {
    return this.addMemory({
      content: params.eventDescription,
      source_type: "event",
      source_id: params.group ?? "narrative",
      importance: params.importance ?? 0.4,
      tags: [params.group ?? "event"],
    });
  }

  async addLocationVisit(params: { locationUid: string; locationName: string; visitorName: string; importance?: number }): Promise<string> {
    return this.addMemory({
      content: `${params.visitorName} visited ${params.locationName}`,
      source_type: "location",
      source_id: params.locationUid,
      importance: params.importance ?? 0.2,
      tags: ["location_visit", params.locationName],
    });
  }

  async addNpcMemory(npcName: string, content: string, importance = 0.5, tags: string[] = []): Promise<string> {
    return this.addMemory({
      content,
      source_type: "npc",
      source_id: npcName,
      importance,
      tags,
    });
  }

  async addEntityChange(entityUid: string, change: string, entityName?: string, importance = 0.3): Promise<string> {
    return this.addMemory({
      content: change,
      source_type: "entity_change",
      source_id: entityUid,
      importance,
      entity_uid: entityUid,
      tags: entityName ? [entityName] : [],
    });
  }

  // ── Retrieval ──

  async retrieve(params: {
    query: string;
    topK?: number;
    entityFilter?: Set<string>;
    timeWindow?: number;
    minImportance?: number;
    sourceTypeFilter?: Set<string>;
    sessionId?: string;
    lastSeen?: Date;
  }): Promise<WorldMemoryEntryResult[]> {
    const topK = params.topK ?? 10;
    const minImportance = params.minImportance ?? 0;
    const results: WorldMemoryEntryResult[] = [];
    const seenIds = new Set<string>();

    // Pass 1: Tag/ID exact match
    const tagResults = await this._tagSearch(params.query, topK);
    for (const [score, entry] of tagResults) {
      if (!seenIds.has(entry.id)) {
        results.push(this._entryToResult(entry, score));
        seenIds.add(entry.id);
      }
    }

    // Pass 2: Vector similarity
    let queryEmbedding: number[];
    try {
      queryEmbedding = await this._embeddingQueue.embed(params.query);
    } catch {
      const textResults = this._textSearch(params.query, topK, minImportance);
      for (const r of textResults) {
        if (!seenIds.has(r.id)) {
          results.push(r);
          seenIds.add(r.id);
        }
      }
      return this._applyOrdering(results).slice(0, topK);
    }

    const vectorResults = await this._vectorIndex.search(queryEmbedding, topK * 2);
    for (const vr of vectorResults) {
      const entry = this._activeEntries.get(vr.id);
      if (!entry) continue;
      if (entry.importance < minImportance) continue;
      if (params.sourceTypeFilter && !params.sourceTypeFilter.has(entry.sourceType)) continue;

      const days = (Date.now() - entry.timestamp.getTime()) / (24 * 60 * 60 * 1000);
      const recency = Math.exp(-days / this._config.halfLifeDays);
      const finalScore = vr.score * (0.6 + 0.2 * entry.importance + 0.2 * recency);

      if (!seenIds.has(entry.id)) {
        results.push(this._entryToResult(entry, finalScore));
        seenIds.add(entry.id);
      }
    }

    // Pass 3: Graph expansion
    const expanded = this._graphExpansion(results.slice(0, 5));
    for (const [score, entry] of expanded) {
      if (!seenIds.has(entry.id)) {
        results.push(this._entryToResult(entry, score));
        seenIds.add(entry.id);
      }
    }

    // Delta filter
    if (params.sessionId && params.lastSeen) {
      for (const r of results) {
        const ts = new Date(r.timestamp);
        if (ts <= params.lastSeen) {
          seenIds.delete(r.id);
        }
      }
    }

    const ordered = this._applyOrdering(results.filter((r) => seenIds.has(r.id)));

    // Update session tracking
    if (params.sessionId) {
      const retrievedIds = new Set(ordered.slice(0, topK).map((r) => r.id));
      this._sessionDelta.update(params.sessionId, retrievedIds, new Date());
      for (const r of ordered.slice(0, topK)) {
        await this.updateAccess(r.id);
      }
    }

    return ordered.slice(0, topK);
  }

  private async _tagSearch(query: string, topK: number): Promise<Array<[number, WorldMemoryEntry]>> {
    if (query.startsWith("#")) {
      const tag = query.slice(1).toLowerCase();
      const results: Array<[number, WorldMemoryEntry]> = [];
      for (const entry of this._activeEntries.values()) {
        if (entry.tags.some((t) => t.toLowerCase() === tag)) {
          results.push([1.0, entry]);
          if (results.length >= topK) break;
        }
      }
      return results;
    }

    const entry = this._activeEntries.get(query);
    return entry ? [[1.0, entry]] : [];
  }

  private _textSearch(query: string, topK: number, minImportance: number): WorldMemoryEntryResult[] {
    const q = query.toLowerCase();
    const results: WorldMemoryEntryResult[] = [];
    for (const entry of this._activeEntries.values()) {
      if (entry.importance < minImportance) continue;
      if (entry.content.toLowerCase().includes(q)) {
        results.push(this._entryToResult(entry, 1.0));
      }
    }
    return results.slice(0, topK);
  }

  private _graphExpansion(results: WorldMemoryEntryResult[]): Array<[number, WorldMemoryEntry]> {
    const expanded: Array<[number, WorldMemoryEntry]> = [];
    const seenEntityUids = new Set<string>();

    for (const result of results) {
      const entry = this._activeEntries.get(result.id);
      if (!entry) continue;

      const entityUids = [entry.entityUid, ...entry.linkedEntityUids].filter((u): u is string => !!u);

      for (const entityUid of entityUids) {
        if (seenEntityUids.has(entityUid)) continue;
        seenEntityUids.add(entityUid);

        for (const other of this._activeEntries.values()) {
          if (other.id === entry.id) continue;
          if (other.entityUid === entityUid) {
            expanded.push([result.relevance * 0.8, other]);
          }
        }
      }
    }

    return expanded;
  }

  private _applyOrdering(results: WorldMemoryEntryResult[]): WorldMemoryEntryResult[] {
    if (results.length <= 2) return results;
    const sorted = results.sort((a, b) => b.relevance - a.relevance);
    const ordered: WorldMemoryEntryResult[] = [];
    let left = 0, right = sorted.length - 1;
    let takeLeft = true;
    while (left <= right) {
      if (takeLeft) ordered.push(sorted[left]!);
      else ordered.push(sorted[right]!);
      if (takeLeft) left++; else right--;
      takeLeft = !takeLeft;
    }
    return ordered;
  }

  private _entryToResult(entry: WorldMemoryEntry, score: number): WorldMemoryEntryResult {
    return {
      id: entry.id,
      content: entry.content,
      source_type: entry.sourceType,
      source: entry.sourceId,
      timestamp: entry.timestamp.toISOString(),
      relevance: score,
      importance: entry.importance,
      tags: entry.tags,
      memory_type: entry.memoryType,
    };
  }

  async updateAccess(entryId: string): Promise<void> {
    const entry = this._activeEntries.get(entryId);
    if (!entry) return;
    entry.metadata.accessCount++;
    entry.metadata.lastAccessed = new Date();

    const days = (Date.now() - entry.timestamp.getTime()) / (24 * 60 * 60 * 1000);
    const decay = Math.pow(2, -days / this._config.halfLifeDays);
    const accessBoost = Math.log1p(entry.metadata.accessCount) * 0.1;
    entry.decayedSalience = Math.min(1.0, entry.salience * decay + accessBoost);
  }

  getLastSeen(sessionId: string): Date | undefined {
    return this._sessionDelta.getLastSeen(sessionId);
  }

  async getStats(): Promise<Record<string, unknown>> {
    return {
      totalActiveEntries: this._activeEntries.size,
      vectorIndexSize: this._vectorIndex.size,
      partitionCount: await this._partitionManager.getPartitionCount(),
    };
  }

  async getRecentGlobalFacts(limit = 5): Promise<Array<{ fact: string; importance: number; source_type: string; timestamp: string }>> {
    return Array.from(this._activeEntries.values())
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit)
      .map((e) => ({
        fact: e.content.slice(0, 200),
        importance: e.importance,
        source_type: e.sourceType,
        timestamp: e.timestamp.toISOString(),
      }));
  }

  async forgetOldEntries(olderThanDays: number, minImportance: number): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    let removed = 0;
    for (const [id, entry] of this._activeEntries) {
      if (entry.timestamp < cutoff && entry.importance < minImportance) {
        await this.deleteEntry(id);
        removed++;
      }
    }
    return removed;
  }

  async clearOldEntries(): Promise<number> {
    return this.forgetOldEntries(90, 0.1);
  }

  async exportMemories(): Promise<Buffer> {
    const entries = Array.from(this._activeEntries.values()).map((e) => e.toDict());
    return Buffer.from(JSON.stringify(entries, null, 2));
  }

  async importMemories(data: Buffer): Promise<void> {
    const entries = JSON.parse(data.toString()) as WorldMemoryEntryData[];
    for (const entry of entries) {
      await this.addMemory(entry);
    }
  }

  async updateMemory(entryId: string, newContent: string): Promise<string | null> {
    const entry = this._activeEntries.get(entryId);
    if (!entry) return null;
    entry.content = newContent;
    entry.version++;
    const newId = `${entryId}_v${entry.version}`;
    entry.id = newId;
    await this.addMemory(entry);
    return newId;
  }
}
