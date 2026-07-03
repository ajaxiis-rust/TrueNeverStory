/**
 * TrueNeverStory — Full Comparative Benchmark
 * Python vs TypeScript vs TypeScript+SQLite vs Mojo
 */

import {
  cosineSimilarityFull,
  batchCosineFlat,
  flattenBuffers,
  batchAgeDecay,
  batchTax,
  batchWealthSum,
  batchLoyaltyCheck,
  batchRandomRoll,
  rrfFusion,
  batchReputation,
  batchSuccessChance,
  batchRoll,
  getBackend,
} from "./mojo-ffi";
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { existsSync, unlinkSync } from "node:fs";

// ── TS-only implementations ─────────────────────────────────

function tsCosine(a: Float32Array, b: Float32Array): number {
  let dot = 0, nA = 0, nB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    nA += a[i]! * a[i]!;
    nB += b[i]! * b[i]!;
  }
  const d = Math.sqrt(nA) * Math.sqrt(nB);
  return d === 0 ? 0 : dot / d;
}

function tsBatchCosine(q: Float32Array, db: Float32Array[]): number[] {
  return db.map(v => tsCosine(q, v));
}

function tsBatchAgeDecay(health: Float32Array, ages: Int32Array): void {
  for (let i = 0; i < health.length; i++) {
    const age = ages[i]!;
    let f = 0;
    if (age < 20) f = -0.5;
    else if (age < 40) f = 0;
    else if (age < 60) f = 0.3;
    else if (age < 80) f = 0.6;
    else f = 1.0;
    health[i] = Math.max(0, Math.min(1000, health[i]! - 10 * f));
  }
}

function tsRrfFusion(scores: Float32Array, ranks: Int32Array, nLists: number, nItems: number, k: number): Float32Array {
  const out = new Float32Array(nItems);
  for (let i = 0; i < nItems; i++) {
    let s = 0;
    for (let l = 0; l < nLists; l++) s += 1 / (k + ranks[l * nItems + i]! + 1);
    out[i] = s;
  }
  return out;
}

function tsReputation(str: Float32Array, types: Int32Array): Float32Array {
  const out = new Float32Array(str.length);
  for (let i = 0; i < str.length; i++) {
    let s = 0.5;
    const st = str[i]!, t = types[i]!;
    if (t === 0) s += st * 0.1;
    else if (t === 1) s -= st * 0.15;
    else if (t === 3) s += st * 0.05;
    else if (t === 4) s -= st * 0.1;
    out[i] = Math.max(0, Math.min(1, s));
  }
  return out;
}

// ── Helpers ─────────────────────────────────────────────────

const rand = (n: number) => {
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = Math.random();
  return a;
};

const randI = (n: number, max: number) => {
  const a = new Int32Array(n);
  for (let i = 0; i < n; i++) a[i] = Math.floor(Math.random() * max);
  return a;
};

function bench(name: string, fn: () => void, iters = 1000): { name: string; ms: number; ops: number } {
  for (let i = 0; i < 10; i++) fn();
  const t0 = performance.now();
  for (let i = 0; i < iters; i++) fn();
  const ms = performance.now() - t0;
  return { name, ms: Math.round(ms * 10) / 10, ops: Math.round(iters / (ms / 1000)) };
}

// ── SQLite Benchmark ────────────────────────────────────────

