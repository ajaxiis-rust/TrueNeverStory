/**
 * TrueNeverStory v3 — Mojo FFI Bindings with TypeScript Fallback
 * Calls Mojo compute kernels via Bun FFI when available,
 * falls back to pure TypeScript implementations otherwise.
 */

import { dlopen, FFIType } from "bun:ffi";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { homedir } from "node:os";

const distDir = join(import.meta.dir, "../../dist");

function findSo(name: string): string {
  // 1. Same directory as binary (distribution layout)
  const binDir = join(process.execPath, "..");
  const binPath = join(binDir, name);
  if (existsSync(binPath)) return binPath;

  // 2. CWD
  const cwdPath = join(process.cwd(), name);
  if (existsSync(cwdPath)) return cwdPath;

  // 3. CWD/lib/
  const cwdLibPath = join(process.cwd(), "lib", name);
  if (existsSync(cwdLibPath)) return cwdLibPath;

  // 4. Source tree (dev mode): dist/<platform>/
  const platform = process.platform === "win32" ? "windows-x64"
    : process.platform === "darwin" ? (process.arch === "arm64" ? "macos-arm64" : "macos-x64")
    : process.arch === "arm64" ? "linux-arm64"
    : "linux-x64";

  const platformPath = join(distDir, platform, name);
  if (existsSync(platformPath)) return platformPath;

  // 5. dist/ root
  const rootPath = join(distDir, name);
  if (existsSync(rootPath)) return rootPath;

  return binPath; // Will fail gracefully
}

const PROB_LIB = findSo("libtns_kernels.so");
const VEC_LIB = findSo("libtns_vectors.so");
const VEC_FULL_LIB = findSo("libtns_vector_full.so");
const BATCH_LIB = findSo("libtns_batch_ops.so");
const GRAPH_LIB = findSo("libtns_graph_ops.so");

let probLib: ReturnType<typeof dlopen> | null = null;
let vecLib: ReturnType<typeof dlopen> | null = null;
let vecFullLib: ReturnType<typeof dlopen> | null = null;
let batchLib: ReturnType<typeof dlopen> | null = null;
let graphLib: ReturnType<typeof dlopen> | null = null;
let useMojoProb = false;
let useMojoVec = false;
let useMojoVecFull = false;
let useMojoBatch = false;
let useMojoGraph = false;

function tryLoadProbLib() {
  if (probLib) return probLib;
  try {
    if (!existsSync(PROB_LIB)) return null;
    probLib = dlopen(PROB_LIB, {
      bring_compute_success_chance: {
        args: [FFIType.float, FFIType.float, FFIType.float, FFIType.float],
        returns: FFIType.float,
      },
      bring_roll_outcome: {
        args: [FFIType.float, FFIType.float],
        returns: FFIType.int,
      },
      bring_compute_modifier: {
        args: [FFIType.float, FFIType.int, FFIType.float],
        returns: FFIType.float,
      },
    });
    useMojoProb = true;
    return probLib;
  } catch {
    return null;
  }
}

function tryLoadVecLib() {
  if (vecLib) return vecLib;
  try {
    if (!existsSync(VEC_LIB)) return null;
    vecLib = dlopen(VEC_LIB, {
      bring_cosine_similarity: {
        args: [
          FFIType.float, FFIType.float, FFIType.float, FFIType.float,
          FFIType.float, FFIType.float, FFIType.float, FFIType.float,
        ],
        returns: FFIType.float,
      },
      bring_l2_distance: {
        args: [
          FFIType.float, FFIType.float, FFIType.float, FFIType.float,
          FFIType.float, FFIType.float, FFIType.float, FFIType.float,
        ],
        returns: FFIType.float,
      },
      bring_dot_product: {
        args: [
          FFIType.float, FFIType.float, FFIType.float, FFIType.float,
          FFIType.float, FFIType.float, FFIType.float, FFIType.float,
        ],
        returns: FFIType.float,
      },
    });
    useMojoVec = true;
    return vecLib;
  } catch {
    return null;
  }
}

