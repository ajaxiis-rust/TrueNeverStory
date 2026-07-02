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

export type FactionType = "military" | "economic" | "religious" | "criminal" | "noble" | "neutral";

export type AllianceType = "military" | "trade" | "defensive" | "non_aggression" | "vassal";

export interface FactionDetails {
  name: string;
  type: FactionType;
  leader: string | null;
  members: string[];
  influence: number;
  treasury: number;
  description: string;
}

export interface Alliance {
  faction1: string;
  faction2: string;
  type: AllianceType;
  strength: number;
  active: boolean;
  betrayed: boolean;
  formedAt: string;
  expiresAt: string | null;
}

export interface InterFactionRelation {
  faction1: string;
  faction2: string;
  reputation: number;
  lastUpdated: string;
}

export interface FactionSummary {
  name: string;
  type: FactionType;
  leader: string | null;
  memberCount: number;
  influence: number;
  allies: string[];
  enemies: string[];
}

export interface FeudalRelationship {
  vassal: string;
  liege: string;
  oathSworn: boolean;
  taxContribution: number;
  militaryObligation: number;
  loyalty: number;
  lastInteraction: string;
}

export interface FeudalSummary {
  lord: string | null;
  vassals: string[];
  chainOfCommand: string[];
  totalTaxFlow: number;
  totalMilitarySupport: number;
}

