/**
 * TrueNeverStory — Unified entity store with O(1) lookups and batch saves.
 * Replaces world_core/store.py.
 */

import { EntityNode, EntityType, entityTypeFromString, type EntityTypeValue, type EntityNodeData } from "../models/entity";
import { atomicWriteJson, readJsonFileSync } from "../lib/atomic-io";
import { existsSync } from "node:fs";
import { getLogger } from "../utils/logger";

const log = getLogger("entity-store");

// ── NameIndex ─────────────────────────────────────────────────────

export class NameIndex {
  private _validUids: Set<string> = new Set();
  private _byNameLower: Map<string, string> = new Map();
  private _byToken: Map<string, string[]> = new Map();
  private _byType: Map<string, string[]> = new Map();
  private _dirty = true;

  add(uid: string, name: string, entityType: string): void {
    this._validUids.add(uid);
    const key = name.trim().toLowerCase();
    this._byNameLower.set(key, uid);
    for (const token of key.split(/\s+/)) {
      const list = this._byToken.get(token) ?? [];
      list.push(uid);
      this._byToken.set(token, list);
    }
    const typeList = this._byType.get(entityType) ?? [];
    typeList.push(uid);
    this._byType.set(entityType, typeList);
  }

  remove(uid: string, name: string, entityType: string): void {
    this._validUids.delete(uid);
    const key = name.trim().toLowerCase();
    this._byNameLower.delete(key);
    for (const token of key.split(/\s+/)) {
      const list = this._byToken.get(token);
      if (list) {
        const idx = list.indexOf(uid);
        if (idx !== -1) list.splice(idx, 1);
      }
    }
    const typeList = this._byType.get(entityType);
    if (typeList) {
      const idx = typeList.indexOf(uid);
      if (idx !== -1) typeList.splice(idx, 1);
    }
  }

  resolve(ref: string): string | null {
    if (!ref) return null;
    const trimmed = ref.trim();

    // 1. Direct UID match
    if (this._validUids.has(trimmed)) return trimmed;

    // 2. Case-insensitive full name
    const low = trimmed.toLowerCase();
    const uid2 = this._byNameLower.get(low);
    if (uid2) return uid2;

    // 3. Strip type prefix and retry
    if (low.includes(":") && !low.startsWith("__")) {
      const afterColon = low.split(":", 2)[1]?.trim();
      if (afterColon) {
        const uid3 = this._byNameLower.get(afterColon);
        if (uid3) return uid3;
      }
    }

    // 4. Token-based fuzzy — only if exactly one candidate
    const candidates = new Set<string>();
    for (const token of low.split(/\s+/)) {
      const uids = this._byToken.get(token);
      if (uids) {
        for (const uid of uids) {
          if (this._validUids.has(uid)) candidates.add(uid);
        }
      }
    }
    if (candidates.size === 1) {
      return candidates.values().next().value ?? null;
    }

    return null;
  }

  listByType(entityType: string): string[] {
    const uids = this._byType.get(entityType) ?? [];
    return uids.filter((u) => this._validUids.has(u));
  }

  get validUids(): Set<string> {
    return new Set(this._validUids);
  }

  rebuild(entities: EntityNode[]): void {
    this._validUids.clear();
    this._byNameLower.clear();
    this._byToken.clear();
    this._byType.clear();
    for (const node of entities) {
      this.add(node.uid, node.name, node.entityType);
    }
    this._dirty = false;
  }
}

// ── UnifiedEntityStore ────────────────────────────────────────────

type MutationCallback = (action: string, uid: string) => void;

export class UnifiedEntityStore {
  private _entities: Map<string, EntityNode> = new Map();
  private _nameIndex: NameIndex = new NameIndex();
  private _dirtyUids: Set<string> = new Set();
  private _deletedUids: Set<string> = new Set();
  private _mutationCallbacks: MutationCallback[] = [];
  private _lastSaveTime = 0;

  constructor(
    private storePath: string,
    private autoSave = true,
  ) {
    if (existsSync(this.storePath)) {
      this._load();
    }
  }

  private _load(): void {
    try {
      const raw = readJsonFileSync<Array<Record<string, unknown>>>(this.storePath);
      if (!raw) return;
      for (const item of raw) {
        const node = EntityNode.fromDict(item as unknown as EntityNodeData);
        this._entities.set(node.uid, node);
      }
      this._nameIndex.rebuild(Array.from(this._entities.values()));
    } catch (err) {
      log.error({ err }, "Failed to load entity store");
    }
  }

  reload(newPath: string): void {
    this._entities.clear();
    this._nameIndex.rebuild([]);
    this._dirtyUids.clear();
    this._deletedUids.clear();
    this.storePath = newPath;
    if (existsSync(this.storePath)) {
      this._load();
    }
  }

