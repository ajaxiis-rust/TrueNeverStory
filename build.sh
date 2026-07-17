#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────────────────────
#  TrueNeverStory v0.26.0 — Universal build, compile & launch script
#  Detects hardware, installs deps, compiles binaries,
#  cross-compiles for other platforms, starts server
# ─────────────────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()  { echo -e "${GREEN}[BUILD]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERROR]${NC} $*" >&2; }
info() { echo -e "${CYAN}[INFO]${NC} $*"; }

# ─────────────────────────────────────────────────────────────
#  Hardware Detection
# ─────────────────────────────────────────────────────────────

detect_hardware() {
    log "Detecting hardware..."

    CPU_CORES=$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 2)
    CPU_CORES=$((CPU_CORES - 1))
    if (( CPU_CORES < 1 )); then CPU_CORES=1; fi
    RAM_MB=$(free -m 2>/dev/null | awk '/Mem:/{print $2}' || echo 4096)
    RAM_GB=$((RAM_MB / 1024))
    HOST_ARCH=$(uname -m)
    HOST_OS=$(uname -s)

    HAS_NVIDIA=false
    HAS_GPU=false
    GPU_NAME="none"

    if command -v nvidia-smi &>/dev/null && nvidia-smi &>/dev/null 2>&1; then
        HAS_NVIDIA=true
        HAS_GPU=true
        GPU_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null | head -1)
        GPU_MEM=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader 2>/dev/null | head -1)
    fi

    if [[ "$HOST_ARCH" == "arm64" ]] && [[ "$HOST_OS" == "Darwin" ]]; then
        HAS_GPU=true
        GPU_NAME="Apple Silicon (Metal)"
    fi

    case "$HOST_ARCH-$HOST_OS" in
        x86_64-Linux)  CURRENT_TARGET="linux-x64" ;;
        aarch64-Linux) CURRENT_TARGET="linux-arm64" ;;
        arm64-Darwin)  CURRENT_TARGET="macos-arm64" ;;
        x86_64-Darwin) CURRENT_TARGET="macos-x64" ;;
        *)             CURRENT_TARGET="linux-x64" ;;
    esac

    info "Architecture:   $HOST_ARCH"
    info "CPU cores:      $CPU_CORES (1 reserved for system)"
    info "RAM:            ${RAM_GB}GB"
    info "GPU:            $GPU_NAME"
    if $HAS_NVIDIA; then
        info "GPU memory:     $GPU_MEM"
    fi

    if $HAS_NVIDIA; then
        LLM_CONCURRENT=$((CPU_CORES * 2))
    else
        LLM_CONCURRENT=$CPU_CORES
    fi

    if (( RAM_GB >= 32 )); then
        MAX_TOKENS=8192
    elif (( RAM_GB >= 16 )); then
        MAX_TOKENS=4096
    else
        MAX_TOKENS=2048
    fi

    info "Optimal concurrency: $LLM_CONCURRENT"
    info "Optimal max tokens:  $MAX_TOKENS"
}

# ─────────────────────────────────────────────────────────────
#  Cross-compilation targets
# ─────────────────────────────────────────────────────────────

declare -A TARGET_MOJO_TRIPLE=(
    ["linux-x64"]="x86_64-unknown-linux-gnu"
    ["linux-arm64"]="aarch64-unknown-linux-gnu"
    ["macos-arm64"]="aarch64-apple-darwin"
    ["macos-x64"]="x86_64-apple-darwin"
    ["windows-x64"]="x86_64-pc-windows-msvc"
)

declare -A TARGET_BUN_OS=(
    ["linux-x64"]="linux"
    ["linux-arm64"]="linux"
    ["macos-arm64"]="darwin"
    ["macos-x64"]="darwin"
    ["windows-x64"]="windows"
)

declare -A TARGET_BUN_ARCH=(
    ["linux-x64"]="x64"
    ["linux-arm64"]="arm64"
    ["macos-arm64"]="arm64"
    ["macos-x64"]="x64"
    ["windows-x64"]="x64"
)

