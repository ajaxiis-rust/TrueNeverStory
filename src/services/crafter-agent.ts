/**
 * CrafterAgent — scans inventory, combines items by recipes.
 * Suggests possible crafts from available ingredients.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { UnifiedEntityStore } from "../store/entity-store";
import { EntityNode } from "../models/entity";
import type { LLMQueue } from "../lib/llm-queue";
import { PromptBuilder } from "./prompt-builder";
import { getLogger } from "../utils/logger";

const log = getLogger("crafter-agent");

export interface Recipe {
  id: string;
  name: string;
  nameRu: string;
  ingredients: string[];
  result: string;
  resultRu: string;
  description: string;
  descriptionRu: string;
  difficulty: "easy" | "medium" | "hard";
  category: string;
}

interface RecipeFile {
  recipes: Recipe[];
}

export class CrafterAgent {
  private _entityStore: UnifiedEntityStore;
  private _llmQueue: LLMQueue;
  private _recipes: Recipe[] = [];
  private _inventory: Map<string, number> = new Map();

  constructor(entityStore: UnifiedEntityStore, llmQueue: LLMQueue, dataDir?: string) {
    this._entityStore = entityStore;
    this._llmQueue = llmQueue;
    this._loadRecipes(dataDir);
  }

  private _loadRecipes(dataDir?: string): void {
    const paths = [
      dataDir ? join(dataDir, "recipes.json") : null,
      join(process.cwd(), "src", "data", "recipes.json"),
      join(process.cwd(), "data", "recipes.json"),
    ].filter(Boolean) as string[];

    for (const p of paths) {
      if (existsSync(p)) {
        try {
          const raw = readFileSync(p, "utf-8");
          const data = JSON.parse(raw) as RecipeFile;
          this._recipes = data.recipes ?? [];
          log.info({ count: this._recipes.length, path: p }, "Loaded recipes");
          return;
        } catch (e) {
          log.error({ err: e, path: p }, "Failed to load recipes");
        }
      }
    }
    log.warn("No recipes file found, using empty recipe list");
  }

  /** Scan entity store for items in character's inventory */
  scanInventory(characterName: string): Map<string, number> {
    this._inventory.clear();
    const allItems = this._entityStore.listByType("Item");

    for (const item of allItems) {
      const owner = (item.profile.l2.owner as string) ?? "";
      const location = (item.profile.l2.location as string) ?? "";
      const inInventory = owner.toLowerCase() === characterName.toLowerCase()
        || location.toLowerCase() === `inventory:${characterName.toLowerCase()}`;

      if (inInventory) {
        const count = (item.profile.l2.quantity as number) ?? 1;
        const current = this._inventory.get(item.name) ?? 0;
        this._inventory.set(item.name, current + count);
      }
    }

    return new Map(this._inventory);
  }

  /** Find all recipes craftable from current inventory */
  findCraftable(inventory: Map<string, number>): Recipe[] {
    const craftable: Recipe[] = [];

    for (const recipe of this._recipes) {
      const needed = new Map<string, number>();
      for (const ing of recipe.ingredients) {
        needed.set(ing, (needed.get(ing) ?? 0) + 1);
      }

      let canCraft = true;
      for (const [item, count] of needed) {
        if ((inventory.get(item) ?? 0) < count) {
          canCraft = false;
          break;
        }
      }

      if (canCraft) craftable.push(recipe);
    }

    return craftable;
  }

  /** Find recipes that are partially possible (missing 1 ingredient) */
  findAlmostCraftable(inventory: Map<string, number>): Array<{ recipe: Recipe; missing: string[] }> {
    const result: Array<{ recipe: Recipe; missing: string[] }> = [];

    for (const recipe of this._recipes) {
      const needed = new Map<string, number>();
      for (const ing of recipe.ingredients) {
        needed.set(ing, (needed.get(ing) ?? 0) + 1);
      }

      const missing: string[] = [];
      for (const [item, count] of needed) {
        const have = inventory.get(item) ?? 0;
        for (let i = have; i < count; i++) {
          missing.push(item);
        }
      }

      if (missing.length === 1) {
        result.push({ recipe, missing });
      }
    }

    return result;
  }

  /** Execute a craft — consume ingredients, produce result */
  craft(recipeId: string, characterName: string): { success: boolean; message: string; result?: string } {
    const recipe = this._recipes.find((r) => r.id === recipeId);
    if (!recipe) return { success: false, message: `Unknown recipe: ${recipeId}` };

    const inventory = this.scanInventory(characterName);

    // Check ingredients
    const needed = new Map<string, number>();
    for (const ing of recipe.ingredients) {
      needed.set(ing, (needed.get(ing) ?? 0) + 1);
    }

    for (const [item, count] of needed) {
      if ((inventory.get(item) ?? 0) < count) {
        return { success: false, message: `Missing ingredient: ${item} (need ${count}, have ${inventory.get(item) ?? 0})` };
      }
    }

    // Consume ingredients from entity store
    const allItems = this._entityStore.listByType("Item");
    for (const [item, count] of needed) {
      let consumed = 0;
      for (const entity of allItems) {
        if (consumed >= count) break;
        const owner = (entity.profile.l2.owner as string) ?? "";
        const location = (entity.profile.l2.location as string) ?? "";
        const inInventory = owner.toLowerCase() === characterName.toLowerCase()
          || location.toLowerCase() === `inventory:${characterName.toLowerCase()}`;

        if (inInventory && entity.name === item) {
          const qty = (entity.profile.l2.quantity as number) ?? 1;
          if (qty <= count - consumed) {
            // Remove entire entity
            this._entityStore.remove(entity.uid);
            consumed += qty;
          } else {
            // Reduce quantity
            entity.profile.l2.quantity = qty - (count - consumed);
            consumed = count;
          }
        }
      }
    }

    // Add result to inventory
    const uid = `item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const resultNode = new EntityNode({
      uid,
      name: recipe.result,
      entity_type: "Item",
      profile: {
        l1: { name: recipe.result, type: "Item", summary: recipe.description, tags: [recipe.category] },
        l2: { owner: characterName, location: `inventory:${characterName.toLowerCase()}`, quantity: 1, crafted_from: recipe.ingredients.join(" + ") },
        l3: {},
      },
    });
    this._entityStore.add(resultNode);

    return {
      success: true,
      message: `Crafted ${recipe.result} from ${recipe.ingredients.join(" + ")}`,
      result: recipe.result,
    };
  }

  /** Use LLM to suggest creative recipe from two items */
  async suggestRecipe(item1: string, item2: string, worldContext: string): Promise<string> {
    const prompt = PromptBuilder.buildCrafterPrompt(item1, item2, worldContext);
    const response = await this._llmQueue.generateText(prompt, 0, 0.9, "scene");
    return response.trim();
  }

  /** Get all known recipes */
  getRecipes(): Recipe[] {
    return [...this._recipes];
  }

  /** Get recipe by id */
  getRecipe(id: string): Recipe | undefined {
    return this._recipes.find((r) => r.id === id);
  }

  /** Format inventory for display */
  formatInventory(inventory: Map<string, number>): string {
    if (inventory.size === 0) return "Inventory is empty.";
    const lines: string[] = [];
    for (const [name, count] of inventory) {
      lines.push(`  ${count > 1 ? `${count}x ` : ""}${name}`);
    }
    return lines.join("\n");
  }

  /** Format craftable recipes for display */
  formatCraftable(recipes: Recipe[]): string {
    if (recipes.length === 0) return "Nothing to craft with current ingredients.";
    return recipes.map((r) => {
      const ingStr = r.ingredients.join(" + ");
      return `  ${r.name} (${r.nameRu}): ${ingStr} → ${r.result} [${r.difficulty}]`;
    }).join("\n");
  }
}
