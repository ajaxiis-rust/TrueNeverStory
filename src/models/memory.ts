/**
 * Memory system models (replaces world_core/memory/config.py + models).
 */

// ── Scoring Weights ──

export interface ScoringWeights {
  importance: number;
  recency: number;
  access: number;
  emotion: number;
  relevance: number;
}

// ── Memory Config ──

export interface MemoryConfigData {
  retention_months?: number;
  active_partitions_count?: number;
  batch_embed_size?: number;
  flush_interval_seconds?: number;
  write_buffer_max_size?: number;
  optimizer_interval_hours?: number;
  scoring_weights?: ScoringWeights;
  half_life_days?: number;
  min_keep_score?: number;
  min_keep_days?: number;
  cluster_similarity_threshold?: number;
  cluster_min_size?: number;
  merge_cluster_min_size?: number;
  enable_llm_merge?: boolean;
  embedding_dim?: number;
  faiss_rebuild_fragmentation_threshold?: number;
}

export class MemoryConfig {
  retentionMonths: number;
  activePartitionsCount: number;
  batchEmbedSize: number;
  flushIntervalSeconds: number;
  writeBufferMaxSize: number;
  optimizerIntervalHours: number;
  scoringWeights: ScoringWeights;
  halfLifeDays: number;
  minKeepScore: number;
  minKeepDays: number;
  clusterSimilarityThreshold: number;
  clusterMinSize: number;
  mergeClusterMinSize: number;
  enableLlmMerge: boolean;
  embeddingDimension: number;
  faissRebuildFragmentationThreshold: number;

  constructor(data: MemoryConfigData = {}) {
    this.retentionMonths = data.retention_months ?? 6;
    this.activePartitionsCount = data.active_partitions_count ?? 3;
    this.batchEmbedSize = data.batch_embed_size ?? 50;
    this.flushIntervalSeconds = data.flush_interval_seconds ?? 5.0;
    this.writeBufferMaxSize = data.write_buffer_max_size ?? 100;
    this.optimizerIntervalHours = data.optimizer_interval_hours ?? 1;
    this.scoringWeights = data.scoring_weights ?? {
      importance: 0.35,
      recency: 0.25,
      access: 0.15,
      emotion: 0.10,
      relevance: 0.15,
    };
    this.halfLifeDays = data.half_life_days ?? 7.0;
    this.minKeepScore = data.min_keep_score ?? 0.15;
    this.minKeepDays = data.min_keep_days ?? 30;
    this.clusterSimilarityThreshold = data.cluster_similarity_threshold ?? 0.85;
    this.clusterMinSize = data.cluster_min_size ?? 3;
    this.mergeClusterMinSize = data.merge_cluster_min_size ?? 5;
    this.enableLlmMerge = data.enable_llm_merge ?? true;
    this.embeddingDimension = data.embedding_dim ?? 384;
    this.faissRebuildFragmentationThreshold = data.faiss_rebuild_fragmentation_threshold ?? 0.2;
  }
}

export const DEFAULT_CONFIG = new MemoryConfig();

// ── Memory Metadata ──

export interface MemoryMetadataData {
  access_count?: number;
  last_accessed?: string;
  emotional_valence?: number;
  story_relevance?: number;
  cluster_id?: string | null;
  cluster_representative?: boolean;
  immutable?: boolean;
  importance?: number;
}

export class MemoryMetadata {
  accessCount: number;
  lastAccessed: Date;
  emotionalValence: number;
  storyRelevance: number;
  clusterId: string | null;
  clusterRepresentative: boolean;
  immutable: boolean;
  importance: number;

  constructor(data: MemoryMetadataData = {}) {
    this.accessCount = data.access_count ?? 0;
    this.lastAccessed = data.last_accessed ? new Date(data.last_accessed) : new Date();
    this.emotionalValence = data.emotional_valence ?? 0.0;
    this.storyRelevance = data.story_relevance ?? 0.5;
    this.clusterId = data.cluster_id ?? null;
    this.clusterRepresentative = data.cluster_representative ?? false;
    this.immutable = data.immutable ?? false;
    this.importance = data.importance ?? 0.5;
  }

  get(key: string): unknown {
    return (this as Record<string, unknown>)[key];
  }

  toDict(): MemoryMetadataData {
    return {
      access_count: this.accessCount,
      last_accessed: this.lastAccessed.toISOString(),
      emotional_valence: this.emotionalValence,
      story_relevance: this.storyRelevance,
      cluster_id: this.clusterId,
      cluster_representative: this.clusterRepresentative,
      immutable: this.immutable,
      importance: this.importance,
    };
  }

  static fromDict(d: Record<string, unknown>): MemoryMetadata {
    return new MemoryMetadata({
      access_count: d.access_count as number,
      last_accessed: d.last_accessed as string,
      emotional_valence: d.emotional_valence as number,
      story_relevance: d.story_relevance as number,
      cluster_id: d.cluster_id as string | null,
      cluster_representative: d.cluster_representative as boolean,
      immutable: d.immutable as boolean,
      importance: d.importance as number,
    });
  }
}

// ── World Memory Entry ──

export type MemoryType = "episodic" | "semantic" | "entity" | "procedural" | "archival";

export interface WorldMemoryEntryData {
  id: string;
  content: string;
  timestamp: string;
  source_type: string;
  source_id: string;
  importance?: number;
  tags?: string[];
  node_uid?: string | null;
  version?: number;
  parent_id?: string | null;
  embedding?: number[] | null;
  metadata?: MemoryMetadataData;
  memory_type?: MemoryType;
  entity_uid?: string | null;
  linked_entity_uids?: string[];
  supersedes?: string[];
  superseded_by?: string[];
  pain_keywords?: string[];
  salience?: number;
}

