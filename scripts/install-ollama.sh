#!/usr/bin/env bash
set -euo pipefail

# Install Ollama — detects OS and architecture automatically

OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Linux)
    echo "Installing Ollama for Linux ($ARCH)..."
    curl -fsSL https://ollama.com/install.sh | sh
    ;;
  Darwin)
    if command -v brew &>/dev/null; then
      echo "Installing Ollama via Homebrew..."
      brew install ollama
    else
      echo "Downloading Ollama for macOS..."
      ARCH_LABEL="$([ "$ARCH" = "arm64" ] && echo "arm64" || echo "amd64")"
      curl -L -o /tmp/ollama.zip "https://ollama.com/download/Ollama-darwin-${ARCH_LABEL}.zip"
      unzip -o /tmp/ollama.zip -d /Applications/
      rm -f /tmp/ollama.zip
      echo "Ollama installed to /Applications/Ollama.app"
    fi
    ;;
  *)
    echo "Unsupported OS: $OS"
    echo "Download manually: https://ollama.com/download"
    exit 1
    ;;
esac

echo "Done. Ollama version: $(ollama --version 2>/dev/null || echo 'installed')"
