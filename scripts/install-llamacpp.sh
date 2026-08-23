#!/usr/bin/env bash
set -euo pipefail

# Install llama.cpp binary — downloads pre-built release
# Installs to dist/<arch>/ so startgame.sh finds it automatically

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS-$ARCH" in
  Linux-x86_64)  RELEASE="ubuntu-x64";   DIST_ARCH="linux-x64" ;;
  Linux-aarch64) RELEASE="ubuntu-arm64";  DIST_ARCH="linux-arm64" ;;
  Darwin-arm64)  RELEASE="macos-arm64";   DIST_ARCH="macos-arm64" ;;
  Darwin-x86_64) RELEASE="macos-x64";     DIST_ARCH="macos-x64" ;;
  *)
    echo "Unsupported: $OS $ARCH"
    echo "Build from source: https://github.com/ggml-org/llama.cpp#build"
    exit 1
    ;;
esac

INSTALL_DIR="${PROJECT_DIR}/dist/${DIST_ARCH}"
mkdir -p "$INSTALL_DIR"

echo "Downloading llama.cpp for $RELEASE..."

# Get latest release with actual binaries (skip placeholder releases like v0.2.0)
# Actual releases use build-number tags (b10603), placeholders use semver (v0.2.0)
TAG=$(curl -sL "https://api.github.com/repos/ggml-org/llama.cpp/releases?per_page=10" 2>/dev/null \
  | grep '"tag_name"' | grep -v 'v[0-9]' | head -1 \
  | sed 's/.*"tag_name": *"//;s/".*//' || true)
if [[ -z "$TAG" ]]; then
  echo "ERROR: Could not determine latest llama.cpp release tag"
  echo "Try again later or download manually from: https://github.com/ggml-org/llama.cpp/releases"
  exit 1
fi
echo "Latest release: $TAG"

URL="https://github.com/ggml-org/llama.cpp/releases/download/${TAG}/llama-${TAG}-bin-${RELEASE}.tar.gz"
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

echo "Downloading $URL ..."
curl -fL --progress-bar -o "$TMPDIR/llamacpp.tar.gz" "$URL"
echo "Extracting..."
mkdir -p "$TMPDIR/extracted"
tar xzf "$TMPDIR/llamacpp.tar.gz" -C "$TMPDIR/extracted" --strip-components=1

# Copy binary + shared libs
cp -f "$TMPDIR/extracted/llama-server" "$INSTALL_DIR/llama-server"
cp -f "$TMPDIR/extracted/llama-cli" "$INSTALL_DIR/llama-cli" 2>/dev/null || true
cp -f "$TMPDIR/extracted"/*.so* "$INSTALL_DIR/" 2>/dev/null || true
chmod +x "$INSTALL_DIR/llama-server" "$INSTALL_DIR/llama-cli" 2>/dev/null || true

echo "Done. Installed to: $INSTALL_DIR/llama-server"
echo "llama-server version:"
"$INSTALL_DIR/llama-server" --version 2>&1 | head -1 || true