function benchSQLite(dim: number, nVectors: number, nQueries: number) {
  const dbPath = join(import.meta.dir, "../.bench_vectors.db");
  if (existsSync(dbPath)) unlinkSync(dbPath);
  const db = new Database(dbPath);

  db.run("CREATE TABLE vectors (id INTEGER PRIMARY KEY, dim INTEGER, vec BLOB)");
  db.run("CREATE INDEX idx_dim ON vectors(dim)");

  // Insert vectors
  const insert = db.prepare("INSERT INTO vectors (dim, vec) VALUES (?, ?)");
  const vectors: Float32Array[] = [];
  for (let i = 0; i < nVectors; i++) {
    const v = rand(dim);
    vectors.push(v);
    insert.run(dim, Buffer.from(v.buffer));
  }

  // Create FTS-like index (just for realistic comparison)
  db.run("CREATE VIRTUAL TABLE IF NOT EXISTS vec_idx USING fts5(content)");

  // Benchmark: SQL WHERE dim=? + fetch + cosine
  const queries = Array.from({ length: nQueries }, () => rand(dim));

  const fn = () => {
    const q = queries[Math.floor(Math.random() * nQueries)]!;
    const rows = db.query("SELECT id, vec FROM vectors WHERE dim = ?").all(dim) as { id: number; vec: Buffer }[];
    let bestScore = -1;
    for (const row of rows) {
      const ab = new ArrayBuffer(row.vec.length);
      new Uint8Array(ab).set(new Uint8Array(row.vec.buffer, row.vec.byteOffset, row.vec.byteLength));
      const v = new Float32Array(ab);
      const score = tsCosine(q, v);
      if (score > bestScore) bestScore = score;
    }
    return bestScore;
  };

  const r = bench(`SQLite search (${nVectors} vecs, ${nQueries} queries)`, fn, 200);

  // Cleanup
  db.close();
  unlinkSync(dbPath);

  return r;
}

function benchSQLiteBatch(dim: number, nVectors: number) {
  const dbPath = join(import.meta.dir, "../.bench_vectors.db");
  if (existsSync(dbPath)) unlinkSync(dbPath);
  const db = new Database(dbPath);

  db.run("CREATE TABLE vectors (id INTEGER PRIMARY KEY, dim INTEGER, vec BLOB)");
  for (let i = 0; i < nVectors; i++) {
    db.run("INSERT INTO vectors (dim, vec) VALUES (?, ?)", [dim, Buffer.from(rand(dim).buffer)]);
  }

  const q = rand(dim);

  const fn = () => {
    const rows = db.query("SELECT vec FROM vectors WHERE dim = ?").all(dim) as { vec: Buffer }[];
    let best = -1;
    for (const row of rows) {
      const ab = new ArrayBuffer(row.vec.length);
      new Uint8Array(ab).set(new Uint8Array(row.vec.buffer, row.vec.byteOffset, row.vec.byteLength));
      const score = tsCosine(q, new Float32Array(ab));
      if (score > best) best = score;
    }
  };

  const r = bench(`SQLite batch (${nVectors} vecs)`, fn, 200);
  db.close();
  unlinkSync(dbPath);
  return r;
}

// ── Main ────────────────────────────────────────────────────

