#!/bin/bash
# Package TNS FFI kernels for distribution
# Creates per-platform archives with TS bindings + compiled binaries

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
FFI_TS="$ROOT_DIR/src/lib/mojo-ffi.ts"
BUILD="$SCRIPT_DIR/build.sh"
OUT_DIR="$SCRIPT_DIR/dist"

mkdir -p "$OUT_DIR"

# All targets to build
TARGETS=(
  aarch64-linux
  x86_64-linux
  aarch64-linux-musl
  x86_64-linux-musl
  aarch64-macos
  x86_64-macos
  x86_64-windows
  aarch64-windows
  armv7-linux
  riscv64-linux
)

echo "=== Building all platforms ==="

for target in "${TARGETS[@]}"; do
  echo ""
  echo "--- $target ---"
  "$BUILD" "$target" 2>&1 | grep -E "^(Building|  lib|Done)" || true
  
  # Determine suffix
  case "$target" in
    *-windows) SUFFIX=".dll" ;;
    *-macos) SUFFIX=".dylib" ;;
    *) SUFFIX=".so" ;;
  esac
  
  # Create package directory
  PKG_DIR="$OUT_DIR/$target"
  mkdir -p "$PKG_DIR"
  
  # Copy binaries with correct names
  for name in libtns_kernels libtns_vectors libtns_vector_full libtns_batch_ops libtns_graph_ops; do
    cp "$OUT_DIR/${name}${SUFFIX}" "$PKG_DIR/" 2>/dev/null || true
  done
  
  # Copy TS bindings
  cp "$FFI_TS" "$PKG_DIR/mojo-ffi.ts"
  
  # Create tarball
  tar -czf "$OUT_DIR/tns-ffi-${target}.tar.gz" -C "$PKG_DIR" .
  
  # Get size
  SIZE=$(du -h "$OUT_DIR/tns-ffi-${target}.tar.gz" | cut -f1)
  echo "  Package: tns-ffi-${target}.tar.gz ($SIZE)"
done

# Cleanup intermediate files
rm -rf "$OUT_DIR/lib"*.so "$OUT_DIR/lib"*.dylib "$OUT_DIR/lib"*.dll

echo ""
echo "=== Done ==="
echo "Packages in $OUT_DIR/"
ls -lh "$OUT_DIR"/tns-ffi-*.tar.gz
