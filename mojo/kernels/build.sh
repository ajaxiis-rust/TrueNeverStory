#!/bin/bash
# Build C FFI kernels via Zig cross-compilation
# Usage: ./build.sh [target]
# Run ./build.sh without args to list all targets

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SRC_DIR="$SCRIPT_DIR/c"
OUT_DIR="$SCRIPT_DIR/dist"

TARGET="${1:-native}"
mkdir -p "$OUT_DIR"

KERNELS="probability_ffi vector_ffi vector_full batch_ops graph_ops"

# Zig targets: https://ziglang.org/download/0.14.0/zig-linux-x86_64-0.14.0.tar.xz
declare -A TARGETS=(
  # Linux
  ["aarch64-linux"]="aarch64-linux-gnu|.so"
  ["aarch64-linux-musl"]="aarch64-linux-musl|.so"
  ["x86_64-linux"]="x86_64-linux-gnu|.so"
  ["x86_64-linux-musl"]="x86_64-linux-musl|.so"
  ["riscv64-linux"]="riscv64-linux-gnu|.so"
  ["armv7-linux"]="arm-linux-gnueabihf|.so"
  # macOS
  ["aarch64-macos"]="aarch64-macos|.dylib"
  ["x86_64-macos"]="x86_64-macos|.dylib"
  # Windows
  ["x86_64-windows"]="x86_64-windows-gnu|.dll"
  ["aarch64-windows"]="aarch64-windows-gnu|.dll"
  # WASM (for browser/Node)
  ["wasm32"]="wasm32-wasi|.so"
)

if [ "$TARGET" = "list" ] || [ "$TARGET" = "--help" ] || [ "$TARGET" = "-h" ]; then
  echo "Targets:"
  for t in $(echo "${!TARGETS[@]}" | tr ' ' '\n' | sort); do
    echo "  $t"
  done
  echo ""
  echo "Usage: ./build.sh <target>"
  echo "      ./build.sh native   (host compiler, no Zig needed)"
  exit 0
fi

case "$TARGET" in
  native)
    CC="cc"
    CFLAGS="-shared -fPIC -O3"
    LDFLAGS="-lm"
    SUFFIX=".so"
    ;;
  *)
    if [ -z "${TARGETS[$TARGET]+x}" ]; then
      echo "Unknown target: $TARGET"
      echo "Run './build.sh list' to see all targets"
      exit 1
    fi
    IFS='|' read -r ZIG_TARGET SUFFIX <<< "${TARGETS[$TARGET]}"
    CC="zig cc -target $ZIG_TARGET"
    CFLAGS="-shared -fPIC -O3"
    LDFLAGS="-lm"
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
