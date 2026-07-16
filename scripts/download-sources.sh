#!/bin/bash
set -euo pipefail

# Download Bible sources from scrollmapper/bible_databases
# Usage: bash scripts/download-sources.sh

REPO="scrollmapper/bible_databases"
SRC_DIR="sources/bible"
BASE_URL="https://raw.githubusercontent.com/${REPO}/main"

mkdir -p "$SRC_DIR"

FILES=(
  "BSB.json"
  "LEB.json"
  "NHEBME.json"
  "cross_references_0.json"
  "cross_references_1.json"
  "cross_references_2.json"
  "cross_references_3.json"
  "cross_references_4.json"
  "cross_references_5.json"
  "cross_references_6.json"
)

echo "Downloading Bible sources from ${REPO}..."
echo ""

for f in "${FILES[@]}"; do
  if [ -f "$SRC_DIR/$f" ]; then
    echo "  skip  $f (exists)"
    continue
  fi
  echo "  fetch $f ..."
  curl -fsSL "${BASE_URL}/${f}" -o "$SRC_DIR/$f"
done

echo ""
echo "Done. $(ls "$SRC_DIR"/*.json 2>/dev/null | wc -l) files in $SRC_DIR/"
echo ""
echo "Next step: bun run scripts/bootstrap-bible-db.ts"
