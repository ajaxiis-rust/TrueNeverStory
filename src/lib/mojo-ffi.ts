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

const PROB_LIB = findSo("libbring_kernels.so");
const VEC_LIB = findSo("libbring_vectors.so");

let probLib: ReturnType<typeof dlopen> | null = null;
let vecLib: ReturnType<typeof dlopen> | null = null;
let useMojoProb = false;
let useMojoVec = false;

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

export function isMojoAvailable(): boolean {
  tryLoadProbLib();
  tryLoadVecLib();
  return useMojoProb || useMojoVec;
}

export function getBackend(): string {
  tryLoadProbLib();
  tryLoadVecLib();
  if (useMojoProb && useMojoVec) return "mojo";
  if (useMojoProb || useMojoVec) return "mojo-partial";
  return "typescript";
}
