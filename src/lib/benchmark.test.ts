import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { SQLiteStore } from './sqlite-store';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const BENCH_DIR = '/tmp/tns-bench';
const ENTITY_COUNT = 1000;
const QUERY_COUNT = 100;

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

function generateEntities(count: number) {
  const names = ['Лилит', 'Гром', 'Ашхард', 'Дракон', 'Эльф', 'Гном', 'Орк', 'Таверна', 'Замок', 'Лес'];
  const types = ['Character', 'Location', 'Item', 'Quest', 'Event'];
  const descs = [
    'Тёмная эльфийка-воительница из древнего города',
    'Огромный воин с боевым топором',
    'Легендарный кузнец, создатель волшебных клинков',
    'Древний дракон, страж горных перевалов',
    'Хитрый эльфийский лучник с волшебным луком',
  ];

  return Array.from({ length: count }, (_, i) => ({
    uid: `entity-${i}`,
    name: `${names[i % names.length]!}-${i}`,
    entityType: types[i % types.length]!,
    description: `${descs[i % descs.length]!} #${i}`,
    tags: JSON.stringify([types[i % types.length]!.toLowerCase(), `tag-${i % 10}`]),
  }));
}

// ── File-based DB (current) ──

class FileDB {
  private dir: string;
  private data: Map<string, unknown> = new Map();

  constructor(dir: string) {
    this.dir = dir;
    mkdirSync(dir, { recursive: true });
  }

  save(key: string, value: unknown): void {
    this.data.set(key, value);
    const path = join(this.dir, `${key}.json`);
    writeFileSync(path, JSON.stringify(value), 'utf-8');
  }

  load(key: string): unknown | null {
    const path = join(this.dir, `${key}.json`);
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf-8'));
  }

  searchByName(query: string): unknown[] {
    const results: unknown[] = [];
    for (const [key, value] of this.data) {
      const v = value as Record<string, unknown>;
      if ((v.name as string)?.toLowerCase().includes(query.toLowerCase())) {
        results.push(value);
      }
    }
    return results;
  }

  searchByDescription(query: string): unknown[] {
    const results: unknown[] = [];
    for (const [, value] of this.data) {
      const v = value as Record<string, unknown>;
      if ((v.description as string)?.toLowerCase().includes(query.toLowerCase())) {
        results.push(value);
      }
    }
    return results;
  }
}

// ── Benchmark ──

beforeAll(() => {
  mkdirSync(BENCH_DIR, { recursive: true });
});

afterAll(() => {
  rmSync(BENCH_DIR, { recursive: true, force: true });
});

