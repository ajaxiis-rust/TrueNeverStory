#!/usr/bin/env bun
/**
 * sync-version.ts — Sync version from package.json across all display files.
 *
 * Usage: bun run scripts/sync-version.ts [--dry-run]
 *
 * Rules:
 * - Source of truth: package.json "version" field
 * - Skips changelog history entries (### vX.Y.Z — ...)
 * - Skips release/ directory
 * - Idempotent (safe to run multiple times)
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dir, "..");
const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));
const CURRENT_VERSION = pkg.version as string;
const DRY_RUN = process.argv.includes("--dry-run");

interface Replacement {
  file: string;
  old: string;
  new: string;
  line: number;
}

const replacements: Replacement[] = [];

function walkDir(dir: string, skip: Set<string> = new Set()): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (skip.has(entry)) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...walkDir(full, skip));
    } else if (stat.isFile()) {
      files.push(full);
    }
  }
  return files;
}

function findOldVersions(content: string): string[] {
  const versions = new Set<string>();
  // Match vX.Y.Z patterns but NOT changelog entries (### vX.Y.Z —)
  const regex = /v(\d+\.\d+\.\d+)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const full = match[0]; // v0.28.0
    const ver = match[1]; // 0.28.0
    if (ver !== CURRENT_VERSION) {
      versions.add(full);
    }
  }
  return [...versions];
}

function isChangelogLine(line: string): boolean {
  // ### vX.Y.Z — description
  if (/^###\s+v\d+\.\d+\.\d+\s+[—–-]/.test(line)) return true;
  // ## vX.Y.Z (date) — changelog section headers
  if (/^##\s+v\d+\.\d+\.\d+\s+\(/.test(line)) return true;
  // (from vX.Y.Z) — inline changelog references
  if (/\(from v\d+\.\d+\.\d+\)/.test(line)) return true;
  return false;
}

function processFile(filePath: string): void {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const oldVersions = findOldVersions(content);

  if (oldVersions.length === 0) return;

  let modified = false;
  const newLines = lines.map((line, i) => {
    // Skip changelog entries
    if (isChangelogLine(line)) return line;

    let newLine = line;
    for (const oldVer of oldVersions) {
      if (newLine.includes(oldVer)) {
        const newVer = "v" + CURRENT_VERSION;
        newLine = newLine.replaceAll(oldVer, newVer);
        replacements.push({
          file: relative(ROOT, filePath),
          old: oldVer,
          new: newVer,
          line: i + 1,
        });
        modified = true;
      }
    }
    return newLine;
  });

  if (modified && !DRY_RUN) {
    writeFileSync(filePath, newLines.join("\n"));
  }
}

// Collect target files
const targetDirs = ["docs"];
const targetFiles = [
  "README.md",
  "COMPILE.md",
  "security.md",
  ".env.example",
  "startgame.sh",
  "build.sh",
];

console.log(`Syncing version to v${CURRENT_VERSION}${DRY_RUN ? " (dry-run)" : ""}\n`);

// Process root-level files
for (const name of targetFiles) {
  const full = join(ROOT, name);
  try {
    statSync(full);
    processFile(full);
  } catch {
    // file doesn't exist, skip
  }
}

// Process docs/ recursively
for (const dir of targetDirs) {
  const full = join(ROOT, dir);
  try {
    const files = walkDir(full, new Set(["release"]));
    for (const f of files) {
      const name = f.split("/").pop()!;
      // Skip changelog (history, not display) and release artifacts
      if (name === "CHANGELOG.md") continue;
      if (f.endsWith(".md") || f.endsWith(".sh") || f.endsWith(".env")) {
        processFile(f);
      }
    }
  } catch {
    // dir doesn't exist, skip
  }
}

// Report
if (replacements.length === 0) {
  console.log("All files already at v" + CURRENT_VERSION);
} else {
  console.log(`Updated ${replacements.length} references:\n`);
  for (const r of replacements) {
    console.log(`  ${r.file}:${r.line}  ${r.old} → ${r.new}`);
  }
}
