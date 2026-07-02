#!/usr/bin/env bash
set -euo pipefail

# Install llama.cpp binary — downloads pre-built release

OS="$(uname -s)"
ARCH="$(uname -m)"
INSTALL_DIR="/usr/local/bin"

case "$OS-$ARCH" in
  Linux-x86_64)  RELEASE="linux-x64" ;;
  Linux-aarch64) RELEASE="linux-arm64" ;;
  Darwin-arm64)  RELEASE="macos-arm64" ;;
  Darwin-x86_64) RELEASE="macos-x64" ;;
  *)
    echo "Unsupported: $OS $ARCH"
    echo "Build from source: https://github.com/ggerganov/llama.cpp#build"
    exit 1
    ;;
esac

echo "Downloading llama.cpp for $RELEASE..."
TAG=$(curl -sL "https://api.github.com/repos/ggerganov/llama.cpp/releases/latest" | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"//;s/".*//')
URL="https://github.com/ggerganov/llama.cpp/releases/download/${TAG}/llama-${TAG}-bin-${RELEASE}.zip"

curl -L -o /tmp/llamacpp.zip "$URL"
unzip -o /tmp/llamacpp.zip -d /tmp/llamacpp/
cp -f /tmp/llamacpp/llama-server "$INSTALL_DIR/llama-server" 2>/dev/null || true
cp -f /tmp/llamacpp/llama-cli "$INSTALL_DIR/llama-cli" 2>/dev/null || true
chmod +x "$INSTALL_DIR/llama-server" "$INSTALL_DIR/llama-cli" 2>/dev/null || true
rm -rf /tmp/llamacpp /tmp/llamacpp.zip

echo "Done. llama-server: $(which llama-server 2>/dev/null || echo "$INSTALL_DIR/llama-server")"