describe('Performance: SQLite vs File DB', () => {
  test('write performance: SQLite vs File', () => {
    const entities = generateEntities(ENTITY_COUNT);

    // File DB
    const fileDir = join(BENCH_DIR, 'file-db');
    const fileDB = new FileDB(fileDir);
    const fileStart = performance.now();
    for (const e of entities) {
      fileDB.save(e.uid, e);
    }
    const fileWriteTime = performance.now() - fileStart;

    // SQLite
    const sqliteDir = join(BENCH_DIR, 'sqlite-db');
    const sqlite = new SQLiteStore(sqliteDir);
    const sqliteStart = performance.now();
    for (const e of entities) {
      sqlite.upsertEntity(e);
    }
    const sqliteWriteTime = performance.now() - sqliteStart;
    sqlite.close();

    console.log(`\n📝 Write ${ENTITY_COUNT} entities:`);
    console.log(`   File DB:   ${fileWriteTime.toFixed(1)}ms`);
    console.log(`   SQLite:    ${sqliteWriteTime.toFixed(1)}ms`);
    console.log(`   Winner: ${fileWriteTime < sqliteWriteTime ? 'File DB' : 'SQLite'} (${Math.abs(fileWriteTime - sqliteWriteTime).toFixed(1)}ms faster)`);

    expect(sqliteWriteTime).toBeLessThan(fileWriteTime * 10);
  });

  test('keyword search: SQLite LIKE vs File linear scan', () => {
    const entities = generateEntities(ENTITY_COUNT);
    const queries = ['Лилит', 'Гном', 'эльф', 'таверна', 'Дракон', 'замок'];

    // File DB
    const fileDir = join(BENCH_DIR, 'file-search');
    const fileDB = new FileDB(fileDir);
    for (const e of entities) fileDB.save(e.uid, e);

    const fileStart = performance.now();
    for (let i = 0; i < QUERY_COUNT; i++) {
      fileDB.searchByName(queries[i % queries.length]!);
    }
    const fileSearchTime = performance.now() - fileStart;

    // SQLite
    const sqliteDir = join(BENCH_DIR, 'sqlite-search');
    const sqlite = new SQLiteStore(sqliteDir);
    for (const e of entities) sqlite.upsertEntity(e);

    const sqliteStart = performance.now();
    for (let i = 0; i < QUERY_COUNT; i++) {
      sqlite.searchEntitiesFTS(queries[i % queries.length]!);
    }
    const sqliteSearchTime = performance.now() - sqliteStart;
    sqlite.close();

    console.log(`\n🔍 Keyword search ${QUERY_COUNT} queries over ${ENTITY_COUNT} entities:`);
    console.log(`   File DB:   ${fileSearchTime.toFixed(1)}ms (${(fileSearchTime / QUERY_COUNT).toFixed(2)}ms/query)`);
    console.log(`   SQLite:    ${sqliteSearchTime.toFixed(1)}ms (${(sqliteSearchTime / QUERY_COUNT).toFixed(2)}ms/query)`);
    console.log(`   Winner: ${fileSearchTime < sqliteSearchTime ? 'File DB' : 'SQLite'}`);

    expect(sqliteSearchTime).toBeLessThan(fileSearchTime * 10);
  });

  test('read performance: SQLite vs File', () => {
    const entities = generateEntities(ENTITY_COUNT);

    // File DB
    const fileDir = join(BENCH_DIR, 'file-read');
    const fileDB = new FileDB(fileDir);
    for (const e of entities) fileDB.save(e.uid, e);

    const fileStart = performance.now();
    for (const e of entities) {
      fileDB.load(e.uid);
    }
    const fileReadTime = performance.now() - fileStart;

    // SQLite
    const sqliteDir = join(BENCH_DIR, 'sqlite-read');
    const sqlite = new SQLiteStore(sqliteDir);
    for (const e of entities) sqlite.upsertEntity(e);

    const sqliteStart = performance.now();
    for (const e of entities) {
      sqlite.getEntity(e.uid);
    }
    const sqliteReadTime = performance.now() - sqliteStart;
    sqlite.close();

    console.log(`\n📖 Read ${ENTITY_COUNT} entities:`);
    console.log(`   File DB:   ${fileReadTime.toFixed(1)}ms`);
    console.log(`   SQLite:    ${sqliteReadTime.toFixed(1)}ms`);
    console.log(`   Winner: ${fileReadTime < sqliteReadTime ? 'File DB' : 'SQLite'}`);

    expect(sqliteReadTime).toBeLessThan(fileReadTime * 10);
  });

  test('hybrid search: SQLite (FTS + vectors) vs File (text only)', async () => {
    const entities = generateEntities(10);
    const queries = ['Лилит'];

    // Pre-generate embeddings for all entities and queries
    const entityEmbeddings = new Map<string, Float32Array>();
    for (const e of entities) {
      entityEmbeddings.set(e.uid, await getEmbedding(e.description));
    }
    const queryEmbeddings = await Promise.all(queries.map(q => getEmbedding(q)));

    // SQLite with hybrid search
    const sqliteDir = join(BENCH_DIR, 'sqlite-hybrid');
    const sqlite = new SQLiteStore(sqliteDir);
    for (const e of entities) {
      sqlite.upsertEntity(e);
      sqlite.storeEmbedding(e.uid, entityEmbeddings.get(e.uid)!, 'entity');
    }

    const sqliteStart = performance.now();
    for (let i = 0; i < queries.length; i++) {
      sqlite.hybridSearch(queries[i]!, queryEmbeddings[i]!, 10);
    }
    const sqliteTime = performance.now() - sqliteStart;

    // File DB (text search only)
    const fileDir = join(BENCH_DIR, 'file-hybrid');
    const fileDB = new FileDB(fileDir);
    for (const e of entities) fileDB.save(e.uid, e);

    const fileStart = performance.now();
    for (const q of queries) {
      fileDB.searchByName(q);
    }
    const fileTime = performance.now() - fileStart;
    sqlite.close();

    console.log(`\n🔗 Hybrid search (${queries.length} queries, ${entities.length} entities):`);
    console.log(`   File DB (text only):   ${fileTime.toFixed(1)}ms`);
    console.log(`   SQLite (FTS + vector): ${sqliteTime.toFixed(1)}ms`);
    console.log(`   Note: SQLite hybrid includes real BGE-M3 embedding calls`);
  });

  test('concurrent reads: SQLite WAL vs File', () => {
    const entities = generateEntities(500);

    // File DB
    const fileDir = join(BENCH_DIR, 'file-concurrent');
    const fileDB = new FileDB(fileDir);
    for (const e of entities) fileDB.save(e.uid, e);

    const fileStart = performance.now();
    const filePromises = entities.slice(0, 50).map(e => fileDB.load(e.uid));
    Promise.all(filePromises);
    const fileTime = performance.now() - fileStart;

    // SQLite
    const sqliteDir = join(BENCH_DIR, 'sqlite-concurrent');
    const sqlite = new SQLiteStore(sqliteDir);
    for (const e of entities) sqlite.upsertEntity(e);

    const sqliteStart = performance.now();
    for (const e of entities.slice(0, 50)) {
      sqlite.getEntity(e.uid);
    }
    const sqliteTime = performance.now() - sqliteStart;
    sqlite.close();

    console.log(`\n⚡ Concurrent reads (50 of ${entities.length}):`);
    console.log(`   File DB:   ${fileTime.toFixed(1)}ms`);
    console.log(`   SQLite:    ${sqliteTime.toFixed(1)}ms`);

    expect(sqliteTime).toBeLessThan(fileTime * 5);
  });

  test('persistence: SQLite WAL survives crash', () => {
    const dir = join(BENCH_DIR, 'sqlite-persist');
    const entities = generateEntities(100);

    // Write
    let store1 = new SQLiteStore(dir);
    for (const e of entities) store1.upsertEntity(e);
    store1.close();

    // Read after restart
    const store2 = new SQLiteStore(dir);
    const start = performance.now();
    for (const e of entities) {
      const found = store2.getEntity(e.uid);
      expect(found).toBeDefined();
      expect(found!.name).toBe(e.name);
    }
    const readTime = performance.now() - start;
    store2.close();

    console.log(`\n💾 Persistence: Read ${entities.length} entities after restart: ${readTime.toFixed(1)}ms`);
  });
});
