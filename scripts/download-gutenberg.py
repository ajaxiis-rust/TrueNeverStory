#!/usr/bin/env python3
"""
Download Gutenberg BookCorpus dataset from Hugging Face
and convert to SQLite for the literary-compiler MCP parser.

Dataset: incredible45/Gutenberg-BookCorpus-Cleaned-Data-English
Format: parquet -> SQLite (gutenberg.db)
"""

import os
import sys
import time
import sqlite3
import tempfile
import shutil
from pathlib import Path

# ─── Config ──────────────────────────────────────────────────────────────────

DATASET_ID = "incredible45/Gutenberg-BookCorpus-Cleaned-Data-English"
DATA_DIR = Path(__file__).parent.parent / "data" / "gutenberg"
DB_PATH = DATA_DIR / "gutenberg.db"
BATCH_SIZE = 1000

# ─── Main ────────────────────────────────────────────────────────────────────

def ensure_deps():
    """Check and install required Python packages."""
    try:
        import pyarrow.parquet
        import huggingface_hub
    except ImportError:
        print("Installing dependencies...")
        os.system(f"{sys.executable} -m pip install -q pyarrow huggingface_hub datasets")


def download_parquet_files(cache_dir: str) -> list[str]:
    """Download parquet files from Hugging Face."""
    from huggingface_hub import snapshot_download

    print(f"Downloading dataset {DATASET_ID}...")
    start = time.time()

    path = snapshot_download(
        repo_id=DATASET_ID,
        repo_type="dataset",
        local_dir=cache_dir,
        resume_download=True,
    )

    elapsed = time.time() - start
    print(f"Downloaded in {elapsed:.1f}s -> {path}")

    # Find all parquet files
    parquet_files = []
    for root, dirs, files in os.walk(path):
        for f in files:
            if f.endswith(".parquet"):
                parquet_files.append(os.path.join(root, f))

    print(f"Found {len(parquet_files)} parquet file(s)")
    return parquet_files


def create_sqlite_db(db_path: Path) -> sqlite3.Connection:
    """Create SQLite database with schema matching GutenbergParser expectations."""
    db_path.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(str(db_path))
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA cache_size=-64000")  # 64MB cache

    conn.execute("""
        CREATE TABLE IF NOT EXISTS gutenberg (
            etextno INTEGER PRIMARY KEY,
            book_title TEXT,
            author TEXT,
            issued TEXT,
            context TEXT
        )
    """)

    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_gutenberg_author ON gutenberg(author)
    """)

    conn.commit()
    return conn


def parquet_to_sqlite(parquet_files: list[str], conn: sqlite3.Connection):
    """Stream parquet files into SQLite."""
    import pyarrow.parquet as pq

    total_rows = 0
    start = time.time()

    for pf in parquet_files:
        print(f"Processing {os.path.basename(pf)}...")
        pf_start = time.time()

        # Read in batches to avoid memory issues with large files
        parquet_file = pq.ParquetFile(pf)
        batch_count = 0

        for batch in parquet_file.iter_batches(batch_size=BATCH_SIZE):
            table = batch.to_pydict()
            rows = list(zip(
                table.get("etextno", []),
                table.get("book_title", []),
                table.get("author", []),
                table.get("issued", []),
                table.get("context", []),
            ))

            conn.executemany(
                "INSERT OR IGNORE INTO gutenberg (etextno, book_title, author, issued, context) VALUES (?, ?, ?, ?, ?)",
                rows,
            )

            batch_count += len(rows)
            total_rows += len(rows)

        conn.commit()
        elapsed = time.time() - pf_start
        print(f"  -> {batch_count} rows in {elapsed:.1f}s")

    elapsed = time.time() - start
    print(f"\nTotal: {total_rows} rows in {elapsed:.1f}s")
    return total_rows


def main():
    ensure_deps()

    # Use a temp dir for download, then move to final location
    with tempfile.TemporaryDirectory(prefix="gutenberg_") as tmpdir:
        parquet_files = download_parquet_files(tmpdir)

        if not parquet_files:
            print("ERROR: No parquet files found!")
            sys.exit(1)

        # Create database
        if DB_PATH.exists():
            print(f"Removing existing database: {DB_PATH}")
            DB_PATH.unlink()
            # Also remove WAL/SHM
            for ext in ["-wal", "-shm"]:
                p = DB_PATH.with_suffix(DB_PATH.suffix + ext)
                if p.exists():
                    p.unlink()

        conn = create_sqlite_db(DB_PATH)

        try:
            total = parquet_to_sqlite(parquet_files, conn)

            # Final stats
            count = conn.execute("SELECT COUNT(*) FROM gutenberg").fetchone()[0]
            size_mb = DB_PATH.stat().st_size / (1024 * 1024)
            print(f"\nDatabase ready: {DB_PATH}")
            print(f"  Rows: {count}")
            print(f"  Size: {size_mb:.1f} MB")
            print(f"\nSample entries:")
            for row in conn.execute(
                "SELECT etextno, book_title, author, LENGTH(context) as text_len FROM gutenberg LIMIT 5"
            ):
                print(f"  [{row[0]}] {row[1][:60]} by {row[2]} ({row[3]:,} chars)")
        finally:
            conn.close()


if __name__ == "__main__":
    main()
