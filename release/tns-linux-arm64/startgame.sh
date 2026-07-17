#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
#  TrueNeverStory — Smart Auto-detecting Game Server Launcher
#  Detects providers, adapts config, handles fallbacks.
# ═══════════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── Colors ────────────────────────────────────────────────────
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

PID_FILE="$SCRIPT_DIR/.server.pid"
ARCH=$(uname -m | sed 's/x86_64/linux-x64/;s/aarch64/linux-arm64/')
OS_TYPE=$(uname -s)

# macOS arch mapping
if [[ "$OS_TYPE" == "Darwin" ]]; then
    ARCH=$(uname -m | sed 's/x86_64/macos-x64/;s/arm64/macos-arm64/')
fi

# ── Cross-platform helpers ─────────────────────────────────────
port_in_use() {
    local port="$1"
    if command -v ss &>/dev/null; then
        ss -tlnp 2>/dev/null | grep -q ":${port} "
    elif command -v lsof &>/dev/null; then
        lsof -i :"$port" -P -n 2>/dev/null | grep -q LISTEN
    elif command -v netstat &>/dev/null; then
        netstat -an 2>/dev/null | grep -q ":${port}.*LISTEN"
    else
        false
    fi
}

file_size() {
    local path="$1"
    if stat -c%s "$path" 2>/dev/null; then
        return
    fi
    if stat -f%z "$path" 2>/dev/null; then
        return
    fi
    echo 0
}

# ── Parse flags ────────────────────────────────────────────────
MODE_FLAGS="remote"
for arg in "$@"; do
    case "$arg" in
        --local|-l)   MODE_FLAGS="local" ;;
        --remote|-r)  MODE_FLAGS="remote" ;;
        --help|-h)
            echo "Usage: bash startgame.sh [--local|--remote]"
            echo "  --local, -l   CORS=localhost only (safe for dev)"
            echo "  --remote, -r  CORS=* (default, allows external access)"
            exit 0
            ;;
    esac
done

if [[ "$MODE_FLAGS" == "local" ]]; then
    export TNS_CORS_ORIGIN="http://localhost:8000"
else
    export TNS_CORS_ORIGIN="*"
fi

# Auto-create .env from example if missing
if [[ ! -f ".env" && -f ".env.example" ]]; then
    cp .env.example .env
    echo -e "${CYAN}Created .env from .env.example${NC}"
fi

# ═══════════════════════════════════════════════════════════════
#  §1  HARDWARE DETECTION
# ═══════════════════════════════════════════════════════════════

detect_hardware() {
    if command -v nproc &>/dev/null; then
        CPU_CORES=$(nproc)
    elif [[ -f /proc/cpuinfo ]]; then
        CPU_CORES=$(grep -c ^processor /proc/cpuinfo)
    elif command -v sysctl &>/dev/null && sysctl -n hw.ncpu &>/dev/null 2>&1; then
        CPU_CORES=$(sysctl -n hw.ncpu)
    else
        CPU_CORES=2
    fi

    if [[ -f /proc/meminfo ]]; then
        RAM_KB=$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)
        RAM_GB=$(( RAM_KB / 1024 / 1024 ))
    elif command -v sysctl &>/dev/null && sysctl -n hw.memsize &>/dev/null 2>&1; then
        RAM_BYTES=$(sysctl -n hw.memsize)
        RAM_GB=$(( RAM_BYTES / 1024 / 1024 / 1024 ))
    else
        RAM_GB=8
    fi

    GPU_TYPE="none"
    GPU_NAME=""
    GPU_VRAM_MB=0

    if command -v nvidia-smi &>/dev/null; then
        GPU_TYPE="nvidia"
        GPU_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1 || echo "NVIDIA GPU")
        GPU_VRAM_MB=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null | head -1 || echo 0)
    elif [[ "$OS_TYPE" == "Darwin" ]] && [[ "$(uname -m)" == "arm64" ]]; then
        GPU_TYPE="apple"
        GPU_NAME="Apple Silicon (Metal)"
        GPU_VRAM_MB=0
    elif command -v rocm-smi &>/dev/null; then
        GPU_TYPE="amd"
        GPU_NAME="AMD GPU"
    elif [[ -d /dev/dri ]]; then
        GPU_TYPE="intel"
        GPU_NAME="Intel GPU"
    fi

    if [[ "$CPU_CORES" -le 4 ]]; then
        LLM_THREADS=$(( CPU_CORES > 2 ? CPU_CORES - 1 : 1 ))
        LLM_PARALLEL=1
    elif [[ "$CPU_CORES" -le 8 ]]; then
        LLM_THREADS=$(( CPU_CORES - 2 ))
        LLM_PARALLEL=2
    else
        LLM_THREADS=6
        LLM_PARALLEL=3
    fi

    if [[ "$RAM_GB" -le 4 ]]; then
        LLM_CTX=4096
    elif [[ "$RAM_GB" -le 8 ]]; then
        LLM_CTX=8192
    elif [[ "$RAM_GB" -le 16 ]]; then
        LLM_CTX=16384
    else
        LLM_CTX=32768
    fi

    if [[ "$GPU_VRAM_MB" -gt 8000 ]]; then
        LLM_CTX=32768
    elif [[ "$GPU_VRAM_MB" -gt 4000 ]]; then
        LLM_CTX=16384
    fi
}

