import { SQLiteStore } from "./sqlite-store";
import { getLogger } from "../utils/logger";

const log = getLogger("agent-memory-store");

export interface AgentMemoryEntry {
  content: string;
  role: string;
  importance: number;
  tags: string[];
  timestamp: string;
}

export class AgentMemoryStore {
  private sqlite: SQLiteStore;
  private embeddingEndpoint: string;
  private embeddingDim: number;

  constructor(dbPath: string, embeddingEndpoint: string, embeddingDim = 1024) {
    this.sqlite = new SQLiteStore(dbPath);
    this.embeddingEndpoint = embeddingEndpoint;
    this.embeddingDim = embeddingDim;
  }

  async addMemory(agentId: string, content: string, opts: {
    importance?: number;
    tags?: string[];
    sessionId?: string;
  } = {}): Promise<void> {
    try {
      const vector = await this.getEmbedding(content);
      this.sqlite.addMemory(content, vector, {
        role: agentId,
        importance: opts.importance ?? 0.5,
        tags: JSON.stringify(opts.tags ?? []),
        sessionId: opts.sessionId,
      });
    } catch (err) {
      log.warn({ err, agentId }, "Failed to add agent memory");
    }
  }

  async search(agentId: string, query: string, topK = 5): Promise<string[]> {
    try {
      const queryVec = await this.getEmbedding(query);
      const ftsResults = this.sqlite.searchMemoriesFTS(query, topK * 2);
      const denseResults = this.sqlite.searchMemoriesDense(queryVec, topK * 2);

      const seen = new Set<string>();
      const results: string[] = [];

      for (const r of [...ftsResults, ...denseResults]) {
        if (r.role === agentId && !seen.has(r.content)) {
          seen.add(r.content);
          results.push(r.content);
          if (results.length >= topK) break;
        }
      }

      return results;
    } catch (err) {
      log.warn({ err, agentId }, "Failed to search agent memory");
      return [];
    }
  }

  async getRecentHistory(agentId: string, sessionId: string, limit = 10): Promise<string[]> {
    try {
      const allResults = this.sqlite.searchMemoriesFTS(agentId, limit * 10);
      return allResults
        .filter(r => r.role === agentId && (!sessionId || r.sessionId === sessionId))
        .slice(-limit)
        .map(r => r.content);
    } catch (err) {
      log.warn({ err, agentId }, "Failed to get recent history");
      return [];
    }
  }

  private async getEmbedding(text: string): Promise<Float32Array> {
    const res = await fetch(`${this.embeddingEndpoint}/v1/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "bge-m3", input: text }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      throw new Error(`Embedding API error: ${res.status}`);
    }

    const data = await res.json() as { data: { embedding: number[] }[] };
    return new Float32Array(data.data[0]!.embedding);
  }

  memoryCount(): number {
    return this.sqlite.memoryCount();
  }

  close(): void {
    this.sqlite.close();
  }
}
