#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
#  TrueNeverStory — Auto-detecting Game Server Launcher
#  Detects hardware, finds LLM providers, configures itself.
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

# ── Auto-create .env from example if missing ─────────────────
if [[ ! -f ".env" && -f ".env.example" ]]; then
    cp .env.example .env
    echo -e "${CYAN}Created .env from .env.example${NC}"
fi

# ═══════════════════════════════════════════════════════════════
#  §1  HARDWARE DETECTION
# ═══════════════════════════════════════════════════════════════

detect_hardware() {
    # CPU cores
    if command -v nproc &>/dev/null; then
        CPU_CORES=$(nproc)
    elif [[ -f /proc/cpuinfo ]]; then
        CPU_CORES=$(grep -c ^processor /proc/cpuinfo)
    else
        CPU_CORES=2
    fi

    # RAM in GB
    if [[ -f /proc/meminfo ]]; then
        RAM_KB=$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)
        RAM_GB=$(( RAM_KB / 1024 / 1024 ))
    else
        RAM_GB=8
    fi

    # GPU detection
    GPU_TYPE="none"
    GPU_NAME=""
    GPU_VRAM_MB=0

    if command -v nvidia-smi &>/dev/null; then
        GPU_TYPE="nvidia"
        GPU_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1 || echo "NVIDIA GPU")
        GPU_VRAM_MB=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null | head -1 || echo 0)
    elif command -v rocm-smi &>/dev/null; then
        GPU_TYPE="amd"
        GPU_NAME="AMD GPU"
    elif [[ -d /dev/dri ]]; then
        GPU_TYPE="intel"
        GPU_NAME="Intel GPU"
    fi

    # Optimal settings based on hardware
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

    # Context size: scale with RAM
    if [[ "$RAM_GB" -le 4 ]]; then
        LLM_CTX=4096
        EMBED_CTX=2048
    elif [[ "$RAM_GB" -le 8 ]]; then
        LLM_CTX=8192
        EMBED_CTX=4096
    elif [[ "$RAM_GB" -le 16 ]]; then
        LLM_CTX=16384
        EMBED_CTX=8192
    elif [[ "$RAM_GB" -le 32 ]]; then
        LLM_CTX=32768
        EMBED_CTX=16384
    else
        LLM_CTX=32768
        EMBED_CTX=16384
    fi

    # If VRAM > 4GB, we can fit larger models — bump context
    if [[ "$GPU_VRAM_MB" -gt 8000 ]]; then
        LLM_CTX=32768
    elif [[ "$GPU_VRAM_MB" -gt 4000 ]]; then
        LLM_CTX=16384
    fi
}

# ═══════════════════════════════════════════════════════════════
#  §2  LLM PROVIDER DETECTION
# ═══════════════════════════════════════════════════════════════

# Provider registry: name, url, type, model_fetch_command
PROVIDERS=()