# ═══════════════════════════════════════════════════════════════
#  §2  PROVIDER DETECTION — discovers what's available
# ═══════════════════════════════════════════════════════════════

BEST_PROVIDER=""
BEST_PROVIDER_URL=""
BEST_PROVIDER_MODEL=""
BEST_PROVIDER_EMBED=""
BEST_PROVIDER_NAME=""
BEST_PROVIDER_TYPE=""
LLAMA_BIN=""

detect_providers() {
    # 1. Check Ollama
    if command -v ollama &>/dev/null; then
        if curl -sf http://localhost:11434/api/tags &>/dev/null 2>&1; then
            local models
            models=$(curl -sf http://localhost:11434/api/tags 2>/dev/null | python3 -c "
import sys,json
try:
    d=json.load(sys.stdin)
    for m in d.get('models',[]):
        print(m['name'])
except: pass
" 2>/dev/null || echo "")

            local chat_model="" embed_model=""
            local best_size=0
            while IFS= read -r m; do
                [[ -z "$m" ]] && continue
                if [[ "$m" == *embed* || "$m" == *Embed* ]]; then
                    [[ -z "$embed_model" ]] && embed_model="$m"
                    continue
                fi
                # Prefer :latest tag
                if [[ "$m" == *:latest ]] && [[ -z "$chat_model" ]]; then
                    chat_model="$m"
                elif [[ -z "$chat_model" ]]; then
                    chat_model="$m"
                fi
            done <<< "$models"

            if [[ -n "$chat_model" ]]; then
                BEST_PROVIDER="ollama"
                BEST_PROVIDER_URL="http://localhost:11434/v1"
                BEST_PROVIDER_MODEL="$chat_model"
                BEST_PROVIDER_EMBED="$embed_model"
                BEST_PROVIDER_NAME="Ollama"
                BEST_PROVIDER_TYPE="openai"
                echo -e "${GREEN}  Found Ollama with model: ${chat_model}${NC}"
            fi
        fi
    fi

    # 2. Check LM Studio (port 1234)
    if [[ -z "$BEST_PROVIDER" ]]; then
        if curl -sf http://localhost:1234/v1/models &>/dev/null 2>&1; then
            local model=""
            model=$(curl -sf http://localhost:1234/v1/models 2>/dev/null | python3 -c "
import sys,json
try:
    d=json.load(sys.stdin)
    models=d.get('data',[])
    if models: print(models[0].get('id',''))
except: pass
" 2>/dev/null || echo "")
            if [[ -n "$model" ]]; then
                BEST_PROVIDER="lmstudio"
                BEST_PROVIDER_URL="http://localhost:1234/v1"
                BEST_PROVIDER_MODEL="$model"
                BEST_PROVIDER_EMBED="$model"
                BEST_PROVIDER_NAME="LM Studio"
                BEST_PROVIDER_TYPE="openai"
                echo -e "${GREEN}  Found LM Studio with model: ${model}${NC}"
            fi
        fi
    fi

    # 3. Check vLLM (port 8000 — but avoid collision with our own server)
    if [[ -z "$BEST_PROVIDER" ]]; then
        if curl -sf http://localhost:8080/v1/models &>/dev/null 2>&1; then
            local model=""
            model=$(curl -sf http://localhost:8080/v1/models 2>/dev/null | python3 -c "
import sys,json
try:
    d=json.load(sys.stdin)
    models=d.get('data',[])
    if models: print(models[0].get('id',''))
except: pass
" 2>/dev/null || echo "")
            if [[ -n "$model" ]]; then
                BEST_PROVIDER="vllm"
                BEST_PROVIDER_URL="http://localhost:8080/v1"
                BEST_PROVIDER_MODEL="$model"
                BEST_PROVIDER_NAME="vLLM"
                BEST_PROVIDER_TYPE="openai"
                echo -e "${GREEN}  Found vLLM with model: ${model}${NC}"
            fi
        fi
    fi

    # 4. Check OpenAI key
    if [[ -z "$BEST_PROVIDER" && -n "${OPENAI_API_KEY:-}" ]]; then
        BEST_PROVIDER="openai"
        BEST_PROVIDER_URL="https://api.openai.com/v1"
        BEST_PROVIDER_MODEL="gpt-4o"
        BEST_PROVIDER_NAME="OpenAI"
        BEST_PROVIDER_TYPE="openai"
        echo -e "${GREEN}  Found OpenAI API key${NC}"
    fi

    # 5. Check llama.cpp binary + local GGUF models
    for candidate in "dist/$ARCH/llama-server" "./llama-server"; do
        if [[ -x "$candidate" ]]; then
            LLAMA_BIN="$candidate"
            break
        fi
    done

    if [[ -z "$BEST_PROVIDER" && -n "$LLAMA_BIN" ]]; then
        local model_path=""
        if [[ -d "./local-models" ]]; then
            # Find best chat model (not embedding-only), prefer larger
            local best_file="" best_bytes=0
            while IFS= read -r -d '' f; do
                local fname
                fname=$(basename "$f")
                # Skip embedding-only models
                if [[ "$fname" == *[Ee]mbed* || "$fname" == *BGE* || "$fname" == *bge* ]]; then
                    continue
                fi
                local fsize
                fsize=$(file_size "$f")
                if [[ "$fsize" -gt "$best_bytes" ]]; then
                    best_bytes="$fsize"
                    best_file="$f"
                fi
            done < <(find ./local-models -maxdepth 1 -name "*.gguf" -type f -print0 2>/dev/null)

            # Fallback: any GGUF if no chat model found
            if [[ -z "$best_file" ]]; then
                best_file=$(find ./local-models -maxdepth 1 -name "*.gguf" -type f 2>/dev/null | head -1 || true)
            fi

            model_path="$best_file"
        fi

        if [[ -n "$model_path" ]]; then
            BEST_PROVIDER="llamacpp"
            BEST_PROVIDER_URL="http://127.0.0.1:5001/v1"
            BEST_PROVIDER_MODEL="$(basename "$model_path")"
            BEST_PROVIDER_NAME="llama.cpp ($ARCH)"
            BEST_PROVIDER_TYPE="llamacpp"
            echo -e "${GREEN}  Found llama.cpp with model: $(basename "$model_path")${NC}"
        fi
    fi
}

# ═══════════════════════════════════════════════════════════════
#  §3  MODEL CONTEXT ADAPTATION
# ═══════════════════════════════════════════════════════════════

adapt_ctx_for_model() {
    local model_name="${1,,}"  # lowercase
    local max_ctx="$LLM_CTX"

    # Known models with limited context windows
    if [[ "$model_name" == *bge* || "$model_name" == *embed* || "$model_name" == *e5* || "$model_name" == *minilm* ]]; then
        max_ctx=8192
    elif [[ "$model_name" == *phi*mini* || "$model_name" == *tiny* || "$model_name" == *phi-2* ]]; then
        max_ctx=4096
    elif [[ "$model_name" == *1b* || "$model_name" == *smollm* || "$model_name" == *0.5b* || "$model_name" == *0.3b* ]]; then
        max_ctx=8192
    elif [[ "$model_name" == *3b* || "$model_name" == *2b* ]]; then
        max_ctx=8192
    fi

    # Never exceed half of RAM (for KV cache + overhead)
    local ram_limit=$(( RAM_GB * 1024 / 2 ))
    if [[ "$max_ctx" -gt "$ram_limit" ]]; then
        max_ctx="$ram_limit"
    fi

    echo "$max_ctx"
}

# ═══════════════════════════════════════════════════════════════
#  §4  AUTO-CONFIGURE .env
# ═══════════════════════════════════════════════════════════════

env_get() {
    local key="$1" default="${2:-}"
    local val=""
    if [[ -f ".env" ]]; then
        val=$(grep "^${key}=" .env 2>/dev/null | cut -d= -f2- || echo "")
    fi
    if [[ -z "$val" ]]; then
        val="$default"
    fi
    echo "$val"
}

write_env_key() {
    local key="$1" value="$2"
    local file=".env"
    if [[ -f "$file" ]] && grep -q "^${key}=" "$file" 2>/dev/null; then
        sed -i "s|^${key}=.*|${key}=${value}|" "$file"
    else
        echo "${key}=${value}" >> "$file"
    fi
}

auto_configure_env() {
    # Skip if user explicitly disabled auto-config
    if [[ "${TNS_NO_AUTOCONFIG:-0}" == "1" ]]; then
        echo -e "${DIM}  Auto-configure disabled (TNS_NO_AUTOCONFIG=1)${NC}"
        return
    fi

    if [[ -z "$BEST_PROVIDER" ]]; then
        echo -e "${YELLOW}  No LLM provider detected — configure manually in Settings${NC}"
        return
    fi

    echo -e "${CYAN}  Configuring for: ${BEST_PROVIDER_NAME}${NC}"

    case "$BEST_PROVIDER" in
        ollama)
            write_env_key "WORLD_LLM_BASE_URL" "$BEST_PROVIDER_URL"
            write_env_key "WORLD_LLM_API_KEY" "ollama"
            write_env_key "WORLD_LLM_MODEL" "$BEST_PROVIDER_MODEL"
            if [[ -n "$BEST_PROVIDER_EMBED" ]]; then
                write_env_key "WORLD_EMBEDDING_MODEL" "$BEST_PROVIDER_EMBED"
                write_env_key "WORLD_EMBEDDING_BASE_URL" "http://localhost:11434/v1"
                write_env_key "WORLD_EMBEDDING_API_KEY" "ollama"
            else
                write_env_key "WORLD_EMBEDDING_MODEL" ""
                write_env_key "WORLD_EMBEDDING_BASE_URL" ""
            fi
            ;;
        lmstudio)
            write_env_key "WORLD_LLM_BASE_URL" "$BEST_PROVIDER_URL"
            write_env_key "WORLD_LLM_API_KEY" "lm-studio"
            write_env_key "WORLD_LLM_MODEL" "$BEST_PROVIDER_MODEL"
            write_env_key "WORLD_EMBEDDING_MODEL" ""
            write_env_key "WORLD_EMBEDDING_BASE_URL" ""
            ;;
        vllm)
            write_env_key "WORLD_LLM_BASE_URL" "$BEST_PROVIDER_URL"
            write_env_key "WORLD_LLM_API_KEY" "vllm"
            write_env_key "WORLD_LLM_MODEL" "$BEST_PROVIDER_MODEL"
            write_env_key "WORLD_EMBEDDING_MODEL" ""
            write_env_key "WORLD_EMBEDDING_BASE_URL" ""
            ;;
        openai)
            write_env_key "WORLD_LLM_BASE_URL" "https://api.openai.com/v1"
            write_env_key "WORLD_LLM_API_KEY" "${OPENAI_API_KEY:-sk-...}"
            write_env_key "WORLD_LLM_MODEL" "$BEST_PROVIDER_MODEL"
            write_env_key "WORLD_EMBEDDING_MODEL" "text-embedding-3-small"
            write_env_key "WORLD_EMBEDDING_BASE_URL" "https://api.openai.com/v1"
            ;;
        llamacpp)
            write_env_key "WORLD_LLM_BASE_URL" "http://127.0.0.1:${LLM_PORT}/v1"
            write_env_key "WORLD_LLM_API_KEY" "llamacpp"
            write_env_key "WORLD_LLM_MODEL" "$BEST_PROVIDER_MODEL"
            ;;
    esac

    # Ensure auth password is set
    local pw
    pw=$(env_get "AUTH_PASSWORD")
    if [[ -z "$pw" ]]; then
        local new_pw
        new_pw=$(head -c 8 /dev/urandom | base64 | tr -d '/+=' | head -c 8)
        write_env_key "AUTH_PASSWORD" "$new_pw"
        echo -e "${GREEN}  Generated auth password: ${new_pw}${NC}"
        echo -e "${DIM}  (change in Settings after first login)${NC}"
    fi
}

