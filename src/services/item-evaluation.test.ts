import { describe, test, expect, beforeEach } from 'bun:test';
import { ItemEvaluationService } from './item-evaluation';
import type { LLMQueue } from '@/lib/llm-queue';
import type { Item } from '@/models/item';

const makeItem = (overrides: Partial<Item> = {}): Item => ({
  id: 'item-1',
  name: 'Iron Sword',
  description: 'A sturdy iron sword',
  isUnique: false,
  ...overrides,
});

describe('ItemEvaluationService', () => {
  let service: ItemEvaluationService;
  let llmResponses: string[];

  beforeEach(() => {
    llmResponses = [];
    const llmQueue = {
      generateText: async () => {
        const response = llmResponses.shift() ?? '{"isUnique": false}';
        return response;
      },
    } as unknown as LLMQueue;
    service = new ItemEvaluationService(llmQueue);
  });

  test('evaluate returns ItemEvaluation with historian and researcher results', async () => {
    llmResponses.push(
      '{"isUnique": true, "precedent": "Ancient legendary blade"}',
      '{"isUseful": true, "boostType": "power", "multiplier": 0.05, "targetGroup": "warriors", "reason": "Increases combat damage"}',
    );
    const result = await service.evaluate(makeItem(), 'Ancient wars', 'No magic swords');
    expect(result.itemId).toBe('item-1');
    expect(result.historianResult.isUnique).toBe(true);
    expect(result.historianResult.precedent).toBe('Ancient legendary blade');
    expect(result.researcherResult.isUseful).toBe(true);
    expect(result.researcherResult.boost?.stat).toBe('power');
    expect(result.researcherResult.boost?.multiplier).toBe(0.05);
  });

  test('non-unique item skips researcher evaluation', async () => {
    llmResponses.push('{"isUnique": false, "precedent": "Common weapon"}');
    const result = await service.evaluate(makeItem(), 'History', 'Rules');
    expect(result.historianResult.isUnique).toBe(false);
    expect(result.researcherResult.isUseful).toBe(false);
    expect(result.researcherResult.boost).toBeUndefined();
  });

  test('cache returns same result on second call', async () => {
    llmResponses.push('{"isUnique": false, "precedent": "test"}');
    const item = makeItem();
    const first = await service.evaluate(item, 'History', 'Rules');
    const second = await service.evaluate(item, 'History', 'Rules');
    expect(first).toBe(second); // same reference
    expect(llmResponses).toHaveLength(0); // no additional LLM calls
  });

  test('getCachedEvaluation returns cached result', async () => {
    llmResponses.push('{"isUnique": false, "precedent": "test"}');
    await service.evaluate(makeItem({ id: 'item-2' }), 'History', 'Rules');
    const cached = service.getCachedEvaluation('item-2');
    expect(cached).toBeDefined();
    expect(cached?.itemId).toBe('item-2');
  });

  test('getCachedEvaluation returns undefined for unknown item', () => {
    expect(service.getCachedEvaluation('nonexistent')).toBeUndefined();
  });

  test('clearCache removes all cached evaluations', async () => {
    llmResponses.push('{"isUnique": false, "precedent": "test"}');
    await service.evaluate(makeItem(), 'History', 'Rules');
    service.clearCache();
    expect(service.getCachedEvaluation('item-1')).toBeUndefined();
  });

  test('historian LLM failure → isUnique false, precedent "Evaluation error"', async () => {
    const failLlm = {
      generateText: async () => { throw new Error('LLM failed'); },
    } as unknown as LLMQueue;
    const failService = new ItemEvaluationService(failLlm);
    const result = await failService.evaluate(makeItem(), 'History', 'Rules');
    expect(result.historianResult.isUnique).toBe(false);
    expect(result.historianResult.precedent).toBe('Evaluation error');
    expect(result.researcherResult.isUseful).toBe(false);
  });

  test('researcher LLM failure → isUseful false', async () => {
    let callCount = 0;
    const partialFailLlm = {
      generateText: async () => {
        callCount++;
        if (callCount === 1) return '{"isUnique": true, "precedent": "rare"}';
        throw new Error('Researcher LLM failed');
      },
    } as unknown as LLMQueue;
    const partialService = new ItemEvaluationService(partialFailLlm);
    const result = await partialService.evaluate(makeItem(), 'History', 'Rules');
    expect(result.historianResult.isUnique).toBe(true);
    expect(result.researcherResult.isUseful).toBe(false);
  });

  test('researcher not useful → isUseful false, no boost', async () => {
    llmResponses.push(
      '{"isUnique": true, "precedent": "rare"}',
      '{"isUseful": false}',
    );
    const result = await service.evaluate(makeItem(), 'History', 'Rules');
    expect(result.researcherResult.isUseful).toBe(false);
    expect(result.researcherResult.boost).toBeUndefined();
  });

  test('researcher multiplier clamped to 0.01-0.10', async () => {
    llmResponses.push(
      '{"isUnique": true, "precedent": "rare"}',
      '{"isUseful": true, "boostType": "health", "multiplier": 0.5, "targetGroup": "all", "reason": "test"}',
    );
    const result = await service.evaluate(makeItem(), 'History', 'Rules');
    expect(result.researcherResult.boost?.multiplier).toBe(0.10); // clamped from 0.5
  });
});
