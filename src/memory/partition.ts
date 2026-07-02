/**
 * Time-based partition manager for memory storage.
 * Replaces world_core/memory/partition.py.
 */

import { readJsonFileSync, atomicWriteJson } from "../lib/atomic-io";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { getLogger } from "../utils/logger";

const log = getLogger("partition");

interface PartitionEntry {
  id: string;
  timestamp: string;
  [key: string]: unknown;
}

export class MemoryPartitionManager {
  private _basePath: string;
  private _retentionMonths: number;
  private _activeCount: number;
  private _cache: Map<string, PartitionEntry[]> = new Map();

  constructor(basePath: string, retentionMonths = 6, activeCount = 3) {
    this._basePath = basePath;
    this._retentionMonths = retentionMonths;
    this._activeCount = activeCount;
    if (!existsSync(basePath)) mkdirSync(basePath, { recursive: true });
  }

  private _partitionKey(dt: Date): string {
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
  }

  async loadPartition(dt: Date): Promise<PartitionEntry[]> {
    const key = this._partitionKey(dt);
    if (this._cache.has(key)) return this._cache.get(key)!;

    const path = join(this._basePath, `memories_${key}.json`);
    if (existsSync(path)) {
      try {
        const data = readJsonFileSync<PartitionEntry[]>(path) ?? [];
        this._cache.set(key, data);
        return data;
      } catch {
        this._cache.set(key, []);
        return [];
      }
    }
    this._cache.set(key, []);
    return [];
  }

  async saveEntry(entry: Record<string, unknown>): Promise<void> {
    const ts = new Date(entry.timestamp as string);
    const key = this._partitionKey(ts);
    await this.loadPartition(ts);

    const entries = this._cache.get(key)!;
    const idx = entries.findIndex((e) => e.id === entry.id);
    const partitionEntry = entry as unknown as PartitionEntry;
    if (idx !== -1) {
      entries[idx] = partitionEntry;
    } else {
      entries.push(partitionEntry);
    }
    await this._persistPartition(key);
  }

  private async _persistPartition(key: string): Promise<void> {
    const entries = this._cache.get(key);
    if (!entries) return;
    const path = join(this._basePath, `memories_${key}.json`);
    await atomicWriteJson(path, entries);
  }

  async removeEntry(entryId: string): Promise<boolean> {
    for (const [key, entries] of this._cache) {
      const idx = entries.findIndex((e) => e.id === entryId);
      if (idx !== -1) {
        entries.splice(idx, 1);
        await this._persistPartition(key);
        return true;
      }
    }
    return false;
  }

  async getAllEntries(): Promise<PartitionEntry[]> {
    const all: PartitionEntry[] = [];
    for (const entries of this._cache.values()) {
      all.push(...entries);
    }
    return all;
  }

  async getActiveEntries(): Promise<PartitionEntry[]> {
    const now = new Date();
    const all: PartitionEntry[] = [];
    for (let i = 0; i < this._activeCount; i++) {
      const dt = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const entries = await this.loadPartition(dt);
      all.push(...entries);
    }
    return all;
  }

  async archiveOldPartitions(): Promise<number> {
    const now = new Date();
    const cutoff = new Date(now.getFullYear(), now.getMonth() - this._activeCount, 1);
    let archived = 0;

    for (const [key] of this._cache) {
      const [yearStr, monthStr] = key.split("-");
      const year = parseInt(yearStr!, 10);
      const month = parseInt(monthStr!, 10);
      const partDate = new Date(year, month - 1, 1);

      if (partDate < cutoff) {
        this._cache.delete(key);
        archived++;
      }
    }
    return archived;
  }

  async getPartitionCount(): Promise<number> {
    return this._cache.size;
  }
}