# ═══════════════════════════════════════════════════════════════
#  §5  BINARY & STALE PROCESS CLEANUP
# ═══════════════════════════════════════════════════════════════

BIN=""
for candidate in "dist/$ARCH/tns-server" "./tns-server"; do
    if [[ -x "$candidate" ]]; then
        BIN="$candidate"
        break
    fi
done

if [[ -n "$BIN" ]]; then
    MODE="binary"
else
    BIN=""
    MODE="source"
fi

if [[ -f "$PID_FILE" ]]; then
    while read -r old_pid; do
        if kill -0 "$old_pid" 2>/dev/null; then
            echo -e "${CYAN}Killing stale process $old_pid...${NC}"
            kill -9 "$old_pid" 2>/dev/null || true
        fi
    done < "$PID_FILE"
    rm -f "$PID_FILE"
fi

# ═══════════════════════════════════════════════════════════════
#  §6  NETWORK & HOST
# ═══════════════════════════════════════════════════════════════

HOST=$(env_get "WORLD_SERVER_HOST" "0.0.0.0")
PORT=$(env_get "WORLD_SERVER_PORT" "8000")
LLM_PORT=5001
EMBED_PORT=5002

EXT_IP="$HOST"
if [[ "$HOST" == "0.0.0.0" ]]; then
    if [[ "$OS_TYPE" == "Darwin" ]]; then
        EXT_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "localhost")
    else
        EXT_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")
    fi
