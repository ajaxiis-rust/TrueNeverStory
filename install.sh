#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
#  TrueNeverStory — Universal Installer
#  Downloads binary + databases from GitHub Releases
# ═══════════════════════════════════════════════════════════════

REPO="ajaxiis-rust/TrueNeverStory"
INSTALL_DIR="$(pwd)"

# ── Colors ────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

log()  { echo -e "${GREEN}[INSTALL]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
err()  { echo -e "${RED}[ERROR]${NC} $*" >&2; }
info() { echo -e "${CYAN}[INFO]${NC} $*"; }

# ── Platform Detection ────────────────────────────────────────

detect_platform() {
    local os arch

    case "$(uname -s)" in
        Linux*)  os="linux" ;;
        Darwin*) os="darwin" ;;
        MINGW*|MSYS*|CYGWIN*) os="windows" ;;
        *) err "Unsupported OS: $(uname -s)"; exit 1 ;;
    esac

    case "$(uname -m)" in
        x86_64|amd64) arch="x64" ;;
        aarch64|arm64) arch="arm64" ;;
        *) err "Unsupported architecture: $(uname -m)"; exit 1 ;;
    esac

    PLATFORM="${os}-${arch}"
    info "Detected platform: ${PLATFORM}"
}

# ── Dependency Check ──────────────────────────────────────────

check_deps() {
    local missing=()

    if ! command -v curl &>/dev/null && ! command -v wget &>/dev/null; then
        missing+=("curl or wget")
    fi

    if ! command -v tar &>/dev/null; then
        missing+=("tar")
    fi

    # Check for unzip on Windows
    if [[ "$PLATFORM" == *"windows"* ]] && ! command -v unzip &>/dev/null; then
        missing+=("unzip")
    fi

    if (( ${#missing[@]} > 0 )); then
        err "Missing dependencies: ${missing[*]}"
        exit 1
    fi
}

# ── Download Helper ───────────────────────────────────────────

download() {
    local url="$1"
    local output="$2"

    if command -v curl &>/dev/null; then
        curl -fsSL "$url" -o "$output"
    elif command -v wget &>/dev/null; then
        wget -q "$url" -O "$output"
    fi
}

# ── Get Latest Release Tag ───────────────────────────────────

get_latest_tag() {
    local tag
    # Get the latest release with a version tag (starting with 'v')
    # Skip the 'databases' release which is marked as Latest
    tag=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases" 2>/dev/null \
        | grep '"tag_name"' | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/' \
        | grep '^v' | head -1)
    echo "$tag"
}

# ── Download Binary ───────────────────────────────────────────

download_binary() {
    local tag="$1"

    log "Downloading tns-server (${tag}, ${PLATFORM})..."

    # Determine archive name based on platform
    local archive_name
    case "$PLATFORM" in
        linux-x64)    archive_name="tns-linux-x64-${tag}.tar.gz" ;;
        linux-arm64)  archive_name="tns-linux-arm64-${tag}.tar.gz" ;;
        darwin-x64)   archive_name="tns-macos-x64-${tag}.tar.gz" ;;
        darwin-arm64) archive_name="tns-macos-arm64-${tag}.tar.gz" ;;
        windows-x64)  archive_name="tns-windows-x64-${tag}.zip" ;;
        *) err "Unsupported platform: $PLATFORM"; exit 1 ;;
    esac

    local url="https://github.com/${REPO}/releases/download/${tag}/${archive_name}"
    local tmp_file="${INSTALL_DIR}/${archive_name}"

    download "$url" "$tmp_file"

    # Extract based on file type
    if [[ "$archive_name" == *.zip ]]; then
        unzip -o "$tmp_file" -d "${INSTALL_DIR}"
        rm -f "$tmp_file"
    else
        tar xzf "$tmp_file" -C "${INSTALL_DIR}"
        rm -f "$tmp_file"
    fi

    # Find and make binary executable
    local binary_path
    binary_path=$(find "${INSTALL_DIR}" -name "tns-server" -o -name "tns-server.exe" | head -1)
    if [[ -n "$binary_path" ]]; then
        chmod +x "$binary_path"
        info "Binary installed: ${binary_path}"
    else
        err "Binary not found after extraction"
        exit 1
    fi
}

