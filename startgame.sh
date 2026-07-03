#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

PID_FILE="$SCRIPT_DIR/.server.pid"
BIN="dist/$(uname -m | sed 's/x86_64/linux-x64/;s/aarch64/linux-arm64/')/tns-server"

if [[ -x "$BIN" ]]; then
    MODE="binary"
else
    BIN=""
    MODE="source"
fi

if [[ -f "$PID_FILE" ]]; then
    while read -r old_pid; do
        if kill -0 "$old_pid" 2>/dev/null; then
            echo -e "${CYAN}Killing stale process $old_pid...${NC}"
            kill -9 "$old_pid" 2>/dev/null
        fi
    done < "$PID_FILE"
    rm -f "$PID_FILE"
fi

HOST=$(grep "WORLD_SERVER_HOST" .env 2>/dev/null | cut -d= -f2 || echo "0.0.0.0")
PORT=$(grep "WORLD_SERVER_PORT" .env 2>/dev/null | cut -d= -f2 || echo "8000")

# Read unified LLM config from conf/llm-config.json
LLM_CONFIG="conf/llm-config.json"
if [[ -f "$LLM_CONFIG" ]] && command -v jq &>/dev/null; then
    LLM_PORT=$(jq -r '.llmPort // 5001' "$LLM_CONFIG")
    LLM_THREADS=$(jq -r '.llmThreads // 2' "$LLM_CONFIG")
    LLM_PARALLEL=$(jq -r '.llmParallel // 2' "$LLM_CONFIG")
    LLM_CTX=$(jq -r '.llmCtxSize // 8192' "$LLM_CONFIG")
    EMBED_PORT=$(jq -r '.embedPort // 5002' "$LLM_CONFIG")
    EMBED_MODEL_CFG=$(jq -r '.embedModel // "BGE M3"' "$LLM_CONFIG")
    EMBED_THREADS=$(jq -r '.embedThreads // 1' "$LLM_CONFIG")
    EMBED_CTX=$(jq -r '.embedCtxSize // 8192' "$LLM_CONFIG")
else
    LLM_PORT=$(grep "WORLD_LLM_BASE_URL" .env 2>/dev/null | grep -oP ':\K[0-9]+' || echo "5001")
    LLM_THREADS=2
    LLM_PARALLEL=2
    LLM_CTX=8192
    EMBED_PORT=5002
    EMBED_MODEL_CFG="BGE M3"
    EMBED_THREADS=1
    EMBED_CTX=8192
fi

EXT_IP="$HOST"
if [[ "$HOST" == "0.0.0.0" ]]; then
    EXT_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")
fi

# Read model from conf/settings.json (UI changes) or fallback to .env
SETTINGS_MODEL=""
if [[ -f "conf/settings.json" ]]; then
    SETTINGS_MODEL=$(grep -oP '"llmModel"\s*:\s*"\K[^"]+' conf/settings.json 2>/dev/null || true)
fi
ENV_MODEL=$(grep "WORLD_LLM_MODEL" .env 2>/dev/null | cut -d= -f2 || echo "")
MODEL="${SETTINGS_MODEL:-${ENV_MODEL:-gemma-3-4b-it.Q4_K_M}}"

# Scan downloaded models directories for a matching GGUF file
MODEL_DIRS=("./local-models")
MODEL_PATH=""

for dir in "${MODEL_DIRS[@]}"; do
    [[ -d "$dir" ]] || continue
    # Try exact filename match first (case-insensitive)
    while IFS= read -r -d '' f; do
        MODEL_PATH="$f"
        break 2
    done < <(find "$dir" -maxdepth 1 -iname "${MODEL}.gguf" -type f -print0 2>/dev/null)
    # Try partial match (model name contains part of the setting)
    while IFS= read -r -d '' f; do
        MODEL_PATH="$f"
        break 2
    done < <(find "$dir" -maxdepth 1 -iname "*${MODEL}*" -name "*.gguf" -type f -print0 2>/dev/null)
    # Fallback: find any .gguf file
    while IFS= read -r -d '' f; do
        MODEL_PATH="$f"
        break 2
    done < <(find "$dir" -maxdepth 1 -name "*.gguf" -type f -print0 2>/dev/null)
done

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║       TrueNeverStory v0.12.0 — Game Server     ║${NC}"
echo -e "${BOLD}╠══════════════════════════════════════════╣${NC}"
echo -e "${CYAN}║  Mode:    ${MODE}${NC}"
echo -e "${CYAN}║  URL:     http://${EXT_IP}:${PORT}${NC}"
echo -e "${CYAN}║  Local:   http://localhost:${PORT}${NC}"
echo -e "${CYAN}║  LLM:     llama-server @ :${LLM_PORT}${NC}"
echo -e "${CYAN}║  Embed:   llama-server @ :${EMBED_PORT:-5002}${NC}"
echo -e "${CYAN}║  Model:   ${MODEL}${NC}"
if [[ -n "$MODEL_PATH" ]]; then
    echo -e "${CYAN}║  File:    $(basename "$MODEL_PATH")${NC}"