fi

# ═══════════════════════════════════════════════════════════════
#  §7  DETECT & CONFIGURE
# ═══════════════════════════════════════════════════════════════

detect_hardware
detect_providers

# Adapt context size for the detected model
LLM_CTX=$(adapt_ctx_for_model "$BEST_PROVIDER_MODEL")
EMBED_CTX=$(adapt_ctx_for_model "BGE M3")

# Write llm-config.json
LLM_CONFIG="conf/llm-config.json"
mkdir -p conf
cat > "$LLM_CONFIG" <<EOCFG
{
  "llmPort": ${LLM_PORT},
  "llmModel": "${BEST_PROVIDER_MODEL}",
  "llmThreads": ${LLM_THREADS},
  "llmParallel": ${LLM_PARALLEL},
  "llmCtxSize": ${LLM_CTX},
  "embedPort": ${EMBED_PORT},
  "embedModel": "BGE M3",
  "embedThreads": 1,
  "embedCtxSize": ${EMBED_CTX}
}
EOCFG

# Auto-configure .env with detected provider
auto_configure_env

# ═══════════════════════════════════════════════════════════════
#  §8  BANNER
# ═══════════════════════════════════════════════════════════════

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║      TrueNeverStory v0.22.2 — Game Server        ║${NC}"
echo -e "${BOLD}╠══════════════════════════════════════════════════╣${NC}"
echo -e "${CYAN}║  Mode:     ${MODE}${NC}"
echo -e "${CYAN}║  URL:      http://${EXT_IP}:${PORT}${NC}"
echo -e "${CYAN}║  Local:    http://localhost:${PORT}${NC}"
echo -e "${CYAN}║  CPU:      ${CPU_CORES} cores (using ${LLM_THREADS} threads, ${LLM_PARALLEL} parallel)${NC}"
echo -e "${CYAN}║  RAM:      ${RAM_GB} GB (ctx: ${LLM_CTX})${NC}"
if [[ "$GPU_TYPE" != "none" ]]; then
    echo -e "${CYAN}║  GPU:      ${GPU_NAME} (${GPU_VRAM_MB}MB VRAM)${NC}"