  add(node: EntityNode): EntityNode {
    node.updatedAt = Date.now() / 1000;
    this._entities.set(node.uid, node);
    this._nameIndex.add(node.uid, node.name, node.entityType);
    this._dirtyUids.add(node.uid);
    this._notify("add", node.uid);
    if (this.autoSave) this.save();
    return node;
  }

  get(uid: string): EntityNode | undefined {
    return this._entities.get(uid);
  }

  getByName(name: string): EntityNode | undefined {
    const uid = this._nameIndex.resolve(name);
    return uid ? this._entities.get(uid) : undefined;
  }

  getByNameAndType(name: string, entityType: string): EntityNode | undefined {
    const uid = `${entityType}:${name}`;
    const node = this._entities.get(uid);
    if (node) return node;

    const resolved = this._nameIndex.resolve(name);
    if (resolved) {
      const n = this._entities.get(resolved);
      if (n && n.entityType === entityType) return n;
    }
    return undefined;
  }

  remove(uid: string): boolean {
    const node = this._entities.get(uid);
    if (!node) return false;
    this._entities.delete(uid);
    this._nameIndex.remove(uid, node.name, node.entityType);
    this._deletedUids.add(uid);
    this._notify("remove", uid);
    if (this.autoSave) this.save();
    return true;
  }

  updateEntityLevel(uid: string, level: string, data: Record<string, unknown>): boolean {
    const node = this._entities.get(uid);
    if (!node) return false;
    const profile = node.profile;
    if (level === "l1") Object.assign(profile.l1, data);
    else if (level === "l2") Object.assign(profile.l2, data);
    else if (level === "l3") Object.assign(profile.l3, data);
    node.updatedAt = Date.now() / 1000;
    this._dirtyUids.add(uid);
    this._notify("update", uid);
    if (this.autoSave) this.save();
    return true;
  }

  allNodes(): EntityNode[] {
    return Array.from(this._entities.values());
  }

  listByType(entityType: string): EntityNode[] {
    const uids = this._nameIndex.listByType(entityType);
    return uids.map((u) => this._entities.get(u)).filter((n): n is EntityNode => !!n);
  }

  search(query: string, entityType?: string, limit = 20): EntityNode[] {
    const q = query.toLowerCase();
    const results: EntityNode[] = [];
    for (const node of this._entities.values()) {
      if (entityType && node.entityType !== entityType) continue;
      if (node.name.toLowerCase().includes(q)) { results.push(node); continue; }
      if (String(node.profile.l1.summary ?? "").toLowerCase().includes(q)) { results.push(node); continue; }
      if (node.profile.tags.some((t) => t.toLowerCase().includes(q))) { results.push(node); continue; }
      if (String(node.profile.l2.description ?? "").toLowerCase().includes(q)) { results.push(node); continue; }
      if (results.length >= limit) break;
    }
    return results;
  }

  count(): number {
    return this._entities.size;
  }

  countByType(): Record<string, number> {
    const result: Record<string, number> = {};
    for (const node of this._entities.values()) {
      result[node.entityType] = (result[node.entityType] ?? 0) + 1;
    }
    return result;
  }

  resolveUid(ref: string): string | null {
    return this._nameIndex.resolve(ref);
  }

  get nameIndex(): NameIndex {
    return this._nameIndex;
  }

  get validUids(): Set<string> {
    return this._nameIndex.validUids;
  }

  save(): void {
    const serialized = Array.from(this._entities.values()).map((n) => n.toDict());
    atomicWriteJson(this.storePath, serialized).then(() => {
      this._dirtyUids.clear();
      this._deletedUids.clear();
      this._lastSaveTime = Date.now() / 1000;
    }).catch((err) => {
      log.error({ err }, "Failed to save entity store");
    });
  }

  saveIfDirty(): boolean {
    if (this._dirtyUids.size > 0 || this._deletedUids.size > 0) {
      this.save();
      return true;
    }
    return false;
  }

  batchUpdate(updates: Array<[string, string, Record<string, unknown>]>): void {
    const wasAuto = this.autoSave;
    this.autoSave = false;
    try {
      for (const [uid, level, data] of updates) {
        this.updateEntityLevel(uid, level, data);
      }
    } finally {
      this.autoSave = wasAuto;
      if (wasAuto) this.save();
    }
  }

  onMutation(callback: MutationCallback): void {
    this._mutationCallbacks.push(callback);
  }

  private _notify(action: string, uid: string): void {
    for (const cb of this._mutationCallbacks) {
      try {
        cb(action, uid);
      } catch (err) {
        log.warn({ err }, "Mutation callback error");
      }
    }
  }
}