else
    echo -e "${CYAN}║  File:    (not found)${NC}"
fi
echo -e "${CYAN}║  Ctrl+C:  stop server${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${NC}"
echo ""

LLAMA_BIN="dist/$(uname -m | sed 's/x86_64/linux-x64/;s/aarch64/linux-arm64/')/llama-server"

cleanup() {
    trap '' SIGINT SIGTERM
    echo ""
    echo -e "${GREEN}Shutting down...${NC}"

    # Kill children first, then parents
    for pid in "${PIDS[@]}"; do
        pkill -P "$pid" 2>/dev/null || true
        kill -TERM "$pid" 2>/dev/null || true
    done

    local waited=0
    while (( waited < 5 )); do
        local all_dead=true
        for pid in "${PIDS[@]}"; do
            if kill -0 "$pid" 2>/dev/null; then
                all_dead=false
                break
            fi
        done
        $all_dead && break
        sleep 1
        (( waited++ ))
    done

    for pid in "${PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            pkill -9 -P "$pid" 2>/dev/null || true
            kill -9 "$pid" 2>/dev/null || true
        fi
    done

    rm -f "$PID_FILE"
    exit 0
}

trap cleanup SIGINT SIGTERM EXIT
PIDS=()

if ! ss -tlnp 2>/dev/null | grep -q ":${LLM_PORT} "; then
    if [[ -x "$LLAMA_BIN" && -n "$MODEL_PATH" ]]; then
        echo -e "${CYAN}Starting llama-server on port ${LLM_PORT}...${NC}"
        # --host 0.0.0.0  # reverted: external access disabled for security
        "$LLAMA_BIN" \
            --model "$MODEL_PATH" \
            --host 127.0.0.1 \
            --port "$LLM_PORT" \
            --ctx-size "$LLM_CTX" \
            --threads "$LLM_THREADS" \
            --parallel "$LLM_PARALLEL" &
        PIDS+=($!)
        sleep 3
        if ! kill -0 "${PIDS[-1]}" 2>/dev/null; then
            echo -e "${CYAN}llama-server failed to start${NC}"
            unset 'PIDS[-1]'
        fi
    else
        echo -e "${CYAN}llama-server not found or model missing, expecting external LLM on port ${LLM_PORT}${NC}"
    fi
fi

if [[ -n "$EMBED_PORT" && -n "$EMBED_MODEL_CFG" ]]; then
    if ! ss -tlnp 2>/dev/null | grep -q ":${EMBED_PORT} "; then
        EMBED_PATH=$(find ./local-models -iname "*${EMBED_MODEL_CFG}*" -name "*.gguf" -type f 2>/dev/null | head -1)
        if [[ -x "$LLAMA_BIN" && -n "$EMBED_PATH" ]]; then
            echo -e "${CYAN}Starting embedding server on port ${EMBED_PORT}...${NC}"
            "$LLAMA_BIN" \
                --model "$EMBED_PATH" \
                --host 127.0.0.1 \
                --port "$EMBED_PORT" \
                --ctx-size "$EMBED_CTX" \
                --embedding \
                --pooling mean \
                --threads "$EMBED_THREADS" &
            PIDS+=($!)
            sleep 2
            if ! kill -0 "${PIDS[-1]}" 2>/dev/null; then
                echo -e "${CYAN}embedding server failed to start${NC}"
                unset 'PIDS[-1]'
            fi
        else
            echo -e "${CYAN}Embedding model not found: ${EMBED_MODEL_CFG}${NC}"
        fi
    fi
fi

# Check if LLM is configured
LLM_URL=$(grep "WORLD_LLM_BASE_URL" .env 2>/dev/null | cut -d= -f2 || echo "")
LLM_MODEL=$(grep "WORLD_LLM_MODEL" .env 2>/dev/null | cut -d= -f2 || echo "")

if [[ -z "$LLM_URL" || -z "$LLM_MODEL" ]]; then
    echo ""
    echo -e "${YELLOW}⚠  LLM not configured!${NC}"
    echo -e "${CYAN}   Open http://localhost:${PORT}/settings to configure your LLM provider.${NC}"
    echo -e "${CYAN}   Supported: Ollama, OpenAI, vLLM, LM Studio, or any OpenAI-compatible API.${NC}"
    echo ""
fi

if [[ "$MODE" == "binary" ]]; then
    "$BIN" &
else
    bun run dev &
fi
PIDS+=($!)

printf '%s\n' "${PIDS[@]}" > "$PID_FILE"

for pid in "${PIDS[@]}"; do
    wait "$pid" 2>/dev/null
done
