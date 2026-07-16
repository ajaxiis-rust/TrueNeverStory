import { getConfig } from "../config/env";
import { getLogger } from "../utils/logger";
import { SQLiteStore } from "../lib/sqlite-store";

const log = getLogger("vector-index");

export interface SearchResult {
  id: string;
  score: number;
  payload?: Record<string, unknown>;
}

export class VectorIndex {
  private _store: SQLiteStore;
  private _nextId = 0;

  constructor(dbPath?: string) {
    const cfg = getConfig();
    const resolvedPath = dbPath || cfg.SQLITE_DB_PATH || cfg.WORLDS_ROOT;
    this._store = new SQLiteStore(resolvedPath);
    log.info({ path: resolvedPath }, "VectorIndex: SQLite backend initialized");
  }

  async add(vector: number[], metadata: Record<string, unknown> = {}): Promise<number> {
    const id = this._nextId++;
    const uid = String(id);
    const entityUid = metadata.id as string | undefined;
    const source = (metadata.source as string) || "memory";

    if (entityUid) {
      this._store.upsertEntity({
        uid: entityUid,
        name: entityUid,
        description: (metadata.content as string) || "",
      });
      this._store.storeEmbedding(entityUid, new Float32Array(vector), source);
    } else {
      this._store.upsertEntity({ uid, name: uid });
      this._store.storeEmbedding(uid, new Float32Array(vector), source);
    }

    return id;
  }

  async search(queryVector: number[], topK = 10): Promise<SearchResult[]> {
    const results = this._store.searchDense(new Float32Array(queryVector), topK);
    return results.map(r => ({
      id: r.entityUid ?? "",
      score: r.score,
    }));
  }

  delete(id: number): void {
    const uid = String(id);
    this._store.deleteEmbedding(uid);
    log.debug({ id: uid }, "VectorIndex.delete: removed embedding");
  }

  get size(): number {
    return this._store.embeddingCount();
  }

  async rebuild(): Promise<void> {
    const before = this._store.embeddingCount();
    this._store.vacuum();
    const after = this._store.embeddingCount();
    log.info({ before, after }, "VectorIndex: rebuilt (VACUUM)");
  }

  fragmentationRatio(): number {
    return this._store.embeddingFragmentationRatio();
  }

  get store(): SQLiteStore {
    return this._store;
  }

  close(): void {
    this._store.close();
  }
}