# ── Download Database Archive ─────────────────────────────────

download_databases() {
    local tag="${1:-databases}"
    log "Downloading databases (${tag})..."

    local url="https://github.com/${REPO}/releases/download/${tag}/databases.tar.gz"

    if ! download "$url" "${INSTALL_DIR}/databases.tar.gz" 2>/dev/null; then
        warn "databases.tar.gz not found in ${tag}, falling back to 'databases' release"
        url="https://github.com/${REPO}/releases/download/databases/databases.tar.gz"
        download "$url" "${INSTALL_DIR}/databases.tar.gz"
    fi

    info "Archive downloaded: ${INSTALL_DIR}/databases.tar.gz"
}

# ── Extract Databases ─────────────────────────────────────────

extract_databases() {
    if [[ ! -f "${INSTALL_DIR}/databases.tar.gz" ]]; then
        warn "No databases.tar.gz found — skipping"
        return 0
    fi

    log "Extracting databases..."
    tar xzf "${INSTALL_DIR}/databases.tar.gz" -C "${INSTALL_DIR}"

    local count
    count=$(find "${INSTALL_DIR}/data" -name "*.db" -type f 2>/dev/null | wc -l)
    info "Extracted ${count} database files"
}

# ── Download Launcher & Static Files ──────────────────────────

download_assets() {
    local tag="$1"

    log "Downloading launcher and static files..."

    local base_url="https://raw.githubusercontent.com/${REPO}/${tag}"

    # Launcher (only if not already extracted from binary archive)
    if [[ ! -f "${INSTALL_DIR}/startgame.sh" ]]; then
        download "${base_url}/startgame.sh" "${INSTALL_DIR}/startgame.sh"
        chmod +x "${INSTALL_DIR}/startgame.sh"
    fi

    # Environment template
    download "${base_url}/.env.example" "${INSTALL_DIR}/.env.example"

    # README
    for lang in "" ".ru" ".de" ".es" ".fr" ".ja" ".zh"; do
        download "${base_url}/README${lang}.md" "${INSTALL_DIR}/README${lang}.md" 2>/dev/null || true
    done

    # Docs
    mkdir -p "${INSTALL_DIR}/docs"
    for doc in AGENTS.md AGENTS.ru.md AGENTS.de.md AGENTS.es.md AGENTS.fr.md AGENTS.ja.md AGENTS.zh.md \
               API.md API.ru.md ARCHITECTURE.md CHANGELOG.md COMPILE.md; do
        download "${base_url}/docs/${doc}" "${INSTALL_DIR}/docs/${doc}" 2>/dev/null || true
    done

    # Public
    mkdir -p "${INSTALL_DIR}/public"
    for page in index.html settings.html agents.html dashboard.html graph.html models.html \
                providers.html theme-builder.html world-config.html worlds.html; do
        download "${base_url}/public/${page}" "${INSTALL_DIR}/public/${page}" 2>/dev/null || true
    done

    # Static subdirectory
    mkdir -p "${INSTALL_DIR}/public/static"
    download "${base_url}/public/static/theme.css" "${INSTALL_DIR}/public/static/theme.css" 2>/dev/null || true

    # Worlds
    mkdir -p "${INSTALL_DIR}/worlds/default"
    mkdir -p "${INSTALL_DIR}/conf"
    mkdir -p "${INSTALL_DIR}/local-models"

    info "Assets installed"
}

# ── Install llama.cpp ─────────────────────────────────────────

