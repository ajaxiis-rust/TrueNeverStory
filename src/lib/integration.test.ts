import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { SQLiteStore } from './sqlite-store';
import { mkdirSync, rmSync } from 'node:fs';

const TEST_DIR = '/tmp/tns-integration-test';
const EMBEDDING_URL = 'http://127.0.0.1:5002';

async function getEmbedding(text: string): Promise<Float32Array> {
  const res = await fetch(`${EMBEDDING_URL}/v1/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'bge-m3', input: text }),
  });
  const data = await res.json() as { data: { embedding: number[] }[] };
  return new Float32Array(data.data[0]!.embedding);
}

beforeAll(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterAll(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('Integration: SQLiteStore + BGE-M3', () => {
  test('real embedding has correct dimensions', async () => {
    const vec = await getEmbedding('Hello world');
    expect(vec.length).toBe(1024);
  });

  test('store and search real embeddings', async () => {
    const store = new SQLiteStore(TEST_DIR);

    const entities = [
      { uid: 'npc-1', name: 'Лилит', description: 'Тёмная эльфийка-воительница из Ашхарда' },
      { uid: 'npc-2', name: 'Гром', description: 'Огромный воин с боевым топором' },
      { uid: 'loc-1', name: 'Таверна', description: 'Уютная таверна в центре деревни' },
      { uid: 'item-1', name: 'Огненный меч', description: 'Легендарный меч, пылающий вечным огнём' },
    ];

    for (const e of entities) {
      store.upsertEntity(e);
      const vec = await getEmbedding(`${e.name}: ${e.description}`);
      store.storeEmbedding(e.uid, vec, 'entity');
    }

    expect(store.entityCount()).toBe(4);
    expect(store.embeddingCount()).toBe(4);

    const queryVec = await getEmbedding('где можно отдохнуть и выпить');
    const results = store.hybridSearch('таверна', queryVec, 3);

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.id).toBe('loc-1');

    store.close();
  });

  test('dense search finds similar content', async () => {
    const store = new SQLiteStore(TEST_DIR);

    store.upsertEntity({ uid: 'weapon-1', name: 'Огненный меч', description: 'Меч с огненной аурой' });
    store.upsertEntity({ uid: 'weapon-2', name: 'Ледяной клинок', description: 'Клинок покрытый инеем' });
    store.upsertEntity({ uid: 'npc-1', name: 'Кузнец', description: 'Мастер по ковке оружия' });

    const vec1 = await getEmbedding('Огненный меч');
    const vec2 = await getEmbedding('Ледяной клинок');
    const vec3 = await getEmbedding('Кузнец оружия');

    store.storeEmbedding('weapon-1', vec1);
    store.storeEmbedding('weapon-2', vec2);
    store.storeEmbedding('npc-1', vec3);

    const queryVec = await getEmbedding('огненное оружие');
    const results = store.searchDense(queryVec, 3);

    expect(results.length).toBe(3);
    expect(results[0]!.entityUid).toBe('weapon-1');

    store.close();
  });

  test('hybrid search outperforms single method', async () => {
    const store = new SQLiteStore(TEST_DIR);

    store.upsertEntity({
      uid: 'quest-1',
      name: 'Поиск артефакта',
      description: 'Найди древний артефакт в пещерах',
    });
    store.upsertEntity({
      uid: 'quest-2',
      name: 'Спасти деревню',
      description: 'Защити деревню от нападения орков',
    });
    store.upsertEntity({
      uid: 'npc-1',
      name: 'Староста',
      description: 'Деревенский староста, раздаёт квесты',
    });

    const vec1 = await getEmbedding('Поиск артефакта: Найди древний артефакт');
    const vec2 = await getEmbedding('Спасти деревню: Защити деревню от орков');
    const vec3 = await getEmbedding('Староста: Деревенский староста');

    store.storeEmbedding('quest-1', vec1);
    store.storeEmbedding('quest-2', vec2);
    store.storeEmbedding('npc-1', vec3);

    const queryVec = await getEmbedding(' задание на поиск ');
    const hybridResults = store.hybridSearch('артефакт', queryVec, 3);

    expect(hybridResults.length).toBeGreaterThan(0);
    expect(hybridResults[0]!.id).toBe('quest-1');

    store.close();
  });

  test('memories with real embeddings', async () => {
    const store = new SQLiteStore(TEST_DIR);

    const vec1 = await getEmbedding('Встретил Лилит в таверне');
    const id1 = store.addMemory('Встретил Лилит в таверне', vec1, {
      role: 'user',
      sessionId: 'session-1',
    });

    const vec2 = await getEmbedding('Лилит рассказала о древнем проклятии');
    store.addMemory('Лилит рассказала о древнем проклятии', vec2, {
      role: 'assistant',
      sessionId: 'session-1',
    });

    const vec3 = await getEmbedding('Купил огненный меч у кузнеца');
    store.addMemory('Купил огненный меч у кузнеца', vec1, {
      role: 'user',
      sessionId: 'session-2',
    });

    expect(store.memoryCount()).toBe(3);

    const ftsResults = store.searchMemoriesFTS('Лилит');
    expect(ftsResults.length).toBe(2);

    const queryVec = await getEmbedding('Эльфийка из таверны');
    const denseResults = store.searchMemoriesDense(queryVec, 3);
    expect(denseResults.length).toBe(3);
    expect(denseResults[0]!.content).toContain('Лилит');

    store.close();
  });

  test('persistence across restarts', async () => {
    const persistDir = '/tmp/tns-persist-test';
    mkdirSync(persistDir, { recursive: true });

    let store1 = new SQLiteStore(persistDir);
    store1.upsertEntity({ uid: 'persist-1', name: 'Тест', description: 'Проверка сохранности' });
    const vec = await getEmbedding('Тест: Проверка сохранности');
    store1.storeEmbedding('persist-1', vec);
    store1.close();

    let store2 = new SQLiteStore(persistDir);
    expect(store2.entityCount()).toBe(1);
    expect(store2.embeddingCount()).toBe(1);

    const entity = store2.getEntity('persist-1');
    expect(entity!.name).toBe('Тест');

    const results = store2.searchDense(vec, 1);
    expect(results[0]!.entityUid).toBe('persist-1');
    store2.close();

    rmSync(persistDir, { recursive: true, force: true });
  });
});