async function main() {
  const dim = 768;
  const nVectors = 100;
  const nNpcs = 100;
  const iters = 1000;

  console.log("═".repeat(80));
  console.log("  Comparative Benchmark: Python vs TS vs TS+SQLite vs Mojo");
  console.log("═".repeat(80));
  console.log(`  Backend: ${getBackend()}`);
  console.log(`  Dimensions: ${dim} | Vectors: ${nVectors} | NPCs: ${nNpcs}`);
  console.log(`  Iterations: ${iters} per test`);
  console.log("");

  const allResults: Record<string, Record<string, { ms: number; ops: number }>> = {
    "TS": {},
    "Mojo": {},
    "TS+SQLite": {},
  };

  // ── 1. Single Vector Cosine ──────────────────────────────
  console.log("── 1. Single Cosine Similarity (768-dim) ─────────────────");
  const a = rand(dim), b = rand(dim);

  const tsCos = bench("TS cosine", () => tsCosine(a, b), iters);
  const mojoCos = bench("Mojo cosine", () => cosineSimilarityFull(a, b), iters);
  allResults["TS"]!["cosine"] = { ms: tsCos.ms, ops: tsCos.ops };
  allResults["Mojo"]!["cosine"] = { ms: mojoCos.ms, ops: mojoCos.ops };

  const speedupCos = (tsCos.ms / mojoCos.ms).toFixed(1);
  console.log(`  TS:   ${tsCos.ms.toFixed(1).padStart(6)}ms  (${tsCos.ops} ops/s)`);
  console.log(`  Mojo: ${mojoCos.ms.toFixed(1).padStart(6)}ms  (${mojoCos.ops} ops/s)  → ${speedupCos}x faster`);
  console.log("");

  // ── 2. Batch Cosine (100×768) ────────────────────────────
  console.log(`── 2. Batch Cosine (${nVectors}×768) ─────────────────────────────`);
  const dbVecs = Array.from({ length: nVectors }, () => rand(dim));
  const flatDb = flattenBuffers(dbVecs.map(v => Buffer.from(v.buffer)), dim);

  const tsBatch = bench("TS batch", () => tsBatchCosine(a, dbVecs), 200);
  const mojoBatch = bench("Mojo batch", () => batchCosineFlat(a, flatDb, nVectors, dim), 200);
  allResults["TS"]!["batch_cosine"] = { ms: tsBatch.ms, ops: tsBatch.ops };
  allResults["Mojo"]!["batch_cosine"] = { ms: mojoBatch.ms, ops: mojoBatch.ops };

  const sqlR = benchSQLiteBatch(dim, nVectors);
  allResults["TS+SQLite"]!["batch_cosine"] = { ms: sqlR.ms, ops: sqlR.ops };

  const speedupBatch = (tsBatch.ms / mojoBatch.ms).toFixed(1);
  const speedupSql = (sqlR.ms / mojoBatch.ms).toFixed(1);
  console.log(`  TS:         ${tsBatch.ms.toFixed(1).padStart(6)}ms  (${tsBatch.ops} ops/s)`);
  console.log(`  Mojo:       ${mojoBatch.ms.toFixed(1).padStart(6)}ms  (${mojoBatch.ops} ops/s)  → ${speedupBatch}x faster`);
  console.log(`  TS+SQLite:  ${sqlR.ms.toFixed(1).padStart(6)}ms  (${sqlR.ops} ops/s)  → ${speedupSql}x vs Mojo`);
  console.log("");

  // ── 3. SQLite Search (100 queries × 100 vectors) ─────────
  console.log("── 3. SQLite Search (100 queries × 100 vectors) ─────────");
  const sqlSearch = benchSQLite(dim, nVectors, 100);
  allResults["TS+SQLite"]!["search_100"] = { ms: sqlSearch.ms, ops: sqlSearch.ops };
  console.log(`  TS+SQLite:  ${sqlSearch.ms.toFixed(1).padStart(6)}ms  (${sqlSearch.ops} ops/s)`);
  console.log("");

  // ── 4. Batch NPC Operations ──────────────────────────────
  console.log(`── 4. Batch NPC Operations (${nNpcs} NPCs) ──────────────────`);

  const health = rand(nNpcs).map(v => v * 1000);
  const ages = randI(nNpcs, 100);

  const tsAge = bench("TS ageDecay", () => {
    const h = health.slice();
    tsBatchAgeDecay(h, ages);
  }, iters);
  const mojoAge = bench("Mojo ageDecay", () => {
    const h = health.slice();
    batchAgeDecay(h, ages, 10);
  }, iters);
  allResults["TS"]!["age_decay"] = { ms: tsAge.ms, ops: tsAge.ops };
  allResults["Mojo"]!["age_decay"] = { ms: mojoAge.ms, ops: mojoAge.ops };

  const speedupAge = (tsAge.ms / mojoAge.ms).toFixed(1);
  console.log(`  TS:   ${tsAge.ms.toFixed(1).padStart(6)}ms  (${tsAge.ops} ops/s)`);
  console.log(`  Mojo: ${mojoAge.ms.toFixed(1).padStart(6)}ms  (${mojoAge.ops} ops/s)  → ${speedupAge}x faster`);
  console.log("");

  // ── 5. Graph Operations ──────────────────────────────────
  console.log("── 5. RRF Fusion (100×3) ─────────────────────────────────");

  const nItems = 100, nLists = 3, k = 60;
  const rrfScores = rand(nLists * nItems);
  const rrfRanks = randI(nLists * nItems, nItems);

  const tsRrf = bench("TS rrf", () => tsRrfFusion(rrfScores, rrfRanks, nLists, nItems, k), iters);
  const mojoRrf = bench("Mojo rrf", () => rrfFusion(rrfScores, rrfRanks, nLists, nItems, k), iters);
  allResults["TS"]!["rrf"] = { ms: tsRrf.ms, ops: tsRrf.ops };
  allResults["Mojo"]!["rrf"] = { ms: mojoRrf.ms, ops: mojoRrf.ops };

  const speedupRrf = (tsRrf.ms / mojoRrf.ms).toFixed(1);
  console.log(`  TS:   ${tsRrf.ms.toFixed(1).padStart(6)}ms  (${tsRrf.ops} ops/s)`);
  console.log(`  Mojo: ${mojoRrf.ms.toFixed(1).padStart(6)}ms  (${mojoRrf.ops} ops/s)  → ${speedupRrf}x faster`);
  console.log("");

  // ── 6. Reputation ────────────────────────────────────────
  console.log("── 6. Reputation (500 rels) ──────────────────────────────");

  const nRels = 500;
  const relStr = rand(nRels);
  const relTypes = randI(nRels, 5);

  const tsRep = bench("TS reputation", () => tsReputation(relStr, relTypes), iters);
  const mojoRep = bench("Mojo reputation", () => batchReputation(relStr, relTypes), iters);
  allResults["TS"]!["reputation"] = { ms: tsRep.ms, ops: tsRep.ops };
  allResults["Mojo"]!["reputation"] = { ms: mojoRep.ms, ops: mojoRep.ops };

  const speedupRep = (tsRep.ms / mojoRep.ms).toFixed(1);
  console.log(`  TS:   ${tsRep.ms.toFixed(1).padStart(6)}ms  (${tsRep.ops} ops/s)`);
  console.log(`  Mojo: ${mojoRep.ms.toFixed(1).padStart(6)}ms  (${mojoRep.ops} ops/s)  → ${speedupRep}x faster`);
  console.log("");

  // ── Summary Table ────────────────────────────────────────
  console.log("═".repeat(80));
  console.log("  SUMMARY (ms per 1000 iterations)");
  console.log("═".repeat(80));
  console.log(
    "  Operation".padEnd(35) +
    "Python".padStart(10) +
    "NumPy".padStart(10) +
    "TS".padStart(10) +
    "TS+SQLite".padStart(12) +
    "Mojo".padStart(10)
  );
  console.log("─".repeat(80));

  // Data from Python run (hardcoded from previous output)
  const pyData: Record<string, number> = {
    "cosine": 3.6,
    "batch_cosine": 35.6,
    "age_decay": 75.6,
    "rrf": 706.1,
    "reputation": 41.9,
  };

  const npData: Record<string, number> = {
    "cosine": 4.8,
    "batch_cosine": 6.1,
    "age_decay": 21.5,
    "rrf": 10.4,
  };

  const ops = ["cosine", "batch_cosine", "age_decay", "rrf", "reputation"];
  for (const op of ops) {
    const py = pyData[op]?.toFixed(1) ?? "-";
    const np = npData[op]?.toFixed(1) ?? "-";
    const ts = allResults["TS"]![op]?.ms.toFixed(1) ?? "-";
    const sql = allResults["TS+SQLite"]![op]?.ms.toFixed(1) ?? "-";
    const mojo = allResults["Mojo"]![op]?.ms.toFixed(1) ?? "-";

    console.log(
      `  ${op.padEnd(33)}${py.padStart(10)}${np.padStart(10)}${ts.padStart(10)}${sql.padStart(12)}${mojo.padStart(10)}`
    );
  }

  console.log("─".repeat(80));
  console.log("  Lower = better. Mojo uses FFI kernels, NumPy uses C extensions.");
  console.log("═".repeat(80));
}

main().catch(console.error);
