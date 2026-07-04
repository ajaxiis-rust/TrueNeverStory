#!/bin/bash
# Build Mojo FFI kernels as C shared libraries
# Usage: ./build.sh [target]
# Targets: native (default), aarch64-linux, x86_64-linux, aarch64-macos, x86_64-macos

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC_DIR="$SCRIPT_DIR/c"
OUT_DIR="$SCRIPT_DIR/dist"

TARGET="${1:-native}"
mkdir -p "$OUT_DIR"

KERNELS="probability_ffi vector_ffi vector_full batch_ops graph_ops"

case "$TARGET" in
  native)
    CC="cc"
    CFLAGS="-shared -fPIC -O3"
    LDFLAGS="-lm"
    SUFFIX=".so"
    ;;
  aarch64-linux)
    CC="zig cc -target aarch64-linux-gnu"
    CFLAGS="-shared -fPIC -O3"
    LDFLAGS="-lm"
    SUFFIX=".so"
    ;;
  x86_64-linux)
    CC="zig cc -target x86_64-linux-gnu"
    CFLAGS="-shared -fPIC -O3"
    LDFLAGS="-lm"
    SUFFIX=".so"
    ;;
  aarch64-macos)
    CC="zig cc -target aarch64-macos"
    CFLAGS="-shared -fPIC -O3"
    LDFLAGS="-lm"
    SUFFIX=".dylib"
    ;;
  x86_64-macos)
    CC="zig cc -target x86_64-macos"
    CFLAGS="-shared -fPIC -O3"
    LDFLAGS="-lm"
    SUFFIX=".dylib"
    ;;
  *)
    echo "Unknown target: $TARGET"
    echo "Targets: native, aarch64-linux, x86_64-linux, aarch64-macos, x86_64-macos"
    exit 1
    ;;
esac

echo "Building for: $TARGET"
echo "Compiler: $CC"

for kernel in $KERNELS; do
  echo "  $kernel$SUFFIX"
  $CC $CFLAGS -o "$OUT_DIR/lib$kernel$SUFFIX" "$SRC_DIR/$kernel.c" $LDFLAGS
done

echo "Done. Output in $OUT_DIR/"
ls -lh "$OUT_DIR/"