# Mojo не поддерживает Windows (нет MSVC target)
declare -A TARGET_MOJO_SUPPORTED=(
    ["linux-x64"]=true
    ["linux-arm64"]=true
    ["macos-arm64"]=true
    ["macos-x64"]=true
    ["windows-x64"]=false
)

ALL_TARGETS=("linux-x64" "linux-arm64" "macos-arm64" "macos-x64" "windows-x64")

resolve_target() {
    local target="${1:-}"
    if [[ -z "$target" ]]; then
        target="$CURRENT_TARGET"
    fi

    if [[ -z "${TARGET_MOJO_TRIPLE[$target]:-}" ]]; then
        err "Unknown target: $target"
        err "Available: ${ALL_TARGETS[*]}"
        exit 1
    fi

    COMPILE_TARGET="$target"
    COMPILE_MOJO_TRIPLE="${TARGET_MOJO_TRIPLE[$target]}"
    COMPILE_BUN_OS="${TARGET_BUN_OS[$target]}"
    COMPILE_BUN_ARCH="${TARGET_BUN_ARCH[$target]}"
    COMPILE_DIR="dist/${target}"
}

# ─────────────────────────────────────────────────────────────
#  Interactive target selection
# ─────────────────────────────────────────────────────────────

select_targets() {
    echo ""
    echo -e "${BOLD}Select compilation targets:${NC}"
    echo ""
    echo "  1) linux-x64     — Linux x86_64"
    echo "  2) linux-arm64   — Linux ARM64"
    echo "  3) macos-arm64   — macOS Apple Silicon"
    echo "  4) macos-x64     — macOS Intel"
    echo "  5) windows-x64   — Windows x86_64 (только TypeScript)"
    echo "  6) all           — All platforms"
    echo "  7) current       — Current platform only ($CURRENT_TARGET)"
    echo ""
    read -rp "Enter numbers (comma-separated, e.g. 1,2): " choice

    SELECTED_TARGETS=()

    IFS=',' read -ra items <<< "$choice"
    for item in "${items[@]}"; do
        item=$(echo "$item" | tr -d ' ')
        case "$item" in
            1) SELECTED_TARGETS+=("linux-x64") ;;
            2) SELECTED_TARGETS+=("linux-arm64") ;;
            3) SELECTED_TARGETS+=("macos-arm64") ;;
            4) SELECTED_TARGETS+=("macos-x64") ;;
            5) SELECTED_TARGETS+=("windows-x64") ;;
            6) SELECTED_TARGETS=("${ALL_TARGETS[@]}") ;;
            7) SELECTED_TARGETS=("$CURRENT_TARGET") ;;
            *) warn "Unknown option: $item" ;;
        esac
    done

    if (( ${#SELECTED_TARGETS[@]} == 0 )); then
        err "No targets selected"
        exit 1
    fi

    echo ""
    info "Selected: ${SELECTED_TARGETS[*]}"
}

# ─────────────────────────────────────────────────────────────
#  Dependency Checks
# ─────────────────────────────────────────────────────────────

check_deps() {
    log "Checking dependencies..."

    local missing=()

    if ! command -v bun &>/dev/null; then
        missing+=("bun")
        warn "Bun not found. Installing..."
        curl -fsSL https://bun.sh/install | bash
        export BUN_INSTALL="$HOME/.bun"
        export PATH="$BUN_INSTALL/bin:$PATH"
    fi

    if ! command -v mojo &>/dev/null; then
        warn "Mojo not found. Mojo compilation will be skipped."
        HAS_MOJO=false
    else
        HAS_MOJO=true
        MOJO_VERSION=$(mojo --version 2>/dev/null || echo "unknown")
        info "Mojo version: $MOJO_VERSION"
    fi

    if (( ${#missing[@]} > 0 )); then
        err "Missing: ${missing[*]}"
        exit 1
    fi

    info "Bun version: $(bun --version)"
}

# ─────────────────────────────────────────────────────────────
#  Environment Setup
# ─────────────────────────────────────────────────────────────

setup_env() {
    log "Setting up environment..."

    if [[ ! -f .env ]]; then
        if [[ -f .env.example ]]; then
            cp .env.example .env
            warn "Created .env from .env.example — edit it with your settings"
        else
            err "No .env or .env.example found"
            exit 1
        fi
    fi

    sed_inplace() {
        if [[ "$(uname)" == "Darwin" ]]; then
            sed -i '' "$@"
        else
            sed -i "$@"
        fi
    }

    if grep -q "WORLD_LLM_MAX_CONCURRENT=8" .env 2>/dev/null; then
        sed_inplace "s/WORLD_LLM_MAX_CONCURRENT=8/WORLD_LLM_MAX_CONCURRENT=$LLM_CONCURRENT/" .env
        info "Set LLM_MAX_CONCURRENT=$LLM_CONCURRENT"
    fi

    if grep -q "WORLD_LLM_MAX_TOKENS=4096" .env 2>/dev/null; then
        sed_inplace "s/WORLD_LLM_MAX_TOKENS=4096/WORLD_LLM_MAX_TOKENS=$MAX_TOKENS/" .env
        info "Set LLM_MAX_TOKENS=$MAX_TOKENS"
    fi
}

# ─────────────────────────────────────────────────────────────
#  Install Node Dependencies
# ─────────────────────────────────────────────────────────────

install_node_deps() {
    log "Installing Node/Bun dependencies..."
    bun install --frozen-lockfile 2>/dev/null || bun install
    info "Node dependencies installed"
}

# ─────────────────────────────────────────────────────────────
#  Type Check
# ─────────────────────────────────────────────────────────────

typecheck() {
    log "Running type check..."
    if bun run lint 2>&1; then
        info "Type check passed"
    else
        warn "Type check had issues (non-fatal)"
    fi
}

# ─────────────────────────────────────────────────────────────
#  Compile TypeScript → standalone binary (into target dir)
# ─────────────────────────────────────────────────────────────

compile_bun() {
    local target="${1:-}"
    resolve_target "$target"

    mkdir -p "$COMPILE_DIR"

    local bin_name="tns-server"
    if [[ "$COMPILE_BUN_OS" == "windows" ]]; then
        bin_name="tns-server.exe"
    fi
    local outpath="${COMPILE_DIR}/${bin_name}"

    log "Compiling TypeScript → ${outpath} (${COMPILE_TARGET})"

    local bun_args=(
        --compile
        --outfile "$outpath"
        --target bun
    )

    # Cross-compilation: point to target bun binary if available
    local cross_bin="dist/.bun-cache/bun-${COMPILE_TARGET}"
    if [[ "$COMPILE_TARGET" != "$CURRENT_TARGET" ]]; then
        if [[ -f "$cross_bin" ]]; then
            bun_args+=(--compile-executable-path "$cross_bin")
        else
            warn "No pre-downloaded bun binary for ${COMPILE_TARGET}"
            warn "Cross-build may not work — run: ./build.sh download-bun"
        fi
    fi

    bun build "${bun_args[@]}" src/index.ts

    chmod +x "$outpath"
    local size
    size=$(du -h "$outpath" | cut -f1)
    info "Compiled: ${outpath} (${size})"
}

# ─────────────────────────────────────────────────────────────
#  Compile Mojo → shared libraries (into target dir)
# ─────────────────────────────────────────────────────────────

compile_mojo() {
    if ! $HAS_MOJO; then
        warn "Mojo not available — skipping"
        return 0
    fi

    local target="${1:-}"
    resolve_target "$target"

    # Check if Mojo supports this target
    if [[ "${TARGET_MOJO_SUPPORTED[$COMPILE_TARGET]:-false}" == "false" ]]; then
        warn "Mojo does not support ${COMPILE_TARGET} — skipping .so compilation"
        warn "Only TypeScript binary will be built for this target"
        return 0
    fi

    mkdir -p "$COMPILE_DIR"

    log "Compiling Mojo kernels → ${COMPILE_DIR}/ (${COMPILE_MOJO_TRIPLE})"

    local mojo_args=(
        build
        --emit shared-lib
        -O3
    )

    # Cross-compilation triple
    if [[ "$COMPILE_TARGET" != "$CURRENT_TARGET" ]]; then
        mojo_args+=(--target-triple "$COMPILE_MOJO_TRIPLE")
    fi

    # Probability kernels
    if [[ -f mojo/kernels/probability_ffi.mojo ]]; then
        if mojo "${mojo_args[@]}" -o "${COMPILE_DIR}/libtns_kernels.so" mojo/kernels/probability_ffi.mojo 2>&1; then
            info "Compiled: ${COMPILE_DIR}/libtns_kernels.so"
        else
            if [[ "$COMPILE_TARGET" != "$CURRENT_TARGET" ]]; then
                warn "Mojo cross-compile failed (${COMPILE_TARGET} from ${CURRENT_TARGET})"
                warn "Mojo cross-compilation requires target platform toolchain"
                warn "Run this command ON the target platform, or use native .so"
            else
                warn "Probability kernel compilation failed"
            fi
        fi
    fi

    # Vector kernels (4-dim)
    if [[ -f mojo/kernels/vector_ffi.mojo ]]; then
        if mojo "${mojo_args[@]}" -o "${COMPILE_DIR}/libtns_vectors.so" mojo/kernels/vector_ffi.mojo 2>&1; then
            info "Compiled: ${COMPILE_DIR}/libtns_vectors.so"
        else
            if [[ "$COMPILE_TARGET" != "$CURRENT_TARGET" ]]; then
                warn "Mojo cross-compile failed (${COMPILE_TARGET} from ${CURRENT_TARGET})"
            else
                warn "Vector kernel compilation failed"
            fi
        fi
    fi

    # Vector full kernel (768-dim)
    if [[ -f mojo/kernels/vector_full.mojo ]]; then
        if mojo "${mojo_args[@]}" -o "${COMPILE_DIR}/libtns_vector_full.so" mojo/kernels/vector_full.mojo 2>&1; then
            info "Compiled: ${COMPILE_DIR}/libtns_vector_full.so"
        else
            if [[ "$COMPILE_TARGET" != "$CURRENT_TARGET" ]]; then
                warn "Mojo cross-compile failed (${COMPILE_TARGET} from ${CURRENT_TARGET})"
            else
                warn "Vector full kernel compilation failed"
            fi
        fi
    fi

    # Batch operations kernel
    if [[ -f mojo/kernels/batch_ops.mojo ]]; then
        if mojo "${mojo_args[@]}" -o "${COMPILE_DIR}/libtns_batch_ops.so" mojo/kernels/batch_ops.mojo 2>&1; then
            info "Compiled: ${COMPILE_DIR}/libtns_batch_ops.so"
        else
            if [[ "$COMPILE_TARGET" != "$CURRENT_TARGET" ]]; then
                warn "Mojo cross-compile failed (${COMPILE_TARGET} from ${CURRENT_TARGET})"
            else
                warn "Batch ops kernel compilation failed"
            fi
        fi
    fi

    # Graph operations kernel
    if [[ -f mojo/kernels/graph_ops.mojo ]]; then
        if mojo "${mojo_args[@]}" -o "${COMPILE_DIR}/libtns_graph_ops.so" mojo/kernels/graph_ops.mojo 2>&1; then
            info "Compiled: ${COMPILE_DIR}/libtns_graph_ops.so"
        else
            if [[ "$COMPILE_TARGET" != "$CURRENT_TARGET" ]]; then
                warn "Mojo cross-compile failed (${COMPILE_TARGET} from ${CURRENT_TARGET})"
            else
                warn "Graph ops kernel compilation failed"
            fi
        fi
    fi
}

# ─────────────────────────────────────────────────────────────
#  Compile .env template into target dir
# ─────────────────────────────────────────────────────────────

copy_env_template() {
    local target="${1:-}"
    resolve_target "$target"
    mkdir -p "$COMPILE_DIR"
    if [[ -f .env.example ]]; then
        cp .env.example "${COMPILE_DIR}/.env"
        info "Copied .env template → ${COMPILE_DIR}/"
    fi
}

# ─────────────────────────────────────────────────────────────
#  Compile all for a single target
# ─────────────────────────────────────────────────────────────

compile_target() {
    local target="${1:-}"
    resolve_target "$target"

    echo ""
    info "━━━ Target: ${target} ━━━"

    compile_bun "$target"
    compile_mojo "$target"
    copy_env_template "$target"

    echo ""
    info "Contents of ${COMPILE_DIR}/:"
    ls -lh "$COMPILE_DIR/"
}

# ─────────────────────────────────────────────────────────────
#  Cross-compile for selected platforms
# ─────────────────────────────────────────────────────────────

cross_compile_selected() {
    local targets=("$@")

    log "Cross-compiling for: ${targets[*]}"

    for t in "${targets[@]}"; do
        compile_target "$t"
    done

    echo ""
    log "Cross-compilation complete → dist/"
    echo ""
    for t in "${targets[@]}"; do
        echo -e "  ${CYAN}dist/${t}/${NC}"
        ls dist/"$t"/ 2>/dev/null | sed 's/^/    /'
    done
}

# ─────────────────────────────────────────────────────────────
#  Download Bun binaries for cross-compilation
# ─────────────────────────────────────────────────────────────

download_bun_targets() {
    log "Downloading Bun binaries for cross-compilation..."
    mkdir -p dist/.bun-cache

    local bun_ver
    bun_ver=$(bun --version)

    local targets=("linux-x64" "linux-arm64" "macos-arm64" "macos-x64")

    for t in "${targets[@]}"; do
        local os="${TARGET_BUN_OS[$t]}"
        local arch="${TARGET_BUN_ARCH[$t]}"
        local cache_path="dist/.bun-cache/bun-${t}"

        if [[ -f "$cache_path" ]]; then
            info "Bun for ${t} already cached"
            continue
        fi

        local url="https://github.com/oven-sh/bun/releases/download/bun-v${bun_ver}/bun-${os}-${arch}.zip"
        info "Downloading: ${url}"

        local tmpdir
        tmpdir=$(mktemp -d)
        if curl -fsSL "$url" -o "$tmpdir/bun.zip" 2>/dev/null; then
            unzip -q "$tmpdir/bun.zip" -d "$tmpdir" 2>/dev/null
            local extracted
            extracted=$(find "$tmpdir" -name "bun" -type f | head -1)
            if [[ -n "$extracted" ]]; then
                cp "$extracted" "$cache_path"
                chmod +x "$cache_path"
                info "Cached bun for ${t}"
            else
                warn "Could not find bun binary in archive for ${t}"
            fi
        else
            warn "Failed to download bun for ${t}"
        fi
        rm -rf "$tmpdir"
    done
}

# ─────────────────────────────────────────────────────────────
#  Run Tests
# ─────────────────────────────────────────────────────────────

run_tests() {
    log "Running tests..."

    local SERVER_PID=""
    if [[ "${RUN_TESTS:-false}" == "true" ]]; then
        bun run start &
        SERVER_PID=$!
        sleep 3
    fi

    if bun test 2>&1; then
        info "All tests passed"
    else
        warn "Some tests failed"
    fi

    if [[ -n "${SERVER_PID:-}" ]]; then
        kill "$SERVER_PID" 2>/dev/null || true
        wait "$SERVER_PID" 2>/dev/null || true
    fi
}

# ─────────────────────────────────────────────────────────────
#  Production Build (bundle only, no binary)
# ─────────────────────────────────────────────────────────────

build_prod() {
    log "Building for production (bundle)..."
    bun run build 2>&1 || warn "Production build had issues"
    info "Production build complete → dist/"
}

# ─────────────────────────────────────────────────────────────
#  Start Mojo Server (background)
# ─────────────────────────────────────────────────────────────

start_mojo_server() {
    log "Mojo kernels loaded via FFI"

    if [[ -f dist/libtns_kernels.so && -f dist/libtns_vectors.so ]]; then
        info "Mojo FFI libraries ready"
    else
        warn "Mojo shared libraries not found — run: ./build.sh compile"
    fi
}

# ─────────────────────────────────────────────────────────────
#  Start Server (from binary or source)
# ─────────────────────────────────────────────────────────────

start_server() {
    local host port
    host=$(grep "WORLD_SERVER_HOST" .env | cut -d= -f2 || echo "0.0.0.0")
    port=$(grep "WORLD_SERVER_PORT" .env | cut -d= -f2 || echo "8000")

    cleanup() {
        log "Shutting down..."
        exit 0
    }
    trap cleanup SIGINT SIGTERM

    local bin="dist/tns-server"
    if [[ ! -x "$bin" ]]; then
        bin="dist/${CURRENT_TARGET}/tns-server"
    fi

    if [[ -x "$bin" ]]; then
        log "Starting from binary: $bin"
        info "Server will listen on ${host}:${port}"
        info "Open http://localhost:${port} in your browser"
        exec "$bin"
    fi

    log "Starting TrueNeverStory server from source..."
    info "Server will listen on ${host}:${port}"
    info "Open http://localhost:${port} in your browser"

    if [[ "${MODE:-}" == "dev" ]]; then
        exec bun run dev
    else
        exec bun run start
    fi
}

# ─────────────────────────────────────────────────────────────
#  Usage
# ─────────────────────────────────────────────────────────────

usage() {
    echo -e "${BOLD}TrueNeverStory v0.26.0 Build, Compile & Launch Script${NC}"
    echo ""
    echo "Usage: $0 [COMMAND] [OPTIONS]"
    echo ""
    echo "Development:"
    echo "  dev              Install deps + start dev server (hot reload)"
    echo "  start            Install deps + start production server"
    echo "  build            Bundle for production (no binary)"
    echo "  test             Install deps + run test suite"
    echo "  setup            Install deps + configure environment only"
    echo ""
    echo "Compilation:"
    echo "  compile          Compile for current platform"
    echo "  compile [target] Compile for specific target"
    echo "  select           Interactive target selection + compile"
    echo "  cross            Compile for ALL platforms"
    echo "  download-bun     Download Bun binaries for cross-compilation"
    echo ""
    echo "Info:"
    echo "  info             Show detected hardware and optimal settings"
    echo "  help             Show this help"
    echo ""
    echo "Targets:  linux-x64  linux-arm64  macos-arm64  macos-x64"
    echo ""
    echo "Output structure:"
    echo "  dist/"
    echo "  ├── linux-arm64/"
    echo "  │   ├── tns-server              (standalone binary)"
    echo "  │   ├── libtns_kernels.so       (probability FFI)"
    echo "  │   ├── libtns_vectors.so       (vector FFI)"
    echo "  │   └── .env                      (config template)"
    echo "  ├── linux-x64/"
    echo "  │   └── ..."
    echo "  └── macos-arm64/"
    echo "      └── ..."
    echo ""
    echo "Examples:"
    echo "  $0 dev              # Development mode"
    echo "  $0 compile          # Compile for current platform"
    echo "  $0 compile linux-x64  # Compile for Linux x86_64"
    echo "  $0 select           # Pick targets interactively"
    echo "  $0 cross            # Build all platforms"
    echo "  $0 info             # Check hardware"
}

# ─────────────────────────────────────────────────────────────
#  Main
# ─────────────────────────────────────────────────────────────

main() {
    local cmd="${1:-help}"
    shift 2>/dev/null || true

    case "$cmd" in
        dev|start|build|test|setup|compile|select|cross|download-bun|info|help)
            ;;
        *)
            err "Unknown command: $cmd"
            usage
            exit 1
            ;;
    esac

    if [[ "$cmd" == "help" ]]; then
        usage
        exit 0
    fi

    detect_hardware
    check_deps
    setup_env

    if [[ "$cmd" == "info" ]]; then
        exit 0
    fi

    install_node_deps

    case "$cmd" in
        setup)
            log "Setup complete"
            ;;
        build)
            typecheck
            build_prod
            ;;
        test)
            RUN_TESTS=true
            typecheck
            run_tests
            ;;
        compile)
            if (( $# > 0 )); then
                compile_target "$1"
            else
                compile_target ""
            fi
            ;;
        select)
            select_targets
            cross_compile_selected "${SELECTED_TARGETS[@]}"
            ;;
        cross)
            cross_compile_selected "${ALL_TARGETS[@]}"
            ;;
        download-bun)
            download_bun_targets
            ;;
        dev)
            MODE=dev
            start_mojo_server
            start_server
            ;;
        start)
            typecheck
            start_mojo_server
            start_server
            ;;
    esac
}

main "$@"
