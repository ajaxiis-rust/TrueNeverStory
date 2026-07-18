#!/usr/bin/env bun
/**
 * Convert Gutenberg BookCorpus parquet files → SQLite database.
 * Usage: bun scripts/parquet-to-sqlite.ts [--db path] [--dir path]
 */

import { readParquet } from "parquet-wasm";
import { tableFromIPC, type Table } from "apache-arrow";
import { Database } from "bun:sqlite";
import fs from "fs";
import path from "path";

// --- Args ---
const args = process.argv.slice(2);
function flag(name: string, fallback: string): string {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
}
const PARQUET_DIR = flag("--dir", "data/mcp/gutenberg-bookcorpus");
const DB_PATH = flag("--db", "data/mcp/gutenberg-bookcorpus.db");
const BATCH_SIZE = 5000;

// --- Progress bar ---
const WIDTH = 40;
let lastLineLen = 0;

function progressBar(pct: number, fileIdx: number, totalFiles: number, rows: number, speed: number, etaSec: number) {
  const filled = Math.round((pct / 100) * WIDTH);
  const bar = "\u2588".repeat(filled) + "\u2591".repeat(WIDTH - filled);
  const eta = etaSec > 60 ? `${Math.floor(etaSec / 60)}m${Math.round(etaSec % 60)}s` : `${Math.round(etaSec)}s`;
  const line = `[${bar}] ${pct.toFixed(1)}% | File ${fileIdx}/${totalFiles} | ${rows.toLocaleString()} rows | ${Math.round(speed).toLocaleString()} rows/s | ETA ${eta}`;
  const pad = Math.max(0, lastLineLen - line.length);
  process.stdout.write("\r" + line + " ".repeat(pad));
  lastLineLen = line.length;
}

function finishBar(totalRows: number, elapsed: number) {
  process.stdout.write("\r" + " ".repeat(lastLineLen + 2) + "\r");
  console.log(`Done: ${totalRows.toLocaleString()} rows in ${elapsed.toFixed(1)}s (${Math.round(totalRows / elapsed).toLocaleString()} rows/s)`);
  console.log(`Output: ${DB_PATH}`);
}

// --- Main ---
const files = fs.readdirSync(PARQUET_DIR)
  .filter(f => f.endsWith(".parquet"))
  .sort()
  .map(f => path.join(PARQUET_DIR, f));

if (files.length === 0) {
  console.error(`No parquet files in ${PARQUET_DIR}`);
  process.exit(1);
}

console.log(`Converting ${files.length} parquet files → ${DB_PATH}`);

// Create DB with fast-write PRAGMAs
const db = new Database(DB_PATH);
db.exec("PRAGMA journal_mode = OFF");
db.exec("PRAGMA synchronous = OFF");
db.exec("PRAGMA cache_size = -64000"); // 64MB cache
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
  "INSERT INTO gutenberg (etextno, book_title, author, issued, context) VALUES (?, ?, ?, ?, ?)"
);

let totalRows = 0;
const t0 = performance.now();

for (let i = 0; i < files.length; i++) {
  const file = files[i];

  // Read parquet → Arrow
  const parquetBytes = fs.readFileSync(file);
  const arrowTable = readParquet(parquetBytes);
  const ipc = arrowTable.intoIPCStream();
  const table: Table = tableFromIPC(ipc);

  // Batch insert in a single transaction per file
  const batchInsert = db.transaction((rows: any[][]) => {
    for (const row of rows) {
      insert.run(...row);
    }
  });

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
      const speed = totalRows / elapsed;
      const remaining = files.length - i - 1 + (1 - r / table.numRows);
      const eta = (remaining / files.length) * (elapsed / ((i + r / table.numRows) / files.length));
      progressBar(pct, i + 1, files.length, totalRows, speed, Math.max(0, eta));
    }
  }
  if (batch.length > 0) {
    batchInsert(batch);
    totalRows += batch.length;
  }

  // File done
  const elapsed = (performance.now() - t0) / 1000;
  const pct = ((i + 1) / files.length) * 100;
  const speed = totalRows / elapsed;
  progressBar(pct, i + 1, files.length, totalRows, speed, 0);
}

// Create index after all inserts
console.log("\nCreating index...");
db.exec("CREATE INDEX idx_etextno ON gutenberg(etextno)");

// VACUUM to compact
console.log("Compacting (VACUUM)...");
db.exec("VACUUM");

const elapsed = (performance.now() - t0) / 1000;
finishBar(totalRows, elapsed);

// Verify
const count = db.query("SELECT COUNT(*) as n FROM gutenberg").get() as any;
console.log(`Verified: ${count.n.toLocaleString()} rows in DB`);
db.close();
