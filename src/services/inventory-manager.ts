/**
 * Inventory Manager — full item management for players and NPCs.
 * Equipment slots, weight limits, trading, stacking.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { getLogger } from "../utils/logger";

const log = getLogger("inventory-manager");

export type ItemRarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

export type EquipSlot = "weapon" | "armor" | "helmet" | "boots" | "accessory" | "shield" | "none";

export interface ItemStats {
  attack: number;
  defense: number;
  speed: number;
  charisma: number;
}

export interface ItemInstance {
  id: string;
  templateId: string;
  name: string;
  description: string;
  rarity: ItemRarity;
  weight: number;
  value: number;
  stats: ItemStats;
  equipped: boolean;
  equipSlot: EquipSlot;
  quantity: number;
  owner: string;
  acquiredAt: string;
}

export interface InventorySlot {
  item: ItemInstance;
  quantity: number;
}

export interface InventorySummary {
  owner: string;
  totalItems: number;
  totalWeight: number;
  maxWeight: number;
  equipped: ItemInstance[];
  carried: InventorySlot[];
  gold: number;
}

const DEFAULT_STATS: ItemStats = { attack: 0, defense: 0, speed: 0, charisma: 0 };

const RARITY_WEIGHT_MULT: Record<ItemRarity, number> = {
  common: 1,
  uncommon: 1.5,
  rare: 2,
  epic: 3,
  legendary: 5,
};

export function createItemInstance(
  templateId: string,
  name: string,
  description: string,
  owner: string,
  opts: Partial<Pick<ItemInstance, "rarity" | "weight" | "value" | "stats" | "equipSlot" | "quantity">> = {},
): ItemInstance {
  return {
    id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    templateId,
    name,
    description,
    rarity: opts.rarity ?? "common",
    weight: opts.weight ?? 1,
    value: opts.value ?? 10,
    stats: opts.stats ?? { ...DEFAULT_STATS },
    equipped: false,
    equipSlot: opts.equipSlot ?? "none",
    quantity: opts.quantity ?? 1,
    owner,
    acquiredAt: new Date().toISOString(),
  };
}

export class InventoryManager {
  private _statePath: string;
  private _inventories: Map<string, ItemInstance[]> = new Map();
  private _gold: Map<string, number> = new Map();
  private _maxWeight: Map<string, number> = new Map();

  constructor(statePath: string) {
    this._statePath = statePath;
    const dir = join(statePath, "inventory");
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    this._load();
  }

  private _load(): void {
    const path = join(this._statePath, "inventory", "inventories.json");
    if (!existsSync(path)) return;
    try {
      const data = JSON.parse(readFileSync(path, "utf-8"));
      if (data.inventories) {
        for (const [owner, items] of Object.entries(data.inventories)) {
          this._inventories.set(owner, items as ItemInstance[]);
        }
      }
      if (data.gold) {
        for (const [owner, amount] of Object.entries(data.gold)) {
          this._gold.set(owner, amount as number);
        }
      }
      if (data.maxWeight) {
        for (const [owner, w] of Object.entries(data.maxWeight)) {
          this._maxWeight.set(owner, w as number);
        }
      }
    } catch {
      // ignore
    }
  }

  private _save(): void {
    const data = {
      inventories: Object.fromEntries(this._inventories),
      gold: Object.fromEntries(this._gold),
      maxWeight: Object.fromEntries(this._maxWeight),
    };
    writeFileSync(join(this._statePath, "inventory", "inventories.json"), JSON.stringify(data, null, 2));
  }

  private _ensureOwner(owner: string): void {
    if (!this._inventories.has(owner)) this._inventories.set(owner, []);
    if (!this._gold.has(owner)) this._gold.set(owner, 0);
    if (!this._maxWeight.has(owner)) this._maxWeight.set(owner, 100);
  }

  setMaxWeight(owner: string, weight: number): void {
    this._maxWeight.set(owner, weight);
    this._save();
  }

  getMaxWeight(owner: string): number {
    return this._maxWeight.get(owner) ?? 100;
  }

  addItem(owner: string, item: ItemInstance): boolean {
    this._ensureOwner(owner);
    item.owner = owner;

    const existing = this._inventories.get(owner)!.find(
      i => i.templateId === item.templateId && !i.equipped,
    );

    if (existing && item.equipSlot === "none") {
      existing.quantity += item.quantity;
    } else {
      this._inventories.get(owner)!.push(item);
    }

    this._save();
    return true;
  }

  addItemSimple(owner: string, name: string, quantity = 1, opts: Partial<Pick<ItemInstance, "rarity" | "weight" | "value" | "stats" | "equipSlot">> = {}): ItemInstance {
    const item = createItemInstance(name.toLowerCase(), name, "", owner, { ...opts, quantity });
    this.addItem(owner, item);
    return item;
  }

  removeItem(owner: string, templateId: string, quantity = 1): boolean {
    const items = this._inventories.get(owner);
    if (!items) return false;

    const idx = items.findIndex(i => i.templateId === templateId && !i.equipped);
    if (idx === -1) return false;

    const item = items[idx]!;
    if (item.quantity <= quantity) {
      items.splice(idx, 1);
    } else {
      item.quantity -= quantity;
    }

    this._save();
    return true;
  }

  removeItemById(owner: string, itemId: string): boolean {
    const items = this._inventories.get(owner);
    if (!items) return false;

    const idx = items.findIndex(i => i.id === itemId);
    if (idx === -1) return false;

    items.splice(idx, 1);
    this._save();
    return true;
  }

  hasItem(owner: string, templateId: string, quantity = 1): boolean {
    const items = this._inventories.get(owner) ?? [];
    const total = items
      .filter(i => i.templateId === templateId)
      .reduce((sum, i) => sum + i.quantity, 0);
    return total >= quantity;
  }

  getItemCount(owner: string, templateId: string): number {
    const items = this._inventories.get(owner) ?? [];
    return items
      .filter(i => i.templateId === templateId)
      .reduce((sum, i) => sum + i.quantity, 0);
  }

  equip(owner: string, itemId: string): boolean {
    const items = this._inventories.get(owner);
    if (!items) return false;

    const item = items.find(i => i.id === itemId);
    if (!item || item.equipSlot === "none") return false;

    const slot = item.equipSlot;
    const currentlyEquipped = items.find(i => i.equipped && i.equipSlot === slot);
    if (currentlyEquipped) {
      currentlyEquipped.equipped = false;
    }

    item.equipped = true;
    this._save();
    return true;
  }

  unequip(owner: string, itemId: string): boolean {
    const items = this._inventories.get(owner);
    if (!items) return false;

    const item = items.find(i => i.id === itemId);
    if (!item) return false;

    item.equipped = false;
    this._save();
    return true;
  }

  getEquipped(owner: string): ItemInstance[] {
    const items = this._inventories.get(owner) ?? [];
    return items.filter(i => i.equipped);
  }

  getEquippedSlot(owner: string, slot: EquipSlot): ItemInstance | null {
    const items = this._inventories.get(owner) ?? [];
    return items.find(i => i.equipped && i.equipSlot === slot) ?? null;
  }

  getCarried(owner: string): ItemInstance[] {
    const items = this._inventories.get(owner) ?? [];
    return items.filter(i => !i.equipped);
  }

  getAll(owner: string): ItemInstance[] {
    return this._inventories.get(owner) ?? [];
  }

  getTotalWeight(owner: string): number {
    const items = this._inventories.get(owner) ?? [];
    return items.reduce((sum, i) => sum + i.weight * i.quantity, 0);
  }

  canCarry(owner: string, additionalWeight: number): boolean {
    const current = this.getTotalWeight(owner);
    const max = this.getMaxWeight(owner);
    return current + additionalWeight <= max;
  }

  getGold(owner: string): number {
    return this._gold.get(owner) ?? 0;
  }

  addGold(owner: string, amount: number): void {
    this._ensureOwner(owner);
    this._gold.set(owner, (this._gold.get(owner) ?? 0) + amount);
    this._save();
  }

  spendGold(owner: string, amount: number): boolean {
    const current = this._gold.get(owner) ?? 0;
    if (current < amount) return false;
    this._gold.set(owner, current - amount);
    this._save();
    return true;
  }

  trade(from: string, to: string, templateId: string, quantity = 1, price = 0): boolean {
    if (!this.hasItem(from, templateId, quantity)) return false;
    if (price > 0) {
      if (!this.spendGold(to, price)) return false;
      this.addGold(from, price);
    }

    this.removeItem(from, templateId, quantity);
    const fromItems = this._inventories.get(from) ?? [];
    const sourceItem = fromItems.find(i => i.templateId === templateId);

    const tradeItem = createItemInstance(
      templateId,
      sourceItem?.name ?? templateId,
      sourceItem?.description ?? "",
      to,
      {
        rarity: sourceItem?.rarity,
        weight: sourceItem?.weight,
        value: sourceItem?.value,
        stats: sourceItem?.stats ? { ...sourceItem.stats } : undefined,
        equipSlot: sourceItem?.equipSlot,
        quantity,
      },
    );
    this.addItem(to, tradeItem);
    return true;
  }

  dropItem(owner: string, templateId: string, quantity = 1): boolean {
    return this.removeItem(owner, templateId, quantity);
  }

  sortItems(owner: string, by: "name" | "rarity" | "weight" | "value"): void {
    const items = this._inventories.get(owner);
    if (!items) return;

    const rarityOrder: Record<ItemRarity, number> = {
      common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4,
    };

    items.sort((a, b) => {
      if (a.equipped !== b.equipped) return a.equipped ? -1 : 1;
      switch (by) {
        case "name": return a.name.localeCompare(b.name);
        case "rarity": return rarityOrder[b.rarity] - rarityOrder[a.rarity];
        case "weight": return a.weight - b.weight;
        case "value": return b.value - a.value;
        default: return 0;
      }
    });
    this._save();
  }

  getEquippedStats(owner: string): ItemStats {
    const equipped = this.getEquipped(owner);
    const total: ItemStats = { attack: 0, defense: 0, speed: 0, charisma: 0 };
    for (const item of equipped) {
      total.attack += item.stats.attack;
      total.defense += item.stats.defense;
      total.speed += item.stats.speed;
      total.charisma += item.stats.charisma;
    }
    return total;
  }

  getSummary(owner: string): InventorySummary {
    this._ensureOwner(owner);
    const items = this._inventories.get(owner)!;
    return {
      owner,
      totalItems: items.reduce((sum, i) => sum + i.quantity, 0),
      totalWeight: this.getTotalWeight(owner),
      maxWeight: this.getMaxWeight(owner),
      equipped: items.filter(i => i.equipped),
      carried: items.filter(i => !i.equipped).map(i => ({ item: i, quantity: i.quantity })),
      gold: this.getGold(owner),
    };
  }

  findByRarity(owner: string, rarity: ItemRarity): ItemInstance[] {
    return (this._inventories.get(owner) ?? []).filter(i => i.rarity === rarity);
  }

  findBySlot(owner: string, slot: EquipSlot): ItemInstance[] {
    return (this._inventories.get(owner) ?? []).filter(i => i.equipSlot === slot);
  }

  getStrongestWeapon(owner: string): ItemInstance | null {
    const weapons = this.findBySlot(owner, "weapon");
    if (weapons.length === 0) return null;
    return weapons.reduce((best, w) => w.stats.attack > best.stats.attack ? w : best);
  }
}
