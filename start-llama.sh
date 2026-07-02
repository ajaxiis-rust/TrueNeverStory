#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

LLM_MODEL="${LLM_MODEL:-local-models/Qwen 2.5 3B (Q4_K_M).gguf}"
EMB_MODEL="${EMB_MODEL:-local-models/BGE M3 (F16).gguf}"

LLM_PORT="${LLM_PORT:-5001}"
EMB_PORT="${EMB_PORT:-5002}"

HOST="${HOST:-127.0.0.1}"

ARCH=$(uname -m)
case "$ARCH" in
    x86_64)  BIN="dist/linux-x64/llama-server" ;;
    aarch64) BIN="dist/linux-arm64/llama-server" ;;
    *)       echo "Unsupported: $ARCH"; exit 1 ;;
esac

[[ -x "$BIN" ]] || { echo "llama-server not found at $BIN"; exit 1; }

PID_FILE="$SCRIPT_DIR/.llama-server.pid"
rm -f "$PID_FILE"

start_server() {
    local name=$1 model=$2 port=$3 extra_args=$4
    echo "Starting $name on ${HOST}:${port}"
    echo "  Model: $model"
    nohup "$BIN" --model "$model" --host "$HOST" --port "$port" \
        --ctx-size 8192 --threads 4 --parallel 2 $extra_args \
        > /dev/null 2>&1 &
    disown
    echo $! >> "$PID_FILE"
}

start_server "LLM" "$LLM_MODEL" "$LLM_PORT" ""
start_server "Embedding" "$EMB_MODEL" "$EMB_PORT" "--embedding"

echo ""
echo "Both servers started. PIDs: $(cat $PID_FILE | tr '\n' ' ')"
echo "  LLM:       http://${HOST}:${LLM_PORT}"
echo "  Embedding: http://${HOST}:${EMB_PORT}"
echo ""
echo "Stop with: ./stopgame.sh"
