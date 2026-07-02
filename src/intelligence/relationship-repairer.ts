/**
 * Trie-based fuzzy matching for entity references.
 * Replaces world_intelligence/relationship_repairer.ts.
 */

import type { UnifiedEntityStore } from "../store/entity-store";
import { getLogger } from "../utils/logger";

const log = getLogger("relationship-repairer");

interface RepairResult {
  originalRef: string;
  resolvedUid: string;
  resolvedName: string;
  confidence: number;
}

class TrieNode {
  children = new Map<string, TrieNode>();
  uids: string[] = [];
}

class EntityTrie {
  private _root = new TrieNode();

  insert(name: string, uid: string): void {
    let node = this._root;
    for (const char of name.toLowerCase()) {
      let child = node.children.get(char);
      if (!child) {
        child = new TrieNode();
        node.children.set(char, child);
      }
      node = child;
      node.uids.push(uid);
    }
  }

  searchPrefix(prefix: string, limit = 10): string[] {
    let node = this._root;
    for (const char of prefix.toLowerCase()) {
      const child = node.children.get(char);
      if (!child) return [];
      node = child;
    }
    return [...new Set(node.uids)].slice(0, limit);
  }
}

export class RelationshipRepairer {
  private _store: UnifiedEntityStore;
  private _trie: EntityTrie;
  private _exactThreshold = 0.95;
  private _highThreshold = 0.85;
  private _mediumThreshold = 0.65;

  constructor(store: UnifiedEntityStore) {
    this._store = store;
    this._trie = new EntityTrie();
    this._buildTrie();
  }

  private _buildTrie(): void {
    for (const entity of this._store.allNodes()) {
      this._trie.insert(entity.name, entity.uid);
    }
  }

  resolveReference(ref: string): RepairResult | null {
    if (!ref) return null;

    // Direct UID match
    const direct = this._store.get(ref);
    if (direct) {
      return { originalRef: ref, resolvedUid: direct.uid, resolvedName: direct.name, confidence: 1.0 };
    }

    // Direct name match
    const byName = this._store.getByName(ref);
    if (byName) {
      return { originalRef: ref, resolvedUid: byName.uid, resolvedName: byName.name, confidence: 1.0 };
    }

    // Trie prefix search
    const candidates = this._trie.searchPrefix(ref, 10);
    if (candidates.length === 1) {
      const uid = candidates[0]!;
      const entity = this._store.get(uid);
      if (entity) {
        return { originalRef: ref, resolvedUid: uid, resolvedName: entity.name, confidence: 0.9 };
      }
    }

    // Fuzzy matching
    let bestMatch: RepairResult | null = null;
    let bestScore = 0;

    for (const uid of candidates) {
      const entity = this._store.get(uid);
      if (!entity) continue;
      const score = this._similarity(ref.toLowerCase(), entity.name.toLowerCase());
      if (score > bestScore && score >= this._mediumThreshold) {
        bestScore = score;
        bestMatch = {
          originalRef: ref,
          resolvedUid: uid,
          resolvedName: entity.name,
          confidence: score,
        };
      }
    }

    return bestMatch;
  }

  repairRelationships(): RepairResult[] {
    const results: RepairResult[] = [];
    for (const entity of this._store.allNodes()) {
      for (const rel of entity.profile.relationships) {
        const target = rel.target as string;
        const resolved = this.resolveReference(target);
        if (resolved && resolved.resolvedUid !== target) {
          results.push(resolved);
        }
      }
    }
    return results;
  }

  private _similarity(a: string, b: string): number {
    if (a === b) return 1.0;
    if (a.includes(b) || b.includes(a)) return 0.85;

    // Levenshtein-like distance
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1.0;
    let matches = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i] === b[i]) matches++;
    }
    return matches / maxLen;
  }
}