export class SocialGraph {
  private _statePath: string;
  private _relationships: Map<string, Relationship[]> = new Map();
  private _factions: Map<string, Faction> = new Map();
  private _feudal: Map<string, FeudalRelationship> = new Map();
  private _factionDetails: Map<string, FactionDetails> = new Map();
  private _alliances: Map<string, Alliance> = new Map();
  private _interFaction: Map<string, InterFactionRelation> = new Map();

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
      if (data.feudal) {
        for (const [key, rel] of Object.entries(data.feudal)) {
          this._feudal.set(key, rel as FeudalRelationship);
        }
      }
      if (data.factionDetails) {
        for (const [name, details] of Object.entries(data.factionDetails)) {
          this._factionDetails.set(name, details as FactionDetails);
        }
      }
      if (data.alliances) {
        for (const [key, alliance] of Object.entries(data.alliances)) {
          this._alliances.set(key, alliance as Alliance);
        }
      }
      if (data.interFaction) {
        for (const [key, rel] of Object.entries(data.interFaction)) {
          this._interFaction.set(key, rel as InterFactionRelation);
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
      feudal: Object.fromEntries(this._feudal),
      factionDetails: Object.fromEntries(this._factionDetails),
      alliances: Object.fromEntries(this._alliances),
      interFaction: Object.fromEntries(this._interFaction),
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

  async swearFealty(vassal: string, liege: string, taxContribution: number, militaryObligation: number): Promise<void> {
    const existing = this._feudal.get(vassal);
    if (existing) {
      existing.liege = liege;
      existing.taxContribution = taxContribution;
      existing.militaryObligation = militaryObligation;
      existing.lastInteraction = new Date().toISOString();
    } else {
      this._feudal.set(vassal, {
        vassal,
        liege,
        oathSworn: true,
        taxContribution,
        militaryObligation,
        loyalty: 750,
        lastInteraction: new Date().toISOString(),
      });
    }
    this._save();
  }

  getFeudalLord(vassal: string): string | null {
    return this._feudal.get(vassal)?.liege ?? null;
  }

  getFeudalVassals(liege: string): string[] {
    const vassals: string[] = [];
    for (const [v, rel] of this._feudal) {
      if (rel.liege === liege) vassals.push(v);
    }
    return vassals;
  }

  isFeudalVassal(vassal: string, liege: string): boolean {
    const rel = this._feudal.get(vassal);
    return rel !== undefined && rel.liege === liege && rel.oathSworn;
  }

  getFeudalChain(vassal: string): string[] {
    const chain: string[] = [];
    let current = vassal;
    const seen = new Set<string>();
    while (current) {
      if (seen.has(current)) break;
      seen.add(current);
      const lord = this.getFeudalLord(current);
      if (!lord) break;
      chain.push(lord);
      current = lord;
    }
    return chain;
  }

  getFeudalSummary(vassal: string): FeudalSummary {
    const lord = this.getFeudalLord(vassal);
    const directVassals = this.getFeudalVassals(vassal);
    const chain = this.getFeudalChain(vassal);

    let totalTaxFlow = 0;
    let totalMilitarySupport = 0;
    for (const v of directVassals) {
      const rel = this._feudal.get(v);
      if (rel) {
        totalTaxFlow += rel.taxContribution;
        totalMilitarySupport += rel.militaryObligation;
      }
    }

    return {
      lord,
      vassals: directVassals,
      chainOfCommand: chain,
      totalTaxFlow,
      totalMilitarySupport,
    };
  }

  computeFeudalTax(vassal: string): number {
    const rel = this._feudal.get(vassal);
    return rel?.taxContribution ?? 0;
  }

  computeFeudalMilitary(vassal: string): number {
    const rel = this._feudal.get(vassal);
    return rel?.militaryObligation ?? 0;
  }

  updateFeudalLoyalty(vassal: string, delta: number): void {
    const rel = this._feudal.get(vassal);
    if (!rel) return;
    rel.loyalty = Math.max(0, Math.min(1000, rel.loyalty + delta));
    rel.lastInteraction = new Date().toISOString();
    this._save();
  }

  rebel(vassal: string): void {
    const rel = this._feudal.get(vassal);
    if (!rel) return;
    rel.oathSworn = false;
    rel.loyalty = 0;
    rel.lastInteraction = new Date().toISOString();
    this._save();
  }

  getFeudalLoyalty(vassal: string): number {
    return this._feudal.get(vassal)?.loyalty ?? 0;
  }

  getOathStatus(vassal: string): boolean {
    return this._feudal.get(vassal)?.oathSworn ?? false;
  }

  async createFaction(name: string, type: FactionType, leader: string | null, description: string): Promise<void> {
    if (!this._factions.has(name)) {
      this._factions.set(name, { name, members: new Set(), enemies: new Set() });
    }
    if (leader) this._factions.get(name)!.members.add(leader);

    this._factionDetails.set(name, {
      name,
      type,
      leader,
      members: leader ? [leader] : [],
      influence: 100,
      treasury: 0,
      description,
    });
    this._save();
  }

  getFactionDetails(name: string): FactionDetails | null {
    const details = this._factionDetails.get(name);
    if (!details) return null;
    const basic = this._factions.get(name);
    return {
      ...details,
      members: basic ? Array.from(basic.members) : details.members,
    };
  }

  setFactionLeader(name: string, leader: string): void {
    const details = this._factionDetails.get(name);
    if (!details) return;
    details.leader = leader;
    const basic = this._factions.get(name);
    if (basic) basic.members.add(leader);
    this._save();
  }

  updateFactionInfluence(name: string, delta: number): void {
    const details = this._factionDetails.get(name);
    if (!details) return;
    details.influence = Math.max(0, Math.min(1000, details.influence + delta));
    this._save();
  }

  updateFactionTreasury(name: string, amount: number): void {
    const details = this._factionDetails.get(name);
    if (!details) return;
    details.treasury = Math.max(0, details.treasury + amount);
    this._save();
  }

  async expelFromFaction(name: string, faction: string): Promise<void> {
    this._factions.get(faction)?.members.delete(name);
    const details = this._factionDetails.get(faction);
    if (details) details.members = details.members.filter(m => m !== name);
    this._save();
  }

  getFactionType(name: string): FactionType | null {
    return this._factionDetails.get(name)?.type ?? null;
  }

  private _factionKey(a: string, b: string): string {
    return [a, b].sort().join("::");
  }

  async setInterFactionRelation(faction1: string, faction2: string, reputation: number): Promise<void> {
    const key = this._factionKey(faction1, faction2);
    this._interFaction.set(key, {
      faction1,
      faction2,
      reputation: Math.max(-1000, Math.min(1000, reputation)),
      lastUpdated: new Date().toISOString(),
    });
    this._save();
  }

  getInterFactionRelation(faction1: string, faction2: string): InterFactionRelation | null {
    return this._interFaction.get(this._factionKey(faction1, faction2)) ?? null;
  }

  async formAlliance(faction1: string, faction2: string, type: AllianceType, strength: number, durationDays: number | null = null): Promise<void> {
    const key = this._factionKey(faction1, faction2);
    const now = new Date().toISOString();
    const expiresAt = durationDays
      ? new Date(Date.now() + durationDays * 86400000).toISOString()
      : null;

    this._alliances.set(key, {
      faction1,
      faction2,
      type,
      strength: Math.max(0, Math.min(1000, strength)),
      active: true,
      betrayed: false,
      formedAt: now,
      expiresAt,
    });

    const rel = this._interFaction.get(key);
    if (rel) rel.reputation = Math.min(1000, rel.reputation + strength / 2);
    this._save();
  }

  getAlliance(faction1: string, faction2: string): Alliance | null {
    const key = this._factionKey(faction1, faction2);
    const a = this._alliances.get(key);
    if (!a) return null;
    if (a.expiresAt && new Date(a.expiresAt) < new Date()) {
      a.active = false;
    }
    return a;
  }

  getActiveAlliances(faction: string): Alliance[] {
    const result: Alliance[] = [];
    for (const [, a] of this._alliances) {
      if (!a.active) continue;
      if (a.expiresAt && new Date(a.expiresAt) < new Date()) {
        a.active = false;
        continue;
      }
      if (a.faction1 === faction || a.faction2 === faction) result.push(a);
    }
    return result;
  }

  dissolveAlliance(faction1: string, faction2: string): void {
    const key = this._factionKey(faction1, faction2);
    const a = this._alliances.get(key);
    if (a) a.active = false;
    this._save();
  }

  betrayAlliance(faction1: string, faction2: string): void {
    const key = this._factionKey(faction1, faction2);
    const a = this._alliances.get(key);
    if (a) {
      a.active = false;
      a.betrayed = true;
      a.strength = 0;
    }
    const rel = this._interFaction.get(key);
    if (rel) rel.reputation = Math.max(-1000, rel.reputation - 300);

    const f1 = this._factions.get(faction1);
    const f2 = this._factions.get(faction2);
    if (f1) f2 && f1.enemies.add(faction2);
    if (f2) f1 && f2.enemies.add(faction1);
    this._save();
  }

  strengthenAlliance(faction1: string, faction2: string, delta: number): void {
    const key = this._factionKey(faction1, faction2);
    const a = this._alliances.get(key);
    if (!a || !a.active) return;
    a.strength = Math.max(0, Math.min(1000, a.strength + delta));
    this._save();
  }

  isAllied(faction1: string, faction2: string, type?: AllianceType): boolean {
    const a = this.getAlliance(faction1, faction2);
    if (!a || !a.active) return false;
    if (type && a.type !== type) return false;
    return true;
  }

  areEnemies(faction1: string, faction2: string): boolean {
    const f1 = this._factions.get(faction1);
    if (f1?.enemies.has(faction2)) return true;
    const rel = this._interFaction.get(this._factionKey(faction1, faction2));
    return rel !== undefined && rel.reputation < -500;
  }

  getFactionSummary(name: string): FactionSummary {
    const details = this._factionDetails.get(name);
    const basic = this._factions.get(name);

    const allies: string[] = [];
    const enemies: string[] = [];
    for (const [, a] of this._alliances) {
      if (!a.active) continue;
      if (a.faction1 === name) allies.push(a.faction2);
      else if (a.faction2 === name) allies.push(a.faction1);
    }
    if (basic) {
      for (const e of basic.enemies) enemies.push(e);
    }

    return {
      name,
      type: details?.type ?? "neutral",
      leader: details?.leader ?? null,
      memberCount: basic?.members.size ?? 0,
      influence: details?.influence ?? 0,
      allies,
      enemies,
    };
  }

  getRelationshipSummary(name: string): string {
    const rels = this.getRelationships(name);
    if (rels.length === 0) return "No known relationships";

    const friends = rels.filter(r => r.type === "friend");
    const enemies = rels.filter(r => r.type === "enemy");

    return `Friends: ${friends.length}, Enemies: ${enemies.length}, Total: ${rels.length}`;
  }
}