install_llamacpp() {
    log "Installing llama.cpp..."

    local os arch
    case "$(uname -s)" in
        Linux*)  os="linux" ;;
        Darwin*) os="darwin" ;;
        *) warn "Unsupported OS for llama.cpp: $(uname -s)"; return 1 ;;
    esac

    case "$(uname -m)" in
        x86_64|amd64) arch="x64" ;;
        aarch64|arm64) arch="arm64" ;;
        *) warn "Unsupported arch for llama.cpp: $(uname -m)"; return 1 ;;
    esac

    local release="${os}-${arch}"

    # Get latest llama.cpp release tag
    local tag
    tag=$(curl -fsSL "https://api.github.com/repos/ggerganov/llama.cpp/releases/latest" 2>/dev/null \
        | grep '"tag_name"' | head -1 | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/')
    if [[ -z "$tag" ]]; then
        err "Could not determine latest llama.cpp release"
        return 1
    fi

    info "Downloading llama.cpp ${tag} for ${release}..."

    local url="https://github.com/ggerganov/llama.cpp/releases/download/${tag}/llama-${tag}-bin-${release}.zip"
    local tmpdir
    tmpdir=$(mktemp -d)

    if ! curl -fsSL "$url" -o "$tmpdir/llamacpp.zip" 2>/dev/null; then
        err "Failed to download llama.cpp"
        rm -rf "$tmpdir"
        return 1
    fi

    unzip -qo "$tmpdir/llamacpp.zip" -d "$tmpdir/" 2>/dev/null

    # Copy binaries to local-models/ (portable, no sudo needed)
    local bin_dir="${INSTALL_DIR}/local-models"
    mkdir -p "$bin_dir"

    for bin in llama-server llama-cli; do
        local src
        src=$(find "$tmpdir" -name "$bin" -type f 2>/dev/null | head -1)
        if [[ -n "$src" ]]; then
            cp -f "$src" "$bin_dir/$bin"
            chmod +x "$bin_dir/$bin"
        fi
    done

    rm -rf "$tmpdir"

    if [[ -x "$bin_dir/llama-server" ]]; then
        info "llama.cpp installed to ${bin_dir}/llama-server"
    else
        warn "llama-server not found in archive"
    fi
}

# ── Update Mode ───────────────────────────────────────────────

update_databases() {
    log "Updating databases..."

    download_databases
    extract_databases

    info "Databases updated"
}

# ── Full Install ──────────────────────────────────────────────

full_install() {
    local tag
    tag=$(get_latest_tag)
    if [[ -z "$tag" ]]; then
        err "Could not determine latest release tag"
        exit 1
    fi
    info "Latest release: ${tag}"

    download_binary "$tag"
    download_databases "$tag"
    extract_databases
    download_assets "$tag"

    # Ask about llama.cpp
    echo ""
    echo -e "${BOLD}Install llama.cpp (local LLM server)?${NC}"
    echo -e "  Enables running AI models locally without external API."
    echo -e "  Requires ~500MB disk space for the binary."
    echo ""
    read -rp "Install llama.cpp? [y/N] " -n 1 answer
    echo ""
    if [[ "$answer" =~ ^[Yy]$ ]]; then
        install_llamacpp
    else
        info "Skipped llama.cpp installation"
        info "You can install later: bash install.sh --llamacpp"
    fi

    echo ""
    log "Installation complete!"
    echo ""
    info "Run: ./startgame.sh"
    info "Or:  ./tns-server"
}

# ── Usage ─────────────────────────────────────────────────────

usage() {
    echo -e "${BOLD}TrueNeverStory Installer${NC}"
    echo ""
    echo "Usage: $0 [OPTION]"
    echo ""
    echo "Options:"
    echo "  (none)        Full install — binary + databases + assets"
    echo "  --update      Update databases only"
    echo "  --bin-only    Download binary only"
    echo "  --help        Show this help"
    echo ""
    echo "Examples:"
    echo "  curl -fsSL https://raw.githubusercontent.com/${REPO}/main/install.sh | bash"
    echo "  bash install.sh"
    echo "  bash install.sh --update"
}

# ── Main ──────────────────────────────────────────────────────

main() {
    local cmd="${1:-}"

    case "$cmd" in
        --help|-h)
            usage
            exit 0
            ;;
        --update)
            detect_platform
            check_deps
            update_databases
            ;;
        --bin-only)
            detect_platform
            check_deps
            local tag
            tag=$(get_latest_tag)
            download_binary "$tag"
            ;;
        "")
            detect_platform
            check_deps
            full_install
            ;;
        *)
            err "Unknown option: $cmd"
            usage
            exit 1
            ;;
    esac
}

main "$@"