function tryLoadVecFullLib() {
  if (vecFullLib) return vecFullLib;
  try {
    if (!existsSync(VEC_FULL_LIB)) return null;
    vecFullLib = dlopen(VEC_FULL_LIB, {
      bring_cosine_similarity_full: {
        args: [FFIType.ptr, FFIType.ptr, FFIType.int],
        returns: FFIType.float,
      },
      bring_l2_distance_full: {
        args: [FFIType.ptr, FFIType.ptr, FFIType.int],
        returns: FFIType.float,
      },
      bring_dot_product_full: {
        args: [FFIType.ptr, FFIType.ptr, FFIType.int],
        returns: FFIType.float,
      },
      bring_batch_cosine: {
        args: [FFIType.ptr, FFIType.ptr, FFIType.int, FFIType.int, FFIType.ptr],
        returns: FFIType.void,
      },
    });
    useMojoVecFull = true;
    return vecFullLib;
  } catch {
    return null;
  }
}

function tryLoadBatchLib() {
  if (batchLib) return batchLib;
  try {
    if (!existsSync(BATCH_LIB)) return null;
    batchLib = dlopen(BATCH_LIB, {
      bring_batch_age_decay: {
        args: [FFIType.ptr, FFIType.ptr, FFIType.int, FFIType.float],
        returns: FFIType.void,
      },
      bring_batch_vice_decay: {
        args: [FFIType.ptr, FFIType.ptr, FFIType.int, FFIType.int, FFIType.int],
        returns: FFIType.void,
      },
      bring_batch_tax: {
        args: [FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.int],
        returns: FFIType.void,
      },
      bring_batch_wealth_sum: {
        args: [FFIType.ptr, FFIType.int],
        returns: FFIType.float,
      },
      bring_batch_loyalty_check: {
        args: [FFIType.ptr, FFIType.float, FFIType.int, FFIType.ptr],
        returns: FFIType.void,
      },
      bring_batch_random_roll: {
        args: [FFIType.ptr, FFIType.int, FFIType.ptr],
        returns: FFIType.void,
      },
    });
    useMojoBatch = true;
    return batchLib;
  } catch {
    return null;
  }
}

function tryLoadGraphLib() {
  if (graphLib) return graphLib;
  try {
    if (!existsSync(GRAPH_LIB)) return null;
    graphLib = dlopen(GRAPH_LIB, {
      bring_rrf_fusion: {
        args: [FFIType.ptr, FFIType.ptr, FFIType.int, FFIType.int, FFIType.int, FFIType.ptr],
        returns: FFIType.void,
      },
      bring_batch_relationship_strength: {
        args: [FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.int, FFIType.int, FFIType.ptr, FFIType.ptr],
        returns: FFIType.void,
      },
      bring_batch_reputation: {
        args: [FFIType.ptr, FFIType.ptr, FFIType.int, FFIType.ptr],
        returns: FFIType.void,
      },
    });
    useMojoGraph = true;
    return graphLib;
  } catch {
    return null;
  }
}

// ── TypeScript Fallbacks ────────────────────────────────────

function tsComputeSuccessChance(skill: number, difficulty: number, luck: number, modSum: number): number {
  let base = skill * (1.0 - difficulty * 0.5);
  base *= 0.7 + luck * 0.3;
  const result = base + modSum;
  if (result < 0.0) return 0.0;
  if (result > 1.0) return 1.0;
  return result;
}

function tsRollOutcome(probability: number, roll: number): number {
  if (roll > probability) {
    if (roll > probability + 0.3) return 0;
    return 1;
  } else {
    if (roll < probability * 0.3) return 4;
    if (roll < probability * 0.6) return 3;
    return 2;
  }
}

function tsComputeModifier(base: number, modType: number, value: number): number {
  if (modType === 0) return base + value;
  if (modType === 1) return base * value;
  if (modType === 2) return value;
  return base;
}

