import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { SQLiteStore } from './sqlite-store';
import { mkdirSync, rmSync } from 'node:fs';

let testDir: string;
let testIdx = 0;

beforeEach(() => {
  testDir = `/tmp/tns-test-${++testIdx}`;
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

describe('SQLiteStore', () => {
  test('creates database and tables', () => {
    const store = new SQLiteStore(testDir);
    expect(store.entityCount()).toBe(0);
    store.close();
  });

  test('upsert and get entity', () => {
    const store = new SQLiteStore(testDir);
    store.upsertEntity({
      uid: 'test-1',
      name: 'Лилит',
      entityType: 'Character',
      summary: 'Тёмная эльфийка',
      tags: '["elf", "dark"]',
      description: 'Древняя воительница из Ашхарда',
      profile: '{"level": 5}',
    });

    const entity = store.getEntity('test-1');
    expect(entity).toBeDefined();
    expect(entity!.name).toBe('Лилит');
    expect(entity!.entityType).toBe('Character');
    expect(store.entityCount()).toBe(1);
    store.close();
  });

  test('upsert updates existing entity', () => {
    const store = new SQLiteStore(testDir);
    store.upsertEntity({ uid: 'test-2', name: 'Original' });
    store.upsertEntity({ uid: 'test-2', name: 'Updated' });

    const entity = store.getEntity('test-2');
    expect(entity!.name).toBe('Updated');
    expect(store.entityCount()).toBe(1);
    store.close();
  });

  test('FTS5 search finds entities', () => {
    const store = new SQLiteStore(testDir);
    store.upsertEntity({
      uid: 'fts-1',
      name: 'Лилит',
      description: 'Эльфийка-воительница',
    });
    store.upsertEntity({
      uid: 'fts-2',
      name: 'Гром',
      description: 'Огромный воин',
    });

    const results = store.searchEntitiesFTS('эльфийка');
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(e => e.uid === 'fts-1')).toBe(true);
    store.close();
  });

  test('FTS5 search is case-insensitive', () => {
    const store = new SQLiteStore(testDir);
    store.upsertEntity({
      uid: 'case-1',
      name: 'Тест',
      description: 'Описание',
    });

    const upper = store.searchEntitiesFTS('ОПИСАНИЕ');
    const lower = store.searchEntitiesFTS('описание');
    expect(upper.length).toBe(lower.length);
    store.close();
  });

  test('FTS5 search handles empty query', () => {
    const store = new SQLiteStore(testDir);
    const results = store.searchEntitiesFTS('');
    expect(results).toEqual([]);
    store.close();
  });

  test('SQL injection is prevented', () => {
    const store = new SQLiteStore(testDir);
    const results = store.searchEntitiesFTS("'; DROP TABLE entities; --");
    expect(results).toEqual([]);
    store.close();
  });

  test('store and search embeddings', () => {
    const store = new SQLiteStore(testDir);
    const vec = new Float32Array([0.1, 0.2, 0.3, 0.4]);
    store.storeEmbedding('test-1', vec, 'entity');

    const results = store.searchDense(new Float32Array([0.1, 0.2, 0.3, 0.4]), 5);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.entityUid).toBe('test-1');
    expect(results[0]!.score).toBeCloseTo(1.0);
    expect(store.embeddingCount()).toBe(1);
    store.close();
  });

  test('dense search ranks by similarity', () => {
    const store = new SQLiteStore(testDir);
    store.storeEmbedding('close', new Float32Array([1, 0, 0]));
    store.storeEmbedding('far', new Float32Array([0, 0, 1]));

    const results = store.searchDense(new Float32Array([1, 0, 0]), 5);
    expect(results[0]!.entityUid).toBe('close');
    expect(results[0]!.score).toBeGreaterThan(results[1]!.score);
    store.close();
  });

  test('hybrid search combines FTS + vector', () => {
    const store = new SQLiteStore(testDir);
    store.upsertEntity({
      uid: 'hybrid-1',
      name: 'Лилит',
      description: 'Тёмная эльфийка',
    });
    store.storeEmbedding('hybrid-1', new Float32Array([0.5, 0.5, 0.5]));

    const results = store.hybridSearch(
      'эльфийка',
      new Float32Array([0.5, 0.5, 0.5]),
      5
    );
    expect(results.length).toBeGreaterThan(0);
    expect(results.some(r => r.id === 'hybrid-1')).toBe(true);
    store.close();
  });

  test('add and search memories', () => {
    const store = new SQLiteStore(testDir);
    const vec = new Float32Array([0.5, 0.5, 0.5, 0.5]);
    const id = store.addMemory('Встретил Лилит в таверне', vec, {
      role: 'user',
      sessionId: 'session-1',
      importance: 0.8,
    });

    expect(id).toBeGreaterThan(0);
    expect(store.memoryCount()).toBe(1);

    const ftsResults = store.searchMemoriesFTS('таверн');
    expect(ftsResults.length).toBeGreaterThan(0);

    const denseResults = store.searchMemoriesDense(new Float32Array([0.5, 0.5, 0.5, 0.5]));
    expect(denseResults.length).toBeGreaterThan(0);
    store.close();
  });

  test('entity count works', () => {
    const store = new SQLiteStore(testDir);
    store.upsertEntity({ uid: 'cnt-1', name: 'A' });
    store.upsertEntity({ uid: 'cnt-2', name: 'B' });
    expect(store.entityCount()).toBe(2);
    store.close();
  });
});