fi
echo -e "${CYAN}║  Arch:     ${ARCH}${NC}"
echo -e "${CYAN}║  CORS:     ${MODE_FLAGS}${NC}"
echo ""

if [[ -n "$BEST_PROVIDER" ]]; then
    echo -e "${BOLD}  LLM Provider:${NC}"
    echo -e "  ${GREEN}● ${BEST_PROVIDER_NAME}${NC}"
    echo -e "    Model:   ${DIM}${BEST_PROVIDER_MODEL}${NC}"
    if [[ -n "$BEST_PROVIDER_EMBED" ]]; then
        echo -e "    Embed:   ${DIM}${BEST_PROVIDER_EMBED}${NC}"
    fi
    if [[ "$BEST_PROVIDER" == "llamacpp" ]]; then
        echo -e "    Context: ${DIM}${LLM_CTX} tokens${NC}"
        echo -e "    Binary:  ${DIM}${LLAMA_BIN}${NC}"
    fi
    echo ""
else
    echo -e "${YELLOW}  No LLM providers detected${NC}"
    echo -e "${CYAN}  Options:${NC}"
    echo -e "${CYAN}    Ollama:    curl -fsSL https://ollama.com/install.sh | sh${NC}"
    echo -e "${CYAN}    LM Studio: https://lmstudio.ai${NC}"
    echo -e "${CYAN}    OpenAI:    export OPENAI_API_KEY=sk-...${NC}"
    echo -e "${CYAN}    Or place .gguf files in local-models/${NC}"
    echo ""