function tsBatchSuccessChance(
  skill: Float32Array,
  difficulty: Float32Array,
  luck: Float32Array,
  modSum: Float32Array,
): Float32Array {
  const out = new Float32Array(skill.length);
  for (let i = 0; i < skill.length; i++) {
    let base = skill[i]! * (1 - difficulty[i]! * 0.5);
    base *= 0.7 + luck[i]! * 0.3;
    const result = base + modSum[i]!;
    out[i] = Math.max(0, Math.min(1, result));
  }
  return out;
}

function tsBatchRoll(probability: Float32Array, roll: Float32Array): Int32Array {
  const out = new Int32Array(probability.length);
  for (let i = 0; i < probability.length; i++) {
    const prob = probability[i]!;
    const r = roll[i]!;
    if (r > prob) {
      out[i] = r > prob + 0.3 ? 0 : 1;
    } else {
      if (r < prob * 0.3) out[i] = 4;
      else if (r < prob * 0.6) out[i] = 3;
      else out[i] = 2;
    }
  }
  return out;
}

function tsCosineSimilarity4(
  a: [number, number, number, number],
  b: [number, number, number, number],
): number {
  const dot = a[0]*b[0] + a[1]*b[1] + a[2]*b[2] + a[3]*b[3];
  const normA = a[0]*a[0] + a[1]*a[1] + a[2]*a[2] + a[3]*a[3];
  const normB = b[0]*b[0] + b[1]*b[1] + b[2]*b[2] + b[3]*b[3];
  if (normA === 0 || normB === 0) return 0;
  return dot / Math.sqrt(normA * normB);
}

function tsL2Distance4(
  a: [number, number, number, number],
  b: [number, number, number, number],
): number {
  const d0 = a[0]-b[0], d1 = a[1]-b[1], d2 = a[2]-b[2], d3 = a[3]-b[3];
  return Math.sqrt(d0*d0 + d1*d1 + d2*d2 + d3*d3);
}

function tsDotProduct4(
  a: [number, number, number, number],
  b: [number, number, number, number],
): number {
  return a[0]*b[0] + a[1]*b[1] + a[2]*b[2] + a[3]*b[3];
}

function tsCosineSimilarityFull(a: Float32Array, b: Float32Array): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function tsL2DistanceFull(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i]! - b[i]!;
    sum += d * d;
  }
  return Math.sqrt(sum);
}

function tsDotProductFull(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
  }
  return dot;
}

function tsBatchCosineSimilarity(
  query: Float32Array,
  db: Float32Array[],
  dim: number,
): number[] {
  return db.map(vec => tsCosineSimilarityFull(query, vec));
}

function tsBatchAgeDecay(health: Float32Array, ages: Int32Array, decayRate: number): void {
  for (let i = 0; i < health.length; i++) {
    const age = ages[i]!;
    let factor = 0;
    if (age < 20) factor = -0.5;
    else if (age < 40) factor = 0;
    else if (age < 60) factor = 0.3;
    else if (age < 80) factor = 0.6;
    else factor = 1.0;
    health[i] = Math.max(0, Math.min(1000, health[i] - decayRate * factor));
  }
}

function tsBatchViceDecay(
  stats: Float32Array,
  vices: Float32Array,
  nStats: number,
  nVices: number,
): void {
  const n = stats.length / nStats;
  for (let i = 0; i < n; i++) {
    for (let s = 0; s < nStats; s++) {
      let totalDecay = 0;
      for (let v = 0; v < nVices; v++) {
        totalDecay += vices[i * nVices + v]! * 0.01;
      }
      stats[i * nStats + s] = Math.max(0, stats[i * nStats + s] - totalDecay);
    }
  }
}

function tsBatchTax(income: Float32Array, taxRate: Float32Array): Float32Array {
  const out = new Float32Array(income.length);
  for (let i = 0; i < income.length; i++) {
    out[i] = Math.floor(income[i]! * taxRate[i]!);
  }
  return out;
}

function tsBatchWealthSum(wealth: Float32Array): number {
  let total = 0;
  for (let i = 0; i < wealth.length; i++) {
    total += wealth[i]!;
  }
  return total;
}

