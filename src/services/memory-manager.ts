/**
 * In-memory conversation history manager.
 * Replaces world_engine/memory_manager.py.
 */

import { readJsonFileSync } from "../lib/atomic-io";
import { atomicWriteJson } from "../lib/atomic-io";
import { existsSync } from "node:fs";
import { getLogger } from "../utils/logger";

const log = getLogger("memory-manager");

interface HistoryEntry {
  user: string;
  assistant: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export class MemoryManager {
  private _storagePath: string;
  private _maxHistory: number;
  private _history: HistoryEntry[] = [];

  constructor(storagePath: string, maxHistory = 20) {
    this._storagePath = storagePath;
    this._maxHistory = maxHistory;
    this._load();
  }

  private _load(): void {
    if (!existsSync(this._storagePath)) return;
    try {
      const data = readJsonFileSync<{ history: HistoryEntry[] }>(this._storagePath);
      if (data?.history) {
        this._history = data.history.slice(-this._maxHistory);
      }
    } catch (err) {
      log.warn({ err }, "Failed to load conversation history");
    }
  }

  private _save(): void {
    atomicWriteJson(this._storagePath, { history: this._history }).catch(() => {});
  }

  addEntry(userInput: string, assistantOutput: string, metadata?: Record<string, unknown>): void {
    this._history.push({
      user: userInput,
      assistant: assistantOutput,
      metadata: metadata ?? {},
      timestamp: new Date().toISOString(),
    });
    if (this._history.length > this._maxHistory) {
      this._history = this._history.slice(-this._maxHistory);
    }
    this._save();
  }

  getRecent(limit = 10): HistoryEntry[] {
    return this._history.slice(-limit);
  }

  clear(): void {
    this._history = [];
    this._save();
  }

  reload(newPath: string): void {
    this._history = [];
    this._storagePath = newPath;
    this._load();
  }
}