detect_ollama() {
    if ! command -v ollama &>/dev/null; then
        return
    fi
    # Check if ollama is running or can start
    if curl -sf http://localhost:11434/api/tags &>/dev/null; then
        local models
        models=$(curl -sf http://localhost:11434/api/tags 2>/dev/null | python3 -c "
import sys,json
try:
    d=json.load(sys.stdin)
    for m in d.get('models',[]):
        print(m['name'])
except: pass
" 2>/dev/null || echo "")

        local chat_model=""
        local embed_model=""
        # Pick best chat model (prefer larger, newer)
        while IFS= read -r m; do
            [[ -z "$m" ]] && continue
            # Skip embedding-only models
            if [[ "$m" == *embed* || "$m" == *Embed* ]]; then
                [[ -z "$embed_model" ]] && embed_model="$m"
                continue
            fi
            # Prefer latest tag
            if [[ -z "$chat_model" || "$m" == *:latest ]]; then
                chat_model="$m"
            fi
        done <<< "$models"

        PROVIDERS+=("ollama|http://localhost:11434/v1|openai|${chat_model:-}|${embed_model:-}|Ollama")
    fi
}

detect_lmstudio() {
    if curl -sf http://localhost:1234/v1/models &>/dev/null; then
        local model=""
        model=$(curl -sf http://localhost:1234/v1/models 2>/dev/null | python3 -c "
import sys,json
try:
    d=json.load(sys.stdin)
    models=d.get('data',[])
    if models: print(models[0].get('id',''))
except: pass
" 2>/dev/null || echo "")
        PROVIDERS+=("lmstudio|http://localhost:1234/v1|openai|${model:-}|${model:-}|LM Studio")
    fi
}

detect_llamacpp() {
    local llama_bin=""
    for candidate in "dist/$ARCH/llama-server" "./llama-server"; do
        if [[ -x "$candidate" ]]; then
            llama_bin="$candidate"
            break
        fi
    done
    if [[ -z "$llama_bin" ]]; then
        return
    fi
    # Find model
    local model_path=""
    for dir in "./local-models"; do
        [[ -d "$dir" ]] || continue
        model_path=$(find "$dir" -maxdepth 1 -name "*.gguf" -type f 2>/dev/null | head -1 || true)
        if [[ -n "$model_path" ]]; then
            break
        fi
    done
    if [[ -n "$model_path" ]]; then
        PROVIDERS+=("llamacpp||local|$(basename "$model_path")||llama.cpp ($ARCH)")
    fi
}

detect_vllm() {
    if curl -sf http://localhost:8000/v1/models &>/dev/null; then
        local model=""
        model=$(curl -sf http://localhost:8000/v1/models 2>/dev/null | python3 -c "
import sys,json
try:
    d=json.load(sys.stdin)
    models=d.get('data',[])
    if models: print(models[0].get('id',''))
except: pass
" 2>/dev/null || echo "")
        PROVIDERS+=("vllm|http://localhost:8000/v1|openai|${model:-}||vLLM")
    fi
}

detect_openai() {
    local key="${OPENAI_API_KEY:-}"
    if [[ -n "$key" ]]; then
        PROVIDERS+=("openai|https://api.openai.com/v1|openai|gpt-4o||OpenAI")
    fi
}

detect_providers() {
    detect_ollama
    detect_lmstudio
    detect_vllm
    detect_openai
    detect_llamacpp
}

# ═══════════════════════════════════════════════════════════════
#  §3  AUTO-CONFIGURE .env
# ═══════════════════════════════════════════════════════════════

# Read existing .env values (if any) — user overrides take priority
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
        # Update existing
        sed -i "s|^${key}=.*|${key}=${value}|" "$file"
    else
        echo "${key}=${value}" >> "$file"
    fi
}

auto_configure() {
    # Only auto-configure if .env is empty/missing or has defaults
    local existing_url
    existing_url=$(env_get "WORLD_LLM_BASE_URL")

    # If already configured with a non-default value, respect user choice
    if [[ -n "$existing_url" && "$existing_url" != "http://localhost:11434/v1" ]]; then
        echo -e "${DIM}  LLM already configured: ${existing_url}${NC}"
        return
    fi

    # Pick best provider: ollama > lmstudio > vllm > llamacpp > openai
    local best_type="" best_url="" best_model="" best_embed="" best_name=""
    for entry in "${PROVIDERS[@]}"; do
        IFS='|' read -r ptype purl plink pmodel pembed pname <<< "$entry"
        if [[ -n "$pmodel" || "$plink" == "local" ]]; then
            best_type="$ptype"
            best_url="$purl"
            best_model="$pmodel"
            best_embed="$pembed"
            best_name="$pname"
            break
        fi
    done

    if [[ -z "$best_type" ]]; then
        echo -e "${YELLOW}  No LLM provider detected — configure manually in Settings${NC}"
        return
    fi

    echo -e "${GREEN}  Auto-configuring: ${best_name}${NC}"

    case "$best_type" in
        ollama)
            write_env_key "WORLD_LLM_BASE_URL" "http://localhost:11434/v1"
            write_env_key "WORLD_LLM_API_KEY" "ollama"
            write_env_key "WORLD_LLM_MODEL" "$best_model"
            if [[ -n "$best_embed" ]]; then
                write_env_key "WORLD_EMBEDDING_MODEL" "$best_embed"
                write_env_key "WORLD_EMBEDDING_BASE_URL" "http://localhost:11434/v1"
                write_env_key "WORLD_EMBEDDING_API_KEY" "ollama"
            fi
            ;;
        lmstudio)
            write_env_key "WORLD_LLM_BASE_URL" "http://localhost:1234/v1"
            write_env_key "WORLD_LLM_API_KEY" "lm-studio"
            write_env_key "WORLD_LLM_MODEL" "$best_model"
            ;;
        vllm)
            write_env_key "WORLD_LLM_BASE_URL" "http://localhost:8000/v1"
            write_env_key "WORLD_LLM_API_KEY" "vllm"
            write_env_key "WORLD_LLM_MODEL" "$best_model"
            ;;
        openai)
            write_env_key "WORLD_LLM_BASE_URL" "https://api.openai.com/v1"
            write_env_key "WORLD_LLM_API_KEY" "${OPENAI_API_KEY:-sk-...}"
            write_env_key "WORLD_LLM_MODEL" "$best_model"
            ;;
        llamacpp)
            # llama-server is started by this script below
            write_env_key "WORLD_LLM_BASE_URL" "http://127.0.0.1:${LLM_PORT}/v1"
            write_env_key "WORLD_LLM_API_KEY" "llamacpp"
            write_env_key "WORLD_LLM_MODEL" "$best_model"
            ;;
    esac

    # Ensure auth password is set
    local pw
    pw=$(env_get "AUTH_PASSWORD")
    if [[ -z "$pw" ]]; then
        # Generate a random password
        local new_pw
        new_pw=$(head -c 8 /dev/urandom | base64 | tr -d '/+=' | head -c 8)
        write_env_key "AUTH_PASSWORD" "$new_pw"
        echo -e "${GREEN}  Generated auth password: ${new_pw}${NC}"
        echo -e "${DIM}  (change in Settings after first login)${NC}"
    fi
}