function tsBatchLoyaltyCheck(loyalty: Float32Array, threshold: number): Int32Array {
  const out = new Int32Array(loyalty.length);
  for (let i = 0; i < loyalty.length; i++) {
    out[i] = loyalty[i]! < threshold ? 1 : 0;
  }
  return out;
}

function tsBatchRandomRoll(probabilities: Float32Array): Int32Array {
  const out = new Int32Array(probabilities.length);
  for (let i = 0; i < probabilities.length; i++) {
    out[i] = Math.random() < probabilities[i]! ? 1 : 0;
  }
  return out;
}

function tsRrfFusion(
  scores: Float32Array,
  ranks: Int32Array,
  nLists: number,
  nItems: number,
  k: number,
): Float32Array {
  const out = new Float32Array(nItems);
  for (let i = 0; i < nItems; i++) {
    let rrfScore = 0;
    for (let l = 0; l < nLists; l++) {
      const rank = ranks[l * nItems + i]!;
      rrfScore += 1 / (k + rank + 1);
    }
    out[i] = rrfScore;
  }
  return out;
}

function tsBatchRelationshipStrength(
  srcUids: Int32Array,
  tgtUids: Int32Array,
  strengths: Float32Array,
  querySrc: number,
): { strengths: Float32Array; count: number } {
  const result: number[] = [];
  for (let i = 0; i < srcUids.length; i++) {
    if (srcUids[i] === querySrc) {
      result.push(strengths[i]!);
    }
  }
  return { strengths: new Float32Array(result), count: result.length };
}

function tsBatchReputation(
  relStrengths: Float32Array,
  relTypes: Int32Array,
): Float32Array {
  const out = new Float32Array(relStrengths.length);
  for (let i = 0; i < relStrengths.length; i++) {
    let score = 0.5;
    const strength = relStrengths[i]!;
    const relType = relTypes[i]!;
    if (relType === 0) score += strength * 0.1;
    else if (relType === 1) score -= strength * 0.15;
    else if (relType === 3) score += strength * 0.05;
    else if (relType === 4) score -= strength * 0.1;
    out[i] = Math.max(0, Math.min(1, score));
  }
  return out;
}

// ── Public API (auto-selects Mojo or TypeScript) ────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FfiFn = (...args: any[]) => any;

export function computeSuccessChance(
  skill: number, difficulty: number, luck: number, modSum: number,
): number {
  if (tryLoadProbLib()) {
    return (probLib!.symbols.bring_compute_success_chance as FfiFn)(skill, difficulty, luck, modSum);
  }
  return tsComputeSuccessChance(skill, difficulty, luck, modSum);
}

export function rollOutcome(probability: number, roll: number): number {
  if (tryLoadProbLib()) {
    return (probLib!.symbols.bring_roll_outcome as FfiFn)(probability, roll);
  }
  return tsRollOutcome(probability, roll);
}

export function computeModifier(base: number, modType: number, value: number): number {
  if (tryLoadProbLib()) {
    return (probLib!.symbols.bring_compute_modifier as FfiFn)(base, modType, value);
  }
  return tsComputeModifier(base, modType, value);
}

export function batchSuccessChance(
  skill: Float32Array,
  difficulty: Float32Array,
  luck: Float32Array,
  modSum: Float32Array,
): Float32Array {
  return tsBatchSuccessChance(skill, difficulty, luck, modSum);
}

export function batchRoll(probability: Float32Array, roll: Float32Array): Int32Array {
  return tsBatchRoll(probability, roll);
}

export function cosineSimilarity4(
  a: [number, number, number, number],
  b: [number, number, number, number],
): number {
  if (tryLoadVecLib()) {
    return (vecLib!.symbols.bring_cosine_similarity as FfiFn)(a[0], a[1], a[2], a[3], b[0], b[1], b[2], b[3]);
  }
  return tsCosineSimilarity4(a, b);
}

