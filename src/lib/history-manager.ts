/**
 * Session history manager — persistent storage of conversation turns.
 * Replaces world_core/history_manager.py.
 */

import { join } from "node:path";
import { existsSync, readdirSync, unlinkSync, mkdirSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { atomicWriteJson, readJsonFileSync } from "./atomic-io";
import { getLogger } from "../utils/logger";

const log = getLogger("history-manager");

export interface ConversationTurnData {
  role: string;
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export class ConversationTurn {
  role: string;
  content: string;
  timestamp: Date;
  metadata: Record<string, unknown>;

  constructor(role: string, content: string, timestamp?: Date, metadata?: Record<string, unknown>) {
    this.role = role;
    this.content = content;
    this.timestamp = timestamp ?? new Date();
    this.metadata = metadata ?? {};
  }

  toDict(): ConversationTurnData {
    return {
      role: this.role,
      content: this.content,
      timestamp: this.timestamp.toISOString(),
      metadata: this.metadata,
    };
  }

  static fromDict(d: ConversationTurnData): ConversationTurn {
    return new ConversationTurn(
      d.role,
      d.content,
      new Date(d.timestamp),
      d.metadata,
    );
  }
}

interface SessionData {
  session_id: string;
  updated_at: string;
  turn_count: number;
  turns: ConversationTurnData[];
}

class SessionHistory {
  private _path: string;
  turns: ConversationTurn[] = [];

  constructor(
    private sessionId: string,
    private storageDir: string,
  ) {
    this._path = join(storageDir, `${sessionId}.json`);
    this._load();
  }

  private _load(): void {
    if (!existsSync(this._path)) return;
    try {
      const data = readJsonFileSync<SessionData>(this._path);
      if (data) {
        this.turns = (data.turns ?? []).map((t) => ConversationTurn.fromDict(t));
      }
    } catch (err) {
      log.error({ err, sessionId: this.sessionId }, "Error loading session");
      this.turns = [];
    }
  }

  async save(): Promise<void> {
    const data: SessionData = {
      session_id: this.sessionId,
      updated_at: new Date().toISOString(),
      turn_count: this.turns.length,
      turns: this.turns.map((t) => t.toDict()),
    };
    await atomicWriteJson(this._path, data);
  }

  addTurn(role: string, content: string, metadata?: Record<string, unknown>): ConversationTurn {
    const turn = new ConversationTurn(role, content, undefined, metadata);
    this.turns.push(turn);
    this.save(); // fire-and-forget
    return turn;
  }

  getTurns(limit?: number, offset = 0): ConversationTurnData[] {
    let turns = this.turns.slice(offset);
    if (limit) turns = turns.slice(0, limit);
    return turns.map((t) => t.toDict());
  }

  getLastN(n: number): ConversationTurnData[] {
    return this.getTurns(n);
  }

  getConversationPairs(): Array<{ user: ConversationTurnData; assistant: ConversationTurnData }> {
    const pairs: Array<{ user: ConversationTurnData; assistant: ConversationTurnData }> = [];
    for (let i = 0; i < this.turns.length - 1; i += 2) {
      const a = this.turns[i];
      const b = this.turns[i + 1];
      if (a && b && a.role === "user" && b.role === "assistant") {
        pairs.push({
          user: a.toDict(),
          assistant: b.toDict(),
        });
      }
    }
    return pairs;
  }

  get turnCount(): number {
    return this.turns.length;
  }

  get lastUpdated(): Date | null {
    const last = this.turns[this.turns.length - 1];
    return last ? last.timestamp : null;
  }

  get isEmpty(): boolean {
    return this.turns.length === 0;
  }

  clear(): void {
    this.turns = [];
    this.save();
  }

  delete(): void {
    try {
      unlinkSync(this._path);
    } catch (err) {
      log.debug({ err }, "Failed to delete session file");
    }
    this.turns = [];
  }
}

export class HistoryManager {
  private _storageDir: string;
  private _sessions: Map<string, SessionHistory> = new Map();

  constructor(dbPath: string) {
    this._storageDir = join(dbPath, "session_history");
    if (!existsSync(this._storageDir)) {
      mkdirSync(this._storageDir, { recursive: true });
    }
  }

  private _getSession(sessionId: string): SessionHistory {
    if (!this._sessions.has(sessionId)) {
      this._sessions.set(sessionId, new SessionHistory(sessionId, this._storageDir));
    }
    return this._sessions.get(sessionId)!;
  }

  addTurn(
    sessionId: string,
    role: string,
    content: string,
    metadata?: Record<string, unknown>,
  ): ConversationTurn {
    return this._getSession(sessionId).addTurn(role, content, metadata);
  }

  getHistory(sessionId: string, limit?: number, offset = 0): ConversationTurnData[] {
    return this._getSession(sessionId).getTurns(limit, offset);
  }

  getLastN(sessionId: string, n: number): ConversationTurnData[] {
    return this.getHistory(sessionId, n);
  }

  getConversationPairs(sessionId: string) {
    return this._getSession(sessionId).getConversationPairs();
  }

  sessionExists(sessionId: string): boolean {
    return existsSync(join(this._storageDir, `${sessionId}.json`));
  }

  deleteSession(sessionId: string): boolean {
    const session = this._sessions.get(sessionId);
    if (session) {
      session.delete();
      this._sessions.delete(sessionId);
      return true;
    }
    const path = join(this._storageDir, `${sessionId}.json`);
    if (existsSync(path)) {
      try {
        unlinkSync(path);
      } catch (err) {
        log.debug({ err }, "Failed to delete session file");
      }
      return true;
    }
    return false;
  }

  listSessions(): Array<{ session_id: string; turn_count: number; last_updated: string | null }> {
    const sessions: Array<{ session_id: string; turn_count: number; last_updated: string | null }> = [];
    if (!existsSync(this._storageDir)) return sessions;

    const files = readdirSync(this._storageDir).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      const sessionId = file.replace(".json", "");
      try {
        const data = readJsonFileSync<SessionData>(join(this._storageDir, file));
        sessions.push({
          session_id: sessionId,
          turn_count: data?.turn_count ?? 0,
          last_updated: data?.updated_at ?? null,
        });
      } catch {
        sessions.push({ session_id: sessionId, turn_count: 0, last_updated: null });
      }
    }

    sessions.sort((a, b) => (b.last_updated ?? "").localeCompare(a.last_updated ?? ""));
    return sessions;
  }

  getOrCreateSession(sessionId: string): SessionHistory {
    return this._getSession(sessionId);
  }

  clearCache(): void {
    this._sessions.clear();
  }
}