# ═══════════════════════════════════════════════════════════════
#  §4  BINARY & STALE PROCESS CLEANUP
# ═══════════════════════════════════════════════════════════════

# Find binary: check dist/<arch>/ first, then root directory
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
#  §5  NETWORK & HOST
# ═══════════════════════════════════════════════════════════════

HOST=$(env_get "WORLD_SERVER_HOST" "0.0.0.0")
PORT=$(env_get "WORLD_SERVER_PORT" "8000")
LLM_PORT=5001
EMBED_PORT=5002

EXT_IP="$HOST"
if [[ "$HOST" == "0.0.0.0" ]]; then
    EXT_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")
fi

# ── Read model from conf/settings.json (UI) or .env ────────
SETTINGS_MODEL=""
if [[ -f "conf/settings.json" ]]; then
    SETTINGS_MODEL=$(grep -oP '"llmModel"\s*:\s*"\K[^"]+' conf/settings.json 2>/dev/null || true)
fi
ENV_MODEL=$(env_get "WORLD_LLM_MODEL" "")
MODEL="${SETTINGS_MODEL:-${ENV_MODEL:-gemma-3-4b-it.Q4_K_M}}"

# ── Scan local-models/ for GGUF files ─────────────────────
MODEL_PATH=""
if [[ -d "./local-models" ]]; then
    while IFS= read -r -d '' f; do
        MODEL_PATH="$f"
        break
    done < <(find ./local-models -maxdepth 1 -iname "${MODEL}.gguf" -type f -print0 2>/dev/null)
    if [[ -z "$MODEL_PATH" ]]; then
        while IFS= read -r -d '' f; do
            MODEL_PATH="$f"
            break
        done < <(find ./local-models -maxdepth 1 -iname "*${MODEL}*" -name "*.gguf" -type f -print0 2>/dev/null)
    fi
    if [[ -z "$MODEL_PATH" ]]; then
        while IFS= read -r -d '' f; do
            MODEL_PATH="$f"
            break
        done < <(find ./local-models -maxdepth 1 -name "*.gguf" -type f -print0 2>/dev/null)
    fi
fi

# ═══════════════════════════════════════════════════════════════
#  §6  DETECT HARDWARE & PROVIDERS
# ═══════════════════════════════════════════════════════════════

detect_hardware
detect_providers

# If no conf/llm-config.json exists, generate one
LLM_CONFIG="conf/llm-config.json"
if [[ ! -f "$LLM_CONFIG" ]]; then
    mkdir -p conf
    cat > "$LLM_CONFIG" <<EOCFG
{
  "llmPort": ${LLM_PORT},
  "llmThreads": ${LLM_THREADS},
  "llmParallel": ${LLM_PARALLEL},
  "llmCtxSize": ${LLM_CTX},
  "embedPort": ${EMBED_PORT},
  "embedModel": "BGE M3",
  "embedThreads": 1,
  "embedCtxSize": ${EMBED_CTX}
}
EOCFG
fi

# ═══════════════════════════════════════════════════════════════
#  §7  AUTO-CONFIGURE LLM PROVIDER
# ═══════════════════════════════════════════════════════════════

auto_configure

# ═══════════════════════════════════════════════════════════════
#  §8  BANNER
# ═══════════════════════════════════════════════════════════════

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║      TrueNeverStory v0.16.0 — Game Server        ║${NC}"
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
echo ""