export function l2Distance4(
  a: [number, number, number, number],
  b: [number, number, number, number],
): number {
  if (tryLoadVecLib()) {
    return (vecLib!.symbols.bring_l2_distance as FfiFn)(a[0], a[1], a[2], a[3], b[0], b[1], b[2], b[3]);
  }
  return tsL2Distance4(a, b);
}

export function dotProduct4(
  a: [number, number, number, number],
  b: [number, number, number, number],
): number {
  if (tryLoadVecLib()) {
    return (vecLib!.symbols.bring_dot_product as FfiFn)(a[0], a[1], a[2], a[3], b[0], b[1], b[2], b[3]);
  }
  return tsDotProduct4(a, b);
}

export function cosineSimilarityFull(a: Float32Array, b: Float32Array): number {
  if (tryLoadVecFullLib()) {
    return (vecFullLib!.symbols.bring_cosine_similarity_full as FfiFn)(a, b, a.length);
  }
  return tsCosineSimilarityFull(a, b);
}

export function l2DistanceFull(a: Float32Array, b: Float32Array): number {
  if (tryLoadVecFullLib()) {
    return (vecFullLib!.symbols.bring_l2_distance_full as FfiFn)(a, b, a.length);
  }
  return tsL2DistanceFull(a, b);
}

export function dotProductFull(a: Float32Array, b: Float32Array): number {
  if (tryLoadVecFullLib()) {
    return (vecFullLib!.symbols.bring_dot_product_full as FfiFn)(a, b, a.length);
  }
  return tsDotProductFull(a, b);
}