export class WorldMemoryEntry {
  id: string;
  content: string;
  timestamp: Date;
  sourceType: string;
  sourceId: string;
  importance: number;
  tags: string[];
  nodeUid: string | null;
  version: number;
  parentId: string | null;
  embedding: number[] | null;
  metadata: MemoryMetadata;
  memoryType: MemoryType;
  entityUid: string | null;
  linkedEntityUids: string[];
  supersedes: string[];
  supersededBy: string[];
  painKeywords: string[];
  salience: number;
  decayedSalience: number;
  needsClustering: boolean;

  constructor(data: WorldMemoryEntryData) {
    this.id = data.id;
    this.content = data.content;
    this.timestamp = new Date(data.timestamp);
    this.sourceType = data.source_type;
    this.sourceId = data.source_id;
    this.importance = data.importance ?? 0.5;
    this.tags = data.tags ?? [];
    this.nodeUid = data.node_uid ?? null;
    this.version = data.version ?? 1;
    this.parentId = data.parent_id ?? null;
    this.embedding = data.embedding ?? null;
    this.metadata = data.metadata ? new MemoryMetadata(data.metadata) : new MemoryMetadata({ importance: this.importance });
    this.memoryType = data.memory_type ?? "episodic";
    this.entityUid = data.entity_uid ?? null;
    this.linkedEntityUids = data.linked_entity_uids ?? [];
    this.supersedes = data.supersedes ?? [];
    this.supersededBy = data.superseded_by ?? [];
    this.painKeywords = data.pain_keywords ?? [];
    this.salience = data.salience ?? 0.5;
    this.decayedSalience = this.salience;
    this.needsClustering = true;
  }

  toDict(): WorldMemoryEntryData {
    return {
      id: this.id,
      content: this.content,
      timestamp: this.timestamp.toISOString(),
      source_type: this.sourceType,
      source_id: this.sourceId,
      importance: this.importance,
      tags: this.tags,
      node_uid: this.nodeUid,
      version: this.version,
      parent_id: this.parentId,
      embedding: this.embedding,
      metadata: this.metadata.toDict(),
      memory_type: this.memoryType,
      entity_uid: this.entityUid,
      linked_entity_uids: this.linkedEntityUids,
      supersedes: this.supersedes,
      superseded_by: this.supersededBy,
      pain_keywords: this.painKeywords,
      salience: this.salience,
    };
  }

  static fromDict(d: Record<string, unknown>): WorldMemoryEntry {
    return new WorldMemoryEntry({
      id: d.id as string,
      content: d.content as string,
      timestamp: d.timestamp as string,
      source_type: d.source_type as string,
      source_id: d.source_id as string,
      importance: d.importance as number,
      tags: d.tags as string[],
      node_uid: d.node_uid as string | null,
      version: d.version as number,
      parent_id: d.parent_id as string | null,
      embedding: d.embedding as number[] | null,
      metadata: d.metadata as MemoryMetadataData,
      memory_type: d.memory_type as MemoryType,
      entity_uid: d.entity_uid as string | null,
      linked_entity_uids: d.linked_entity_uids as string[],
      supersedes: d.supersedes as string[],
      superseded_by: d.superseded_by as string[],
      pain_keywords: d.pain_keywords as string[],
      salience: d.salience as number,
    });
  }
}

// ── Session Delta Tracker ──

export class SessionDeltaTracker {
  private _lastSeenTimestamp: Map<string, Date> = new Map();
  private _lastRetrievedIds: Map<string, Set<string>> = new Map();

  update(sessionId: string, retrievedIds: Set<string>, currentTime: Date): void {
    this._lastSeenTimestamp.set(sessionId, currentTime);
    this._lastRetrievedIds.set(sessionId, retrievedIds);
  }

  getLastSeen(sessionId: string): Date | undefined {
    return this._lastSeenTimestamp.get(sessionId);
  }

  getDelta(sessionId: string, currentIds: Set<string>): { newIds: Set<string>; updatedIds: Set<string>; removedIds: Set<string> } {
    const lastIds = this._lastRetrievedIds.get(sessionId) ?? new Set();
    return {
      newIds: new Set([...currentIds].filter((id) => !lastIds.has(id))),
      updatedIds: new Set(),
      removedIds: new Set([...lastIds].filter((id) => !currentIds.has(id))),
    };
  }
}

// ── Speculative Cache ──

interface SpeculativeCacheEntry {
  value: Array<Record<string, unknown>>;
  timestamp: Date;
}

export class SpeculativeCache {
  private _cache: Map<string, SpeculativeCacheEntry> = new Map();
  private _maxSize: number;
  private _ttlMs: number;

  constructor(maxSize = 100, ttlSeconds = 300) {
    this._maxSize = maxSize;
    this._ttlMs = ttlSeconds * 1000;
  }

  get(key: string): Array<Record<string, unknown>> | null {
    const entry = this._cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp.getTime() >= this._ttlMs) {
      this._cache.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key: string, value: Array<Record<string, unknown>>): void {
    if (this._cache.size >= this._maxSize) {
      const firstKey = this._cache.keys().next().value;
      if (firstKey !== undefined) this._cache.delete(firstKey);
    }
    this._cache.set(key, { value, timestamp: new Date() });
  }

  invalidate(key: string): void {
    this._cache.delete(key);
  }
}
