/**
 * Item Evaluation — Оценка уникальности предметов через historian/researcher
 */

import type { LLMQueue } from "../lib/llm-queue";
import type { Item, ItemBoost, ItemEvaluation } from "../models/item";
import { getLogger } from "../utils/logger";

const log = getLogger("item-evaluation");

export class ItemEvaluationService {
  private _llmQueue: LLMQueue;
  private _cache: Map<string, ItemEvaluation> = new Map();

  constructor(llmQueue: LLMQueue) {
    this._llmQueue = llmQueue;
  }

  async evaluate(
    item: Item,
    worldHistory: string,
    worldRules: string,
  ): Promise<ItemEvaluation> {
    // Проверяем кэш
    const cached = this._cache.get(item.id);
    if (cached) {
      log.debug({ itemId: item.id }, "Using cached evaluation");
      return cached;
    }

    // Оценка через historian
    const historianResult = await this._evaluateWithHistorian(
      item.name,
      worldHistory,
    );

    // Если уникален, оцениваем через researcher
    let researcherResult: { isUseful: boolean; boost?: ItemBoost } = { isUseful: false };

    if (historianResult.isUnique) {
      researcherResult = await this._evaluateWithResearcher(
        item.name,
        item.description,
        worldRules,
      );
    }

    const evaluation: ItemEvaluation = {
      itemId: item.id,
      evaluatedAt: new Date().toISOString(),
      historianResult,
      researcherResult,
    };

    // Кэшируем
    this._cache.set(item.id, evaluation);

    return evaluation;
  }

  private async _evaluateWithHistorian(
    itemName: string,
    worldHistory: string,
  ): Promise<{ isUnique: boolean; precedent: string }> {
    const prompt = `Оцени уникальность предмета: ${itemName}

История мира:
${worldHistory}

Существовали ли ранее подобные предметы в этом мире?

Ответь ТОЛЬКО JSON без markdown:
{ "isUnique": true/false, "precedent": "описание" }`;

    try {
      const response = await this._llmQueue.generateText(prompt, 0, 0.3, "historian");
      const parsed = JSON.parse(response);
      return {
        isUnique: parsed.isUnique ?? false,
        precedent: parsed.precedent ?? "Неизвестно",
      };
    } catch (err) {
      log.warn({ err, itemName }, "Historian evaluation failed, assuming not unique");
      return { isUnique: false, precedent: "Ошибка оценки" };
    }
  }

  private async _evaluateWithResearcher(
    itemName: string,
    itemDescription: string,
    worldRules: string,
  ): Promise<{ isUseful: boolean; boost?: ItemBoost }> {
    const prompt = `Оцени полезность предмета: ${itemName}
Описание: ${itemDescription}

Правила мира:
${worldRules}

Какую пользу он принесёт? Кому именно будет полезен?

Ответь ТОЛЬКО JSON без markdown:
{
  "isUseful": true/false,
  "boostType": "health|wealth|power|popularity|experience|intrigue",
  "multiplier": 0.05,
  "targetGroup": "описание целевой группы",
  "reason": "причина буста"
}`;

    try {
      const response = await this._llmQueue.generateText(prompt, 0, 0.3, "researcher");
      const parsed = JSON.parse(response);

      if (!parsed.isUseful) {
        return { isUseful: false };
      }

      return {
        isUseful: true,
        boost: {
          stat: parsed.boostType ?? "health",
          multiplier: Math.min(0.10, Math.max(0.01, parsed.multiplier ?? 0.05)),
          targetGroup: parsed.targetGroup,
          reason: parsed.reason ?? "Полезный предмет",
        },
      };
    } catch (err) {
      log.warn({ err, itemName }, "Researcher evaluation failed");
      return { isUseful: false };
    }
  }

  getCachedEvaluation(itemId: string): ItemEvaluation | undefined {
    return this._cache.get(itemId);
  }

  clearCache(): void {
    this._cache.clear();
  }
}
