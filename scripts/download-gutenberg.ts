#!/usr/bin/env bun
/**
 * Download Gutenberg BookCorpus from HuggingFace → SQLite.
 *
 * Uses direct HTTP (bypasses xet/2FA) — public repos only.
 * Replaces: download-gutenberg.py + download-gutenberg-corpus.py
 *
 * Usage: bun scripts/download-gutenberg.ts [--dir path] [--db path] [--workers N]
 */

import { readParquet } from "parquet-wasm";
import { tableFromIPC, type Table } from "apache-arrow";
import { Database } from "bun:sqlite";
import { mkdirSync, existsSync, statSync, readdirSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";

// ── Args ──────────────────────────────────────────────────────

const args = process.argv.slice(2);
function flag(name: string, fallback: string): string {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}
const PARQUET_DIR = flag("--dir", "data/mcp/gutenberg-bookcorpus");
const DB_PATH = flag("--db", "data/mcp/gutenberg-bookcorpus.db");
const MAX_WORKERS = parseInt(flag("--workers", "4"), 10);
const BATCH_SIZE = 5000;
const RETRY = 3;

const DATASET_ID = "incredible45/Gutenberg-BookCorpus-Cleaned-Data-English";

// ── Progress ──────────────────────────────────────────────────

const WIDTH = 40;
let lastLineLen = 0;

function progressBar(pct: number, msg: string) {
  const filled = Math.round((pct / 100) * WIDTH);
  const bar = "█".repeat(filled) + "░".repeat(WIDTH - filled);
  const line = `[${bar}] ${pct.toFixed(1)}% | ${msg}`;
  const pad = Math.max(0, lastLineLen - line.length);
  process.stdout.write("\r" + line + " ".repeat(pad));
  lastLineLen = line.length;
}

function clearBar() {
  process.stdout.write("\r" + " ".repeat(lastLineLen + 2) + "\r");
}

// ── Step 1: List parquet files from HF API ────────────────────

async function listParquetFiles(): Promise<string[]> {
  const url = `https://huggingface.co/api/datasets/${DATASET_ID}/tree/main/data`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HF API error: ${res.status} ${res.statusText}`);
  const files = (await res.json()) as Array<{ path: string }>;
  return files.filter((f) => f.path.endsWith(".parquet")).map((f) => f.path);
}

// ── Step 2: Download with concurrency ─────────────────────────

async function downloadOne(filename: string, dest: string): Promise<void> {
  const url = `https://huggingface.co/datasets/${DATASET_ID}/resolve/main/${filename}`;

  for (let attempt = 0; attempt < RETRY; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      await Bun.write(dest, buf);
      return;
    } catch (err) {
      if (attempt < RETRY - 1) {
        await Bun.sleep(1000 * 2 ** attempt);
      } else {
        throw err;
      }
    }
  }
}

async function downloadAll(files: string[]): Promise<number> {
  mkdirSync(PARQUET_DIR, { recursive: true });

  const tasks: Array<{ name: string; dest: string }> = [];
  let skipped = 0;

  for (const fname of files) {
    const dest = join(PARQUET_DIR, basename(fname));
    if (existsSync(dest) && statSync(dest).size > 10000) {
      skipped++;
      continue;
    }
    tasks.push({ name: fname, dest });
  }

  if (tasks.length === 0) {
    console.log(`  All ${skipped} files already cached`);
    return skipped;
  }

  console.log(`  ${skipped} cached, ${tasks.length} to download (${MAX_WORKERS} workers)`);

  let done = 0;
  const total = tasks.length;

  // Simple concurrency pool
  const executing = new Set<Promise<void>>();

  for (const task of tasks) {
    const p = downloadOne(task.name, task.dest).then(() => {
      executing.delete(p);
      done++;
      const mb = statSync(task.dest).size / 1048576;
      progressBar((done / total) * 100, `${done}/${total} ${basename(task.name)} (${mb.toFixed(0)}MB)`);
    });
    executing.add(p);

    if (executing.size >= MAX_WORKERS) {
      await Promise.race(executing);
    }
  }

  await Promise.all(executing);
  clearBar();

  console.log(`  ${done} downloaded + ${skipped} cached = ${done + skipped} files`);
  return done + skipped;
}

// ── Step 3: Parquet → SQLite ──────────────────────────────────

function convertToSqlite(): void {
  const files = readdirSync(PARQUET_DIR)
    .filter((f) => f.endsWith(".parquet"))
    .sort()
    .map((f) => join(PARQUET_DIR, f));

  if (files.length === 0) {
    console.error(`No parquet files in ${PARQUET_DIR}`);
    process.exit(1);
  }

  console.log(`\n[2/2] Converting ${files.length} parquets → ${basename(DB_PATH)}`);

  const db = new Database(DB_PATH);
  db.exec("PRAGMA journal_mode = OFF");
  db.exec("PRAGMA synchronous = OFF");
  db.exec("PRAGMA cache_size = -64000");
  db.exec("PRAGMA temp_store = MEMORY");
  db.exec("DROP TABLE IF EXISTS gutenberg");
  db.exec(`
    CREATE TABLE gutenberg (
      etextno INTEGER,
      book_title TEXT,
      author TEXT,
      issued TEXT,
      context TEXT
    )
  `);

  const insert = db.prepare(
    "INSERT INTO gutenberg (etextno, book_title, author, issued, context) VALUES (?, ?, ?, ?, ?)",
  );

  let totalRows = 0;
  const t0 = performance.now();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const parquetBytes = readFileSync(file);
    const arrowTable = readParquet(parquetBytes);
    const ipc = arrowTable.intoIPCStream();
    const table: Table = tableFromIPC(ipc);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const batchInsert = db.transaction((rows: any[][]) => {
      for (const row of rows) {
        insert.run(...row);
      }
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let batch: any[][] = [];
    for (let r = 0; r < table.numRows; r++) {
      const row = table.get(r);
      batch.push([
        Number(row.etextno),
        String(row.book_title),
        String(row.author),
        String(row.issued),
        String(row.context),
      ]);
      if (batch.length >= BATCH_SIZE) {
        batchInsert(batch);
        totalRows += batch.length;
        batch = [];
        const elapsed = (performance.now() - t0) / 1000;
        const pct = ((i + r / table.numRows) / files.length) * 100;
        progressBar(pct, `File ${i + 1}/${files.length} | ${totalRows.toLocaleString()} rows`);
      }
    }
    if (batch.length > 0) {
      batchInsert(batch);
      totalRows += batch.length;
    }
  }

  clearBar();
  console.log(`  Creating index...`);
  db.exec("CREATE INDEX idx_etextno ON gutenberg(etextno)");
  console.log(`  Compacting (VACUUM)...`);
  db.exec("VACUUM");

  const elapsed = (performance.now() - t0) / 1000;
  const count = db.query("SELECT COUNT(*) as n FROM gutenberg").get() as { n: number };
  console.log(`  Done: ${count.n.toLocaleString()} rows in ${elapsed.toFixed(1)}s`);
  console.log(`  Output: ${DB_PATH}`);
  db.close();
}

// ── Main ──────────────────────────────────────────────────────

async function main() {
  console.log("=".repeat(60));
  console.log("  Gutenberg BookCorpus → SQLite");
  console.log("=".repeat(60));

  console.log("\n[1/2] Listing parquet files...");
  const files = await listParquetFiles();
  console.log(`  Found ${files.length} parquet files`);

  await downloadAll(files);
  convertToSqlite();
}

main().catch((err) => {
  console.error("\nFATAL:", err);
  process.exit(1);
});