fi

echo -e "${CYAN}  Ctrl+C to stop${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════╝${NC}"
echo ""

# ═══════════════════════════════════════════════════════════════
#  §9  CLEANUP HANDLER
# ═══════════════════════════════════════════════════════════════

cleanup() {
    trap '' SIGINT SIGTERM
    echo ""
    echo -e "${GREEN}Shutting down...${NC}"

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

# ═══════════════════════════════════════════════════════════════
#  §10  START LLAMA-SERVER (only if llamacpp is the best provider)
# ═══════════════════════════════════════════════════════════════

if [[ "$BEST_PROVIDER" == "llamacpp" && -n "$LLAMA_BIN" ]]; then
    # Check port not already in use
    if port_in_use "$LLM_PORT"; then
        echo -e "${DIM}Port ${LLM_PORT} already in use, skipping llama-server start${NC}"
    else
        local_model_path=""
        if [[ -d "./local-models" ]]; then
            local_model_path=$(find ./local-models -maxdepth 1 -iname "*${BEST_PROVIDER_MODEL}*" -name "*.gguf" -type f 2>/dev/null | head -1 || true)
            if [[ -z "$local_model_path" ]]; then
                # Fallback: find largest non-embed GGUF
                local best_size=0
                while IFS= read -r -d '' f; do
                    local fname
                    fname=$(basename "$f")
                    if [[ "$fname" == *[Ee]mbed* || "$fname" == *BGE* || "$fname" == *bge* ]]; then
                        continue
                    fi
                    local fsize
                    fsize=$(file_size "$f")
                    if [[ "$fsize" -gt "$best_size" ]]; then
                        best_size="$fsize"
                        local_model_path="$f"
                    fi
                done < <(find ./local-models -maxdepth 1 -name "*.gguf" -type f -print0 2>/dev/null)
            fi
        fi

        if [[ -n "$local_model_path" ]]; then
            echo -e "${CYAN}Starting llama-server on port ${LLM_PORT}...${NC}"
            "$LLAMA_BIN" \
                --model "$local_model_path" \
                --host 127.0.0.1 \
                --port "$LLM_PORT" \
                --ctx-size "$LLM_CTX" \
                --threads "$LLM_THREADS" \
                --parallel "$LLM_PARALLEL" &
            PIDS+=($!)
            LLM_READY=false
            for i in $(seq 1 30); do
                if ! kill -0 "${PIDS[-1]}" 2>/dev/null; then
                    echo -e "${RED}llama-server failed to start${NC}"
                    unset 'PIDS[-1]'
                    break
                fi
                if curl -sf http://127.0.0.1:${LLM_PORT}/health &>/dev/null; then
                    LLM_READY=true
                    echo -e "${GREEN}llama-server ready (${i}s)${NC}"
                    break
                fi
                sleep 1
            done
            if [[ "$LLM_READY" == false ]] && kill -0 "${PIDS[-1]}" 2>/dev/null; then
                echo -e "${YELLOW}llama-server still loading, continuing anyway...${NC}"
            fi
        fi
    fi
fi

# ═══════════════════════════════════════════════════════════════
#  §11  START EMBEDDING SERVER (only for llamacpp + local BGE)
# ═══════════════════════════════════════════════════════════════

EMBED_URL=$(env_get "WORLD_EMBEDDING_BASE_URL" "")
if [[ "$BEST_PROVIDER" == "llamacpp" && -z "$EMBED_URL" && -n "$LLAMA_BIN" ]]; then
    if ! port_in_use "$EMBED_PORT"; then
        EMBED_PATH=""
        if [[ -d "./local-models" ]]; then
            EMBED_PATH=$(find ./local-models -maxdepth 1 \( -iname "*bge*" -o -iname "*embed*" \) -name "*.gguf" -type f 2>/dev/null | head -1 || true)
        fi
        if [[ -n "$EMBED_PATH" ]]; then
            echo -e "${CYAN}Starting embedding server on port ${EMBED_PORT}...${NC}"
            "$LLAMA_BIN" \
                --model "$EMBED_PATH" \
                --host 127.0.0.1 \
                --port "$EMBED_PORT" \
                --ctx-size "$EMBED_CTX" \
                --embedding \
                --pooling mean \
                --threads 1 &
            PIDS+=($!)
            EMBED_READY=false
            for i in $(seq 1 15); do
                if ! kill -0 "${PIDS[-1]}" 2>/dev/null; then
                    echo -e "${RED}Embedding server failed to start${NC}"
                    unset 'PIDS[-1]'
                    break
                fi
                if curl -sf http://127.0.0.1:${EMBED_PORT}/health &>/dev/null; then
                    EMBED_READY=true
                    echo -e "${GREEN}Embedding server ready (${i}s)${NC}"
                    break
                fi
                sleep 1
            done
        fi
    fi
fi

# ═══════════════════════════════════════════════════════════════
#  §12  CHECK LLM CONFIG & LAUNCH GAME SERVER
# ═══════════════════════════════════════════════════════════════

LLM_URL=$(env_get "WORLD_LLM_BASE_URL" "")
LLM_MODEL=$(env_get "WORLD_LLM_MODEL" "")

if [[ -z "$LLM_URL" || -z "$LLM_MODEL" ]]; then
    echo ""
    echo -e "${YELLOW}  LLM not configured!${NC}"
    echo -e "${CYAN}  Open http://localhost:${PORT}/settings to configure your LLM provider.${NC}"
    echo -e "${CYAN}  Supported: Ollama, llama.cpp, OpenAI, vLLM, LM Studio, or any OpenAI-compatible API.${NC}"
    echo ""
fi

echo -e "${DIM}Starting game server...${NC}"

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
