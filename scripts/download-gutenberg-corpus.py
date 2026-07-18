#!/usr/bin/env python3
"""
Download Gutenberg BookCorpus via direct HTTP (bypasses xet/2FA) → SQLite.

The HF library's snapshot_download uses xet storage which requires browser 2FA.
Direct resolve/main URLs use legacy LFS — no auth needed for public repos.
"""

import os
import sys
import time
import sqlite3
import requests
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

DATASET_ID = "incredible45/Gutenberg-BookCorpus-Cleaned-Data-English"
BASE_DIR = Path(__file__).resolve().parent.parent / "data" / "mcp"
PARQUET_DIR = BASE_DIR / "gutenberg-bookcorpus"
DB_PATH = BASE_DIR / "gutenberg-bookcorpus.db"
BATCH_SIZE = 2000
MAX_WORKERS = 4
RETRY = 3

CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS gutenberg (
    etextno    INTEGER PRIMARY KEY,
    book_title TEXT,
    author     TEXT,
    issued     TEXT,
    context    TEXT
)
"""


def list_parquet_files():
    """Get file list from HF API tree endpoint (no auth)."""
    r = requests.get(
        f"https://huggingface.co/api/datasets/{DATASET_ID}/tree/main/data",
        timeout=30,
    )
    r.raise_for_status()
    return [f["path"] for f in r.json() if f["path"].endswith(".parquet")]


def download_one(filename: str, dest: Path) -> Path:
    """Download a single parquet via direct resolve URL."""
    url = f"https://huggingface.co/datasets/{DATASET_ID}/resolve/main/{filename}"
    for attempt in range(RETRY):
        try:
            r = requests.get(url, stream=True, timeout=300)
            r.raise_for_status()
            with open(dest, "wb") as f:
                for chunk in r.iter_content(1048576):
                    f.write(chunk)
            return dest
        except Exception as e:
            if attempt < RETRY - 1:
                time.sleep(2 ** attempt)
            else:
                raise


def download_all(files):
    """Download parquet files with 4 workers."""
    PARQUET_DIR.mkdir(parents=True, exist_ok=True)

    print(f"\n[1/2] Downloading {len(files)} parquet files (HTTP, {MAX_WORKERS} workers)...")
    t0 = time.time()
    done = 0
    skipped = 0

    tasks = []
    for fname in files:
        dest = PARQUET_DIR / Path(fname).name
        if dest.exists() and dest.stat().st_size > 10000:
            skipped += 1
            continue
        tasks.append((fname, dest))

    if not tasks:
        print(f"  All {skipped} files already cached")
        return

    print(f"  {skipped} cached, {len(tasks)} to download")

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {pool.submit(download_one, fn, d): (fn, d) for fn, d in tasks}
        for future in as_completed(futures):
            fn, dest = futures[future]
            try:
                future.result()
                mb = dest.stat().st_size / 1048576
                done += 1
                print(f"  [{done}/{len(tasks)}] {dest.name} ({mb:.0f} MB)")
            except Exception as e:
                print(f"  FAILED {fn}: {e}")

    elapsed = time.time() - t0
    total = done + skipped
    print(f"  {done} downloaded + {skipped} cached = {total} files in {elapsed:.0f}s")


def convert():
    """Convert parquet shards → SQLite."""
    import pyarrow.parquet as pq

    parquets = sorted(PARQUET_DIR.glob("*.parquet"))
    if not parquets:
        print("ERROR: No parquet files")
        sys.exit(1)

    print(f"\n[2/2] Converting {len(parquets)} parquets → {DB_PATH.name}...")
    if DB_PATH.exists():
        DB_PATH.unlink()

    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA cache_size=-64000")
    conn.execute(CREATE_TABLE)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_title ON gutenberg(book_title)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_author ON gutenberg(author)")

    total = 0
    t_start = time.time()

    for i, pf in enumerate(parquets):
        t0 = time.time()
        rows = 0
        for batch in pq.ParquetFile(str(pf)).iter_batches(batch_size=BATCH_SIZE):
            d = batch.to_pydict()
            n = len(d["etextno"])
            conn.executemany(
                "INSERT OR IGNORE INTO gutenberg VALUES (?,?,?,?,?)",
                zip(
                    d["etextno"],
                    d["book_title"],
                    d["author"],
                    [str(x) if x else None for x in d["issued"]],
                    d["context"],
                ),
            )
            rows += n
        conn.commit()
        total += rows
        print(f"  [{i+1}/{len(parquets)}] {pf.name}: {rows} rows ({time.time()-t0:.1f}s)")

    conn.execute("ANALYZE")
    conn.commit()
    conn.close()

    db_mb = DB_PATH.stat().st_size / 1048576
    print(f"\n  Done in {time.time()-t_start:.0f}s")
    print(f"  DB: {DB_PATH} ({db_mb:.0f} MB)")
    print(f"  Rows: {total:,}")


if __name__ == "__main__":
    print("=" * 60)
    print("  Gutenberg BookCorpus → SQLite (direct HTTP)")
    print("=" * 60)

    files = list_parquet_files()
    print(f"  Found {len(files)} parquet files")

    download_all(files)
    convert()

    print(f"\n  GutenbergParser usage:")
    print(f"    new GutenbergParser({{")
    print(f"      dbPath: '{DB_PATH}',")
    print(f"      textColumns: {{ title: 'book_title', author: 'author',")
    print(f"                     text: 'context', workId: 'etextno' }}")
    print(f"    }})")
