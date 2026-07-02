import { describe, it, expect, beforeEach } from "bun:test";
import { InventoryManager, createItemInstance } from "./inventory-manager";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const TMP_BASE = join(tmpdir(), `tns-inv-${Date.now()}`);

function freshTmp(): string {
  const p = join(TMP_BASE, `t${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
  mkdirSync(p, { recursive: true });
  return p;
}

describe("InventoryManager", () => {
  let tmp: string;
  let inv: InventoryManager;

  beforeEach(() => {
    tmp = freshTmp();
    inv = new InventoryManager(tmp);
  });

  it("adds and retrieves items", () => {
    const item = createItemInstance("sword", "Iron Sword", "A basic sword", "Player", { weight: 5, value: 50 });
    inv.addItem("Player", item);

    const all = inv.getAll("Player");
    expect(all).toHaveLength(1);
    expect(all[0]!.name).toBe("Iron Sword");
  });

  it("stacks identical items", () => {
    inv.addItemSimple("Player", "Arrow", 5);
    inv.addItemSimple("Player", "Arrow", 3);

    expect(inv.getItemCount("Player", "arrow")).toBe(8);
  });

  it("does not stack equipped items", () => {
    const item1 = createItemInstance("ring", "Gold Ring", "", "Player", { equipSlot: "accessory", quantity: 1 });
    const item2 = createItemInstance("ring", "Gold Ring", "", "Player", { equipSlot: "accessory", quantity: 1 });
    inv.addItem("Player", item1);
    inv.addItem("Player", item2);

    expect(inv.getAll("Player")).toHaveLength(2);
  });

  it("removes items", () => {
    inv.addItemSimple("Player", "Potion", 5);
    inv.removeItem("Player", "potion", 2);
    expect(inv.getItemCount("Player", "potion")).toBe(3);
  });

  it("removes all when quantity exceeds", () => {
    inv.addItemSimple("Player", "Potion", 3);
    inv.removeItem("Player", "potion", 5);
    expect(inv.getItemCount("Player", "potion")).toBe(0);
  });

  it("checks item ownership", () => {
    inv.addItemSimple("Player", "Sword", 1);
    expect(inv.hasItem("Player", "sword")).toBe(true);
    expect(inv.hasItem("Player", "axe")).toBe(false);
  });

  it("equips and unequips items", () => {
    const sword = createItemInstance("sword", "Iron Sword", "", "Player", { equipSlot: "weapon", stats: { attack: 10, defense: 0, speed: 0, charisma: 0 } });
    inv.addItem("Player", sword);
    inv.equip("Player", sword.id);

    expect(inv.getEquipped("Player")).toHaveLength(1);
    expect(inv.getEquippedSlot("Player", "weapon")!.id).toBe(sword.id);

    inv.unequip("Player", sword.id);
    expect(inv.getEquipped("Player")).toHaveLength(0);
  });

  it("replaces equipped item in same slot", () => {
    const sword1 = createItemInstance("sword1", "Iron Sword", "", "Player", { equipSlot: "weapon" });
    const sword2 = createItemInstance("sword2", "Steel Sword", "", "Player", { equipSlot: "weapon" });
    inv.addItem("Player", sword1);
    inv.addItem("Player", sword2);

    inv.equip("Player", sword1.id);
    inv.equip("Player", sword2.id);

    expect(inv.getEquippedSlot("Player", "weapon")!.id).toBe(sword2.id);
    expect(sword1.equipped).toBe(false);
  });

  it("tracks weight", () => {
    inv.addItemSimple("Player", "Rock", 1, { weight: 10 });
    inv.addItemSimple("Player", "Feather", 1, { weight: 0.1 });

    expect(inv.getTotalWeight("Player")).toBeCloseTo(10.1, 1);
  });

  it("checks carry capacity", () => {
    inv.setMaxWeight("Player", 20);
    inv.addItemSimple("Player", "Boulder", 1, { weight: 15 });

    expect(inv.canCarry("Player", 4)).toBe(true);
    expect(inv.canCarry("Player", 6)).toBe(false);
  });

  it("manages gold", () => {
    inv.addGold("Player", 100);
    expect(inv.getGold("Player")).toBe(100);

    inv.spendGold("Player", 30);
    expect(inv.getGold("Player")).toBe(70);

    expect(inv.spendGold("Player", 100)).toBe(false);
    expect(inv.getGold("Player")).toBe(70);
  });

  it("trades items between owners", () => {
    inv.addItemSimple("Player", "Apple", 5);
    inv.addGold("NPC", 200);

    const ok = inv.trade("Player", "NPC", "apple", 2, 10);
    expect(ok).toBe(true);
    expect(inv.getItemCount("Player", "apple")).toBe(3);
    expect(inv.getItemCount("NPC", "apple")).toBe(2);
    expect(inv.getGold("Player")).toBe(10);
    expect(inv.getGold("NPC")).toBe(190);
  });

  it("trade fails without enough items", () => {
    inv.addItemSimple("Player", "Apple", 1);
    expect(inv.trade("Player", "NPC", "apple", 5)).toBe(false);
  });

  it("trade fails without enough gold", () => {
    inv.addItemSimple("Player", "Apple", 5);
    inv.addGold("NPC", 5);
    expect(inv.trade("Player", "NPC", "apple", 1, 10)).toBe(false);
  });

  it("calculates equipped stats", () => {
    const sword = createItemInstance("sword", "Sword", "", "P", { equipSlot: "weapon", stats: { attack: 10, defense: 0, speed: 0, charisma: 0 } });
    const armor = createItemInstance("armor", "Armor", "", "P", { equipSlot: "armor", stats: { attack: 0, defense: 15, speed: -2, charisma: 0 } });
    inv.addItem("P", sword);
    inv.addItem("P", armor);
    inv.equip("P", sword.id);
    inv.equip("P", armor.id);

    const stats = inv.getEquippedStats("P");
    expect(stats.attack).toBe(10);
    expect(stats.defense).toBe(15);
  });

  it("finds strongest weapon", () => {
    const weak = createItemInstance("w1", "Dagger", "", "P", { equipSlot: "weapon", stats: { attack: 5, defense: 0, speed: 0, charisma: 0 } });
    const strong = createItemInstance("w2", "Greatsword", "", "P", { equipSlot: "weapon", stats: { attack: 20, defense: 0, speed: 0, charisma: 0 } });
    inv.addItem("P", weak);
    inv.addItem("P", strong);

    expect(inv.getStrongestWeapon("P")!.name).toBe("Greatsword");
  });

  it("sorts items", () => {
    inv.addItemSimple("P", "Zebra", 1, { weight: 5, value: 10 });
    inv.addItemSimple("P", "Apple", 1, { weight: 1, value: 50 });
    inv.addItemSimple("P", "Mango", 1, { weight: 3, value: 20 });

    inv.sortItems("P", "name");
    const names = inv.getAll("P").map(i => i.name);
    expect(names).toEqual(["Apple", "Mango", "Zebra"]);
  });

  it("returns summary", () => {
    inv.addItemSimple("P", "Sword", 1, { weight: 5 });
    inv.addGold("P", 100);

    const summary = inv.getSummary("P");
    expect(summary.totalItems).toBe(1);
    expect(summary.gold).toBe(100);
    expect(summary.maxWeight).toBe(100);
  });

  it("finds by rarity", () => {
    inv.addItemSimple("P", "Stick", 1, { rarity: "common" });
    inv.addItemSimple("P", "Excalibur", 1, { rarity: "legendary" });

    expect(inv.findByRarity("P", "legendary")).toHaveLength(1);
    expect(inv.findByRarity("P", "common")).toHaveLength(1);
  });

  it("persists across reload", () => {
    const sword = createItemInstance("sword", "Sword", "", "Player", { weight: 5, equipSlot: "weapon" });
    inv.addItem("Player", sword);
    inv.equip("Player", sword.id);
    inv.addGold("Player", 500);

    const inv2 = new InventoryManager(tmp);
    expect(inv2.getItemCount("Player", "sword")).toBe(1);
    expect(inv2.getEquipped("Player")).toHaveLength(1);
    expect(inv2.getGold("Player")).toBe(500);
  });
});