# Show detected providers
if [[ ${#PROVIDERS[@]} -gt 0 ]]; then
    echo -e "${BOLD}  Detected LLM Providers:${NC}"
    local_idx=1
    for entry in "${PROVIDERS[@]}"; do
        IFS='|' read -r ptype purl plink pmodel pembed pname <<< "$entry"
        local_status=""
        if [[ -n "$pmodel" || "$plink" == "local" ]]; then
            local_status="${GREEN}active${NC}"
        else
            local_status="${YELLOW}no model${NC}"
        fi
        echo -e "  ${DIM}${local_idx}.${NC} ${BOLD}${pname}${NC} — ${local_status}"
        if [[ -n "$pmodel" ]]; then
            echo -e "     Model: ${DIM}${pmodel}${NC}"
        fi
        if [[ -n "$pembed" ]]; then
            echo -e "     Embed: ${DIM}${pembed}${NC}"
        fi
        (( local_idx++ ))
    done
    echo ""
else
    echo -e "${YELLOW}  No LLM providers detected${NC}"
    echo -e "${CYAN}  Install Ollama: curl -fsSL https://ollama.com/install.sh | sh${NC}"
    echo -e "${CYAN}  Then: ollama pull gemma3:latest${NC}"
    echo ""
fi

# Show model file
if [[ -n "$MODEL_PATH" ]]; then
    echo -e "${CYAN}  Local model: $(basename "$MODEL_PATH")${NC}"
else
    echo -e "${DIM}  No local GGUF model found in local-models/${NC}"
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
#  §10  START LLAMA-SERVER (if bundled, and no external provider)
# ═══════════════════════════════════════════════════════════════

LLAMA_BIN=""
for candidate in "dist/$ARCH/llama-server" "./llama-server"; do
    if [[ -x "$candidate" ]]; then
        LLAMA_BIN="$candidate"
        break
    fi
done

# Check if an external provider is already running on the LLM port
external_running=false
if ss -tlnp 2>/dev/null | grep -q ":${LLM_PORT} " 2>/dev/null; then
    external_running=true
fi
if curl -sf http://localhost:11434/api/tags &>/dev/null 2>&1; then
    external_running=true
fi
if curl -sf http://localhost:1234/v1/models &>/dev/null 2>&1; then
    external_running=true
fi

if [[ "$external_running" == false && -n "$LLAMA_BIN" && -n "$MODEL_PATH" ]]; then
    echo -e "${CYAN}Starting llama-server on port ${LLM_PORT}...${NC}"
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
        echo -e "${RED}llama-server failed to start${NC}"
        unset 'PIDS[-1]'
    fi
elif [[ "$external_running" == false ]]; then
    echo -e "${DIM}No local LLM available — configure one in Settings${NC}"
fi

# ═══════════════════════════════════════════════════════════════
#  §11  START EMBEDDING SERVER (llama.cpp only, if available)
# ═══════════════════════════════════════════════════════════════

EMBED_MODEL_CFG="BGE M3"
if [[ -f "$LLM_CONFIG" ]] && command -v jq &>/dev/null; then
    EMBED_MODEL_CFG=$(jq -r '.embedModel // "BGE M3"' "$LLM_CONFIG")
fi

# Only start embedding if no external embedding is configured
EMBED_URL=$(env_get "WORLD_EMBEDDING_BASE_URL" "")
if [[ -z "$EMBED_URL" && -n "$EMBED_PORT" ]]; then
    if ! ss -tlnp 2>/dev/null | grep -q ":${EMBED_PORT} " 2>/dev/null; then
        EMBED_PATH=""
        if [[ -d "./local-models" ]]; then
            EMBED_PATH=$(find ./local-models -iname "*${EMBED_MODEL_CFG}*" -name "*.gguf" -type f 2>/dev/null | head -1 || true)
            if [[ -z "$EMBED_PATH" ]]; then
                EMBED_PATH=$(find ./local-models -iname "*embed*" -name "*.gguf" -type f 2>/dev/null | head -1 || true)
            fi
        fi
        if [[ -n "$LLAMA_BIN" && -n "$EMBED_PATH" ]]; then
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
            sleep 2
            if ! kill -0 "${PIDS[-1]}" 2>/dev/null; then
                echo -e "${RED}Embedding server failed to start${NC}"
                unset 'PIDS[-1]'
            fi
        fi
    fi
fi

# ═══════════════════════════════════════════════════════════════
#  §12  CHECK LLM CONFIG & LAUNCH SERVER
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
