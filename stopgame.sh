#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$SCRIPT_DIR/.server.pid"

GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m'

stop_pid() {
    local pid=$1
    local cmd
    cmd=$(ps -p "$pid" -o comm= 2>/dev/null || echo "unknown")
    echo -e "  ${CYAN}killing${NC} PID $pid (${cmd})"
}

if [[ ! -f "$PID_FILE" ]]; then
    echo -e "${GREEN}No PID file found. Killing by name...${NC}"
    pkill -f "llama-server.*--port" 2>/dev/null && echo -e "  ${CYAN}killed${NC} llama-server" || true
    pkill -f "bun run.*src/index.ts" 2>/dev/null && echo -e "  ${CYAN}killed${NC} bun (game server)" || true
    pkill -f "tns-server" 2>/dev/null && echo -e "  ${CYAN}killed${NC} tns-server" || true
    echo -e "${GREEN}Done.${NC}"
    exit 0
fi

echo -e "${GREEN}Stopping TrueNeverStory...${NC}"

while read -r pid; do
    if kill -0 "$pid" 2>/dev/null; then
        stop_pid "$pid"
        pkill -P "$pid" 2>/dev/null || true
        kill -TERM "$pid" 2>/dev/null || true
    fi
done < "$PID_FILE"

sleep 2

while read -r pid; do
    if kill -0 "$pid" 2>/dev/null; then
        echo -e "  ${CYAN}force killing${NC} PID $pid"
        pkill -9 -P "$pid" 2>/dev/null || true
        kill -9 "$pid" 2>/dev/null || true
    fi
done < "$PID_FILE"

pkill -f "llama-server.*--port" 2>/dev/null && echo -e "  ${CYAN}killed${NC} llama-server (safety net)" || true
pkill -f "bun run.*src/index.ts" 2>/dev/null && echo -e "  ${CYAN}killed${NC} bun (safety net)" || true

rm -f "$PID_FILE"
echo -e "${GREEN}Stopped.${NC}"