export function batchCosineFlat(
  query: Float32Array,
  flatDb: Float32Array,
  nRows: number,
  dim: number,
): number[] {
  if (tryLoadVecFullLib() && nRows > 0) {
    const out = new Float32Array(nRows);
    (vecFullLib!.symbols.bring_batch_cosine as FfiFn)(query, flatDb, nRows, dim, out);
    return Array.from(out);
  }
  // TS fallback: iterate rows in the flat array
  const out = new Array<number>(nRows);
  for (let row = 0; row < nRows; row++) {
    let dot = 0, normA = 0, normB = 0;
    const offset = row * dim;
    for (let d = 0; d < dim; d++) {
      const va = query[d]!;
      const vb = flatDb[offset + d]!;
      dot += va * vb;
      normA += va * va;
      normB += vb * vb;
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    out[row] = denom === 0 ? 0 : dot / denom;
  }
  return out;
}

export function flattenBuffers(buffers: Buffer[], dim: number): Float32Array {
  const flat = new Float32Array(buffers.length * dim);
  for (let i = 0; i < buffers.length; i++) {
    const buf = buffers[i]!;
    const view = new Float32Array(buf.buffer, buf.byteOffset, dim);
    flat.set(view, i * dim);
  }
  return flat;
}

export function batchCosineSimilarity(
  query: Float32Array,
  db: Float32Array[],
  dim: number,
): number[] {
  if (tryLoadVecFullLib()) {
    // Flatten db into a single Float32Array
    const flatDb = new Float32Array(db.length * dim);
    for (let i = 0; i < db.length; i++) {
      flatDb.set(db[i]!, i * dim);
    }
    const out = new Float32Array(db.length);
    (vecFullLib!.symbols.bring_batch_cosine as FfiFn)(query, flatDb, db.length, dim, out);
    return Array.from(out);
  }
  return tsBatchCosineSimilarity(query, db, dim);
}

export function batchAgeDecay(health: Float32Array, ages: Int32Array, decayRate: number): void {
  if (tryLoadBatchLib()) {
    (batchLib!.symbols.bring_batch_age_decay as FfiFn)(health, ages, health.length, decayRate);
    return;
  }
  tsBatchAgeDecay(health, ages, decayRate);
}

export function batchViceDecay(
  stats: Float32Array,
  vices: Float32Array,
  nStats: number,
  nVices: number,
): void {
  if (tryLoadBatchLib()) {
    const n = stats.length / nStats;
    (batchLib!.symbols.bring_batch_vice_decay as FfiFn)(stats, vices, n, nStats, nVices);
    return;
  }
  tsBatchViceDecay(stats, vices, nStats, nVices);
}

export function batchTax(income: Float32Array, taxRate: Float32Array): Float32Array {
  if (tryLoadBatchLib()) {
    const out = new Float32Array(income.length);
    (batchLib!.symbols.bring_batch_tax as FfiFn)(income, taxRate, out, income.length);
    return out;
  }
  return tsBatchTax(income, taxRate);
}

export function batchWealthSum(wealth: Float32Array): number {
  if (tryLoadBatchLib()) {
    return (batchLib!.symbols.bring_batch_wealth_sum as FfiFn)(wealth, wealth.length);
  }
  return tsBatchWealthSum(wealth);
}

export function batchLoyaltyCheck(loyalty: Float32Array, threshold: number): Int32Array {
  if (tryLoadBatchLib()) {
    const out = new Int32Array(loyalty.length);
    (batchLib!.symbols.bring_batch_loyalty_check as FfiFn)(loyalty, threshold, loyalty.length, out);
    return out;
  }
  return tsBatchLoyaltyCheck(loyalty, threshold);
}

export function batchRandomRoll(probabilities: Float32Array): Int32Array {
  if (tryLoadBatchLib()) {
    const out = new Int32Array(probabilities.length);
    (batchLib!.symbols.bring_batch_random_roll as FfiFn)(probabilities, probabilities.length, out);
    return out;
  }
  return tsBatchRandomRoll(probabilities);
}

export function rrfFusion(
  scores: Float32Array,
  ranks: Int32Array,
  nLists: number,
  nItems: number,
  k: number,
): Float32Array {
  if (tryLoadGraphLib()) {
    const out = new Float32Array(nItems);
    (graphLib!.symbols.bring_rrf_fusion as FfiFn)(scores, ranks, nLists, nItems, k, out);
    return out;
  }
  return tsRrfFusion(scores, ranks, nLists, nItems, k);
}

export function batchRelationshipStrength(
  srcUids: Int32Array,
  tgtUids: Int32Array,
  strengths: Float32Array,
  querySrc: number,
): { strengths: Float32Array; count: number } {
  if (tryLoadGraphLib()) {
    const outStrengths = new Float32Array(srcUids.length);
    const outCount = new Int32Array(1);
    (graphLib!.symbols.bring_batch_relationship_strength as FfiFn)(
      srcUids, tgtUids, strengths, srcUids.length, querySrc, outStrengths, outCount
    );
    return {
      strengths: outStrengths.slice(0, outCount[0]!),
      count: outCount[0]!,
    };
  }
  return tsBatchRelationshipStrength(srcUids, tgtUids, strengths, querySrc);
}

export function batchReputation(
  relStrengths: Float32Array,
  relTypes: Int32Array,
): Float32Array {
  if (tryLoadGraphLib()) {
    const out = new Float32Array(relStrengths.length);
    (graphLib!.symbols.bring_batch_reputation as FfiFn)(relStrengths, relTypes, relStrengths.length, out);
    return out;
  }
  return tsBatchReputation(relStrengths, relTypes);
}

export function isMojoAvailable(): boolean {
  tryLoadProbLib();
  tryLoadVecLib();
  tryLoadVecFullLib();
  tryLoadBatchLib();
  tryLoadGraphLib();
  return useMojoProb || useMojoVec || useMojoVecFull || useMojoBatch || useMojoGraph;
}

export function getBackend(): string {
  tryLoadProbLib();
  tryLoadVecLib();
  tryLoadVecFullLib();
  tryLoadBatchLib();
  tryLoadGraphLib();
  if (useMojoProb && useMojoVec && useMojoVecFull && useMojoBatch && useMojoGraph) return "mojo";
  if (useMojoProb || useMojoVec || useMojoVecFull || useMojoBatch || useMojoGraph) return "mojo-partial";
  return "typescript";
}
