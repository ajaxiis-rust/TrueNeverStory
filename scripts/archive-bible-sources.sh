#!/bin/bash
set -euo pipefail

SRC_DIR="sources/bible"
ARCHIVE_DIR="$SRC_DIR/archive"

mkdir -p "$ARCHIVE_DIR"

for f in "$SRC_DIR"/*.json; do
  [ -f "$f" ] || continue
  base=$(basename "$f")
  echo "Archiving $base → $base.gz"
  gzip -c "$f" > "$ARCHIVE_DIR/$base.gz"
  rm "$f"
done

echo "Done. Archived $(ls "$ARCHIVE_DIR"/*.gz 2>/dev/null | wc -l) files."
