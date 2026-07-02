import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export interface Relationship {
  source: string;
  target: string;
  type: "friend" | "enemy" | "neutral" | "romantic" | "rival" | "mentor";
  strength: number;
  updatedAt: string;
}

export interface Faction {
  name: string;
  members: Set<string>;
  enemies: Set<string>;
}

export class SocialGraph {
  private _statePath: string;
  private _relationships: Map<string, Relationship[]> = new Map();
  private _factions: Map<string, Faction> = new Map();

  constructor(statePath: string) {
    this._statePath = statePath;
    const dir = join(statePath, "social");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    this._load();
  }

  private _load(): void {
    const path = join(this._statePath, "social", "graph.json");
    if (!existsSync(path)) return;

    try {
      const data = JSON.parse(readFileSync(path, "utf-8"));
      if (data.relationships) {
        for (const [key, rels] of Object.entries(data.relationships)) {
          this._relationships.set(key, rels as Relationship[]);
        }
      }
      if (data.factions) {
        for (const [name, faction] of Object.entries(data.factions)) {
          const f = faction as { members: string[]; enemies: string[] };
          this._factions.set(name, {
            name,
            members: new Set(f.members),
            enemies: new Set(f.enemies),
          });
        }
      }
    } catch {
      // ignore corrupt data
    }
  }

  private _save(): void {
    const data = {
      relationships: Object.fromEntries(this._relationships),
      factions: Object.fromEntries(
        Array.from(this._factions.entries()).map(([name, f]) => [
          name,
          { members: Array.from(f.members), enemies: Array.from(f.enemies) },
        ])
      ),
    };
    writeFileSync(join(this._statePath, "social", "graph.json"), JSON.stringify(data, null, 2));
  }

  async addRelationship(source: string, target: string, type: Relationship["type"], strength: number): Promise<void> {
    const existing = this._relationships.get(source) ?? [];
    const idx = existing.findIndex(r => r.target === target);

    if (idx >= 0) {
      existing[idx]!.type = type;
      existing[idx]!.strength = strength;
      existing[idx]!.updatedAt = new Date().toISOString();
    } else {
      existing.push({
        source,
        target,
        type,
        strength,
        updatedAt: new Date().toISOString(),
      });
    }

    this._relationships.set(source, existing);
    this._save();
  }

  getRelationships(name: string): Relationship[] {
    return this._relationships.get(name) ?? [];
  }

  getRelationship(source: string, target: string): Relationship | undefined {
    const rels = this._relationships.get(source) ?? [];
    return rels.find(r => r.target === target);
  }

  getReputation(name: string): number {
    const rels = this.getRelationships(name);
    if (rels.length === 0) return 0.5;

    let score = 0.5;
    for (const rel of rels) {
      if (rel.type === "friend") score += rel.strength * 0.1;
      if (rel.type === "enemy") score -= rel.strength * 0.15;
    }

    return Math.max(0, Math.min(1, score));
  }

  findMutualFriends(a: string, b: string): string[] {
    const relsA = this.getRelationships(a).filter(r => r.type === "friend").map(r => r.target);
    const relsB = this.getRelationships(b).filter(r => r.type === "friend").map(r => r.target);
    return relsA.filter(name => relsB.includes(name));
  }

  async addToFaction(name: string, faction: string): Promise<void> {
    if (!this._factions.has(faction)) {
      this._factions.set(faction, { name: faction, members: new Set(), enemies: new Set() });
    }
    this._factions.get(faction)!.members.add(name);
    this._save();
  }

  getFactionMembers(faction: string): string[] {
    return Array.from(this._factions.get(faction)?.members ?? []);
  }

  getFactionConflicts(faction: string): string[] {
    const f = this._factions.get(faction);
    return f ? Array.from(f.enemies) : [];
  }

  async addFactionConflict(faction1: string, faction2: string): Promise<void> {
    if (!this._factions.has(faction1)) {
      this._factions.set(faction1, { name: faction1, members: new Set(), enemies: new Set() });
    }
    if (!this._factions.has(faction2)) {
      this._factions.set(faction2, { name: faction2, members: new Set(), enemies: new Set() });
    }
    this._factions.get(faction1)!.enemies.add(faction2);
    this._factions.get(faction2)!.enemies.add(faction1);
    this._save();
  }

  getRelationshipSummary(name: string): string {
    const rels = this.getRelationships(name);
    if (rels.length === 0) return "No known relationships";

    const friends = rels.filter(r => r.type === "friend");
    const enemies = rels.filter(r => r.type === "enemy");

    return `Friends: ${friends.length}, Enemies: ${enemies.length}, Total: ${rels.length}`;
  }
}
